import {readFile,mkdir,writeFile,realpath,stat,unlink} from 'node:fs/promises';
import {createReadStream,existsSync} from 'node:fs';
import {join,extname,resolve,sep,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {homedir,tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {ProjectStore,DEFAULT_ROOT} from './store.mjs';
import {importAsset,DEFAULT_ASSET_ROOT} from './assets.mjs';
import {RenderJobs} from './jobs.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const name='dsh-product-previs';
export const inject=['webServer','tools'];
export const BASE='/product-previs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const json=(res,status,v)=>{const b=JSON.stringify(v);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(b)});res.end(b);};
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.map':'application/json','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.woff2':'font/woff2'};
async function bytes(req,max=16*1024*1024){const cs=[];let n=0;for await(const c of req){n+=c.length;if(n>max)throw fail('请求体过大',413);cs.push(c);}return Buffer.concat(cs);}
async function body(req){if(!/^application\/json\b/.test(req.headers['content-type']||''))throw fail('需要 JSON 请求',415);const b=await bytes(req);try{return JSON.parse(b.toString()||'{}');}catch{throw fail('JSON 解析失败');}}
async function file(req,res,path){const s=await stat(path);if(!s.isFile())throw fail('文件不存在',404);const headers={'Content-Type':MIME[extname(path)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache',...(typeof req.headers.origin==='string'&&/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin)?{'Access-Control-Allow-Origin':req.headers.origin,'Vary':'Origin'}:{})};const range=req.headers.range;
 if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m)throw fail('无效 Range',416);let start=m[1]?Number(m[1]):Math.max(0,s.size-Number(m[2])),end=m[1]&&m[2]?Math.min(Number(m[2]),s.size-1):s.size-1;if(start>end||start>=s.size){res.writeHead(416,{'Content-Range':`bytes */${s.size}`});return res.end();}res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${s.size}`});if(req.method==='HEAD')return res.end();return createReadStream(path,{start,end}).pipe(res);}
 res.writeHead(200,{...headers,'Content-Length':s.size});if(req.method==='HEAD')return res.end();createReadStream(path).pipe(res);
}
export function createWorkbench({root=DEFAULT_ROOT,allowedAssetRoots=[DEFAULT_ASSET_ROOT],origin}={}){
 const store=new ProjectStore(root),renders=new RenderJobs(store),selection=new Map();
 const originOf=req=>origin||`http://127.0.0.1:${Number(new URL('http://'+(req.headers.host||'127.0.0.1')).port)||80}`;
 const getProject=id=>store.read(id);
 const handler=async(req,res)=>{const u=new URL(req.url||'/',origin||'http://localhost');let rest;
 try{rest=decodeURIComponent(u.pathname.slice(BASE.length))||'/';}catch{return json(res,400,{ok:false,error:'URL 无效'});}
 try{
  if(['GET','HEAD'].includes(req.method)){
   const id=u.searchParams.get('id');
   if(rest==='/api/projects')return json(res,200,{ok:true,projects:await store.list()});
   if(rest==='/api/project')return json(res,200,{ok:true,project:await getProject(id)});
   if(rest==='/api/history')return json(res,200,{ok:true,...await store.historyState(id)});
   if(rest==='/api/context') {const p=await getProject(id);return json(res,200,{ok:true,project:p,selection:selection.get(id)||null,notes:['时间以整数帧表示，米制坐标、Y向上','修改必须携带 expectedRevision，并通过 commands 提交','关节范围是导演预演配置，非工程认证范围']});}
   if(rest==='/api/renders')return json(res,200,{ok:true,jobs:await renders.list(id)});
   if(rest==='/api/events'){
    await store.read(id);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.write('event: ready\ndata: {}\n\n');
    const listener=v=>res.write(`event: project\ndata: ${JSON.stringify(v)}\n\n`);store.events.on(id,listener);const ping=setInterval(()=>res.write(': keepalive\n\n'),20000);ping.unref();req.on('close',()=>{clearInterval(ping);store.events.off(id,listener);});return;
   }
   if(rest==='/asset')return file(req,res,await store.assetFile(id,u.searchParams.get('file')));
   if(rest==='/output'){
    const pid=u.searchParams.get('project'),jid=u.searchParams.get('job');await store.read(pid);const job=(await renders.list(pid)).find(j=>j.id===jid);if(!job||job.status!=='completed')throw fail('导出文件未就绪',404);return file(req,res,join(store.dir(pid),'output',job.id+'.mp4'));
   }
   if(rest==='/'||rest==='/index.html'||rest.startsWith('/assets/')){
    const rel=rest==='/'?'index.html':rest.slice(1);if(rel.split('/').some(p=>p.startsWith('.')||p==='..'))throw fail('路径无效',403);const path=join(ROOT,'dist',rel);if(!existsSync(path))throw fail('工作台尚未构建，请运行 npm run build',503);return file(req,res,path);
   }
   throw fail('接口不存在',404);
  }
  if(req.method!=='POST')throw fail('不支持的请求方法',405);
  const requestOrigin=req.headers.origin;if(requestOrigin){let host;try{host=new URL(requestOrigin).host;}catch{}if(host!==req.headers.host)throw fail('仅接受同源修改请求',403);}
  if(rest==='/api/assets/upload'){
   const id=u.searchParams.get('id'),p=await store.read(id),rev=Number(u.searchParams.get('expectedRevision'));if(rev!==p.revision)throw fail('项目已更新，请刷新后重新上传',409);
   const type=req.headers['content-type']||'',m=/boundary=(?:"([^"]+)"|([^;]+))/.exec(type);if(!m)throw fail('需要 multipart 文件');const b=await bytes(req,512*1024*1024),boundary=Buffer.from('--'+(m[1]||m[2]));let at=b.indexOf(boundary),upload;
   while(at>=0){const start=at+boundary.length,next=b.indexOf(boundary,start);if(next<0)break;const seg=b.subarray(start,next),cut=seg.indexOf('\r\n\r\n');if(cut>=0){const h=seg.subarray(0,cut).toString(),fn=/filename="([^"]+)"/.exec(h);if(fn){upload={name:basename(fn[1]),data:seg.subarray(cut+4,seg.length-2)};break;}}at=next;}
   if(!upload)throw fail('没有收到文件');const path=join(tmpdir(),`previs-upload-${randomUUID()}${extname(upload.name).toLowerCase()}`);try{await writeFile(path,upload.data);const asset=await importAsset(store.dir(id),path,[tmpdir()]);asset.name=upload.name;const project=await store.addAsset(id,rev,asset);return json(res,200,{ok:true,project,asset});}finally{await unlink(path).catch(()=>{});}
  }
  const b=await body(req);
  if(rest==='/api/projects')return json(res,200,{ok:true,project:await store.create(b.name||'未命名预演')});
  if(rest==='/api/commands')return json(res,200,{ok:true,project:await store.commands(b.id,b.expectedRevision,b.commands)});
  if(rest==='/api/undo'||rest==='/api/redo')return json(res,200,{ok:true,project:await store.undoRedo(b.id,b.expectedRevision,rest.endsWith('undo')?'undo':'redo')});
  if(rest==='/api/selection'){const p=await store.read(b.id);const selected={objectId:typeof b.objectId==='string'&&p.objects.some(o=>o.id===b.objectId)?b.objectId:null,partId:typeof b.partId==='string'&&p.assets.some(a=>a.kind==='model'&&a.parts.some(x=>x.id===b.partId))?b.partId:null,frame:Number.isInteger(b.frame)?Math.max(0,Math.min(b.frame,p.durationFrames-1)):0,shotId:typeof b.shotId==='string'?b.shotId:null};selection.set(b.id,selected);return json(res,200,{ok:true,selection:selected});}
  if(rest==='/api/assets/import'){const p=await store.read(b.id),rev=b.expectedRevision??p.revision;if(rev!==p.revision)throw fail('项目已更新，请刷新后重新导入',409);const asset=await importAsset(store.dir(b.id),b.path,[...allowedAssetRoots,store.root]);const project=await store.addAsset(b.id,rev,asset);return json(res,200,{ok:true,project,asset});}
  if(rest==='/api/renders')return json(res,200,{ok:true,job:await renders.start(b.id,b.expectedRevision,originOf(req),b)});
  if(rest==='/api/renders/cancel')return json(res,200,{ok:true,job:await renders.cancel(b.jobId)});
  throw fail('接口不存在',404);
 }catch(e){if(res.headersSent){res.end();return;}json(res,e.status||400,{ok:false,error:e.message||String(e)});}
 };
 return{store,renders,selection,handler};
}
export async function apply(ctx,config={}){
 const workbench=createWorkbench({root:config.root||DEFAULT_ROOT,allowedAssetRoots:config.allowedAssetRoots||[DEFAULT_ASSET_ROOT],origin:`http://127.0.0.1:${ctx.webServer.port}`});await workbench.store.init();
 ctx.effect(()=>ctx.webServer.register({kind:'prefix',path:BASE,handler:workbench.handler}));ctx.effect(()=>()=>workbench.renders.dispose());
 const req=createRequire(join(process.env.DSH_PROFILE_DIR||join(homedir(),'.dsh/profiles/desktop'),'package.json'));
 const {defineTool}=await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-tools')).href);
 const out={schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]};
 const tool=(name,description,parameters,execute)=>ctx.tools.register(defineTool({name,description,parameters,output:out,async execute(a){return JSON.stringify(await execute(a),null,2);}}));
 tool('previs_project','产品白模预演项目：list 列项目；open 读场景、部件、镜头、动作及当前选择；create 新建。使用本工作台预演动作和运镜，导出白模 MP4，后续用户自行交给 Seedance。',{action:{type:'string',enum:['list','open','create']},id:{type:'string'},name:{type:'string'}},async a=>{if(a.action==='list')return{projects:await workbench.store.list()};if(a.action==='create')return{project:await workbench.store.create(a.name||'未命名预演')};return{project:await workbench.store.read(a.id),selection:workbench.selection.get(a.id)||null};});
 tool('previs_apply','原子修改产品白模预演。先 open 读取 revision。commands 为共享白名单：object.*、shot.*、track.*、keyframe.set、rig.set、project.update、film.set、sequence.*、audio.set、arm.action、camera.apply、timeline.align。镜头 kind 为 3d 或 broll-code。arm.action 取 unfold/fold/rise/lower/follow-face/portrait/landscape/nod/cable-tuck/hold。camera.apply 用命名运镜（slow-pull、locked、orbit、crane、macro、handheld、over-shoulder）和构图预设，不要手填米数。时间是整数帧、坐标米制、旋转角度。409 后重读。',{id:{type:'string'},expectedRevision:{type:'number'},commands:{type:'array',items:{type:'object',additionalProperties:true}}},async a=>({project:await workbench.store.commands(a.id,a.expectedRevision,a.commands)}));
 tool('previs_asset','导入已授权本地目录的 GLB/图片/视频。GLB 生成白模资源并保留源文件与层级；返回部件ID、米制尺寸和项目revision。对于新的可动产品，先按真实结构用 rig.set 校准关节轴心/轴向/范围，不猜工程极限。',{id:{type:'string'},path:{type:'string'},expectedRevision:{type:'number'}},async a=>{const p=await workbench.store.read(a.id),asset=await importAsset(workbench.store.dir(a.id),a.path,[DEFAULT_ASSET_ROOT,workbench.store.root]);return{asset,project:await workbench.store.addAsset(a.id,a.expectedRevision??p.revision,asset)};});
 tool('previs_frame','只读检查指定帧的摄像机、产品部件矩阵、关节角、人偶姿态。所有动作由绝对帧求值，适合排查跳帧和机位对齐。',{id:{type:'string'},frame:{type:'number'}},async a=>{const {evaluateProject}=await import('./generated-core.mjs');return evaluateProject(await workbench.store.read(a.id),a.frame);});
 tool('previs_history','撤销或重做产品预演的上一批修改，保留新revision。',{id:{type:'string'},expectedRevision:{type:'number'},action:{type:'string',enum:['undo','redo']}},a=>workbench.store.undoRedo(a.id,a.expectedRevision,a.action));
 tool('previs_render','完整白模 MP4 导出：start 创建Remotion后台任务、list/status读状态和进度、cancel取消。编辑器/导出共用同一三维求值核心。完成文件为项目output/job-*.mp4，随后使用display_file或present交付。',{action:{type:'string',enum:['start','list','status','cancel']},id:{type:'string'},jobId:{type:'string'},expectedRevision:{type:'number'},width:{type:'number'},height:{type:'number'},fps:{type:'number'}},async a=>{if(a.action==='cancel')return workbench.renders.cancel(a.jobId);if(a.action==='start')return workbench.renders.start(a.id,a.expectedRevision,`http://127.0.0.1:${ctx.webServer.port}`,a);const jobs=await workbench.renders.list(a.id);return a.action==='status'?jobs.find(j=>j.id===a.jobId)||{error:'任务不存在'}:{jobs};});
 ctx.logger?.info?.('产品白模预演工作台已就绪：%s',BASE);
}
