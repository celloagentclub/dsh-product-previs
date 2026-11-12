import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {atomicJson} from './store.mjs';
const worker=fileURLToPath(new URL('./render-worker.mjs',import.meta.url));
/** Users need one readable sentence, not a renderer stack trace in the panel. */
const lastLine=text=>{if(!text)return '';const lines=String(text).split('\n').map(x=>x.trim()).filter(Boolean);const message=lines.find(x=>!x.startsWith('at ')&&!/^\w*Error:?$/.test(x))||lines[0]||'';return message.replace(/\s+at\s+.*$/,'').slice(0,240);};
function nodeExe(){if(/(?:^|\/)node(?:\.exe)?$/.test(process.execPath))return process.execPath;for(const p of [join(homedir(),'.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node'),join(homedir(),'local/node/bin/node'),'/opt/homebrew/bin/node'])if(existsSync(p))return p;throw new Error('未找到 Node.js 渲染运行时');}
export class RenderJobs {
 constructor(store){this.store=store;this.jobs=new Map();this.children=new Map();this.loadedProjects=new Set();this.starting=false;}
 async list(projectId){if(projectId)this.store.id(projectId);if(projectId&&!this.loadedProjects.has(projectId)){this.loadedProjects.add(projectId);try{const dir=join(this.store.dir(projectId),'output');for(const f of await readdir(dir))if(/^job-[\w-]+\.json$/.test(f)){const j=JSON.parse(await readFile(join(dir,f),'utf8'));if(this.jobs.has(j.id))continue;if(['rendering','queued'].includes(j.status)){j.status='failed';j.error='宿主重启中断了渲染，请重新导出';}
     // Older records stored raw renderer stack traces; normalise them on read.
     if(j.status==='cancelled'){j.error=undefined;j.message='已取消';}
     // An older build recorded a deliberate stop as a failure with the renderer's stack trace.
     else if(j.error&&/got cancelled/i.test(j.error)){j.status='cancelled';j.error=undefined;j.message='已取消';}
     else if(j.error&&String(j.error).includes('\n'))j.error=lastLine(j.error);
     this.jobs.set(j.id,j);}}catch{}}const rows=[...this.jobs.values()].filter(j=>!projectId||j.projectId===projectId);
  // Terminal tasks are history: keep them in sync with disk so a long-running host never serves a stale verdict.
  await Promise.all(rows.filter(j=>!['queued','rendering'].includes(j.status)).map(async j=>{try{
    const disk=JSON.parse(await readFile(join(this.store.dir(j.projectId),'output',`${j.id}.json`),'utf8'));
    // Only a terminal record on disk may override memory; a live job never inherits a stale "still rendering".
    if(disk&&disk.id===j.id&&!['queued','rendering'].includes(disk.status))Object.assign(j,disk);
  }catch{}}));
  return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 async persist(j){await atomicJson(join(this.store.dir(j.projectId),'output',`${j.id}.json`),j);}
 async start(...args){if(this.starting)throw Object.assign(new Error('另一个导出请求正在准备，请稍后重试'),{status:409});this.starting=true;try{return await this._start(...args);}finally{this.starting=false;}}
 async _start(id,revision,origin,options={}){
  const project=await this.store.read(id);if(project.revision!==revision)throw Object.assign(new Error('项目已更新，请刷新后导出'),{status:409});
  const {validateProject,evaluateProject}=await import('./generated-core.mjs');const errors=validateProject(project);if(errors.length)throw new Error(errors.join('\n'));if(!project.shots.length)throw new Error('先添加至少一个镜头');
  if((await this.list()).some(j=>j.status==='rendering'||j.status==='queued'))throw Object.assign(new Error('已有一个导出任务运行中，请等完成或取消后继续'),{status:409});
  for(const shot of project.shots){evaluateProject(project,shot.start);}
  for(const asset of project.assets)await this.store.assetFile(id,asset.file);
  const width=options.width??project.width,height=options.height??Math.round(width*project.height/project.width),fps=options.fps??project.fps;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width%2||height%2||width<320||height<240||width>3840||height>3840||![12,24,25,30,48,50,60].includes(fps))throw new Error('导出尺寸须为偶数，宽 320–3840、高 240–3840；帧率支持 12/24/25/30/48/50/60');
  const jobId='job-'+randomUUID().slice(0,12),dir=join(this.store.dir(id),'output');await mkdir(dir,{recursive:true});
  const j={id:jobId,projectId:id,revision:project.revision,status:'queued',progress:0,message:'排队准备',createdAt:new Date().toISOString(),width,height,fps};this.jobs.set(j.id,j);await this.persist(j);
  const cfg={project:{...project,width,height,fps,durationFrames:Math.ceil(project.durationFrames*fps/project.fps)},sourceFps:project.fps,assetBase:`${origin}/product-previs/asset?id=${encodeURIComponent(id)}`,output:join(dir,`${jobId}.mp4`)};
  // Preserve original authored frame domain when render fps differs. Composition frame evaluator sees original fps/duration.
  cfg.renderDurationFrames=cfg.project.durationFrames;cfg.project={...project,width,height};cfg.outputFps=fps;
  const input=join(dir,`${jobId}.input.json`);await atomicJson(input,cfg);const child=spawn(nodeExe(),[worker,input],{stdio:['ignore','pipe','pipe'],env:{...process.env},detached:false});this.children.set(jobId,child);j.status='rendering';j.message='启动三维渲染器';let pending='',stderr='';
  child.stdout.on('data',buf=>{pending+=buf.toString();let nl;while((nl=pending.indexOf('\n'))>=0){const line=pending.slice(0,nl);pending=pending.slice(nl+1);try{const v=JSON.parse(line);if(v.error){const clean=lastLine(v.error);if(clean&&!/got cancelled/i.test(clean))j.error=clean;}if(v.progress!==undefined){j.progress=v.progress;j.message=v.message||j.message;}if(v.completed){j.status='completed';j.file=`output/${jobId}.mp4`;}this.store.events.emit('render:'+id,j);}catch{}}});
  child.stderr.on('data',buf=>{stderr=(stderr+buf.toString()).slice(-6000);});
  // A cancelled task must never surface the renderer's internal cancellation error.
  const stripOnCancel=()=>{if(j.status==='cancelled'){j.error=undefined;j.message='已取消';}};
  child.on('error',async e=>{j.status='failed';j.error=e.message;j.message='启动失败';this.children.delete(jobId);await this.persist(j);});
  child.on('close',async code=>{if(j.status!=='cancelled'&&j.status!=='completed'){j.status='failed';j.message='导出失败';j.error=lastLine(j.error)||lastLine(stderr)||`渲染退出码 ${code}`;}stripOnCancel();this.children.delete(jobId);await this.persist(j);this.store.events.emit('render:'+id,j);});
  return {...j};
 }
 async cancel(id){const j=this.jobs.get(id);if(!j)throw Object.assign(new Error('任务不存在'),{status:404});if(!['queued','rendering'].includes(j.status))return{...j};
  // A restored job can still say rendering with no live child; it must still be cancellable.
  j.status='cancelled';j.message='已取消';j.error=undefined;const child=this.children.get(id);
  if(child){child.kill('SIGTERM');const t=setTimeout(()=>{if(this.children.has(id))child.kill('SIGKILL');},5000);t.unref();}
  this.children.delete(id);await this.persist(j);this.store.events.emit('render:'+j.projectId,j);return{...j};}
 dispose(){for(const child of this.children.values())child.kill('SIGTERM');}
}
