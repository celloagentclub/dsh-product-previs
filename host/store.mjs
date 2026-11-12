import {mkdir,readdir,readFile,writeFile,rename,realpath,stat} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {homedir} from 'node:os';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {emptyProject,objectsForModel} from './demo.mjs';
const clone=structuredClone;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const DEFAULT_ROOT=join(homedir(),'Desktop','产品白模预演');
export async function atomicJson(file,value){const tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2)+'\n');await rename(tmp,file);}
export class ProjectStore {
 constructor(root=DEFAULT_ROOT){this.root=resolve(root);this.events=new EventEmitter();this.queues=new Map();this.events.setMaxListeners(100);}
 id(id){if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw fail('项目 ID 无效');return id;}
 dir(id){return join(this.root,this.id(id));}
 async init(){await mkdir(this.root,{recursive:true});}
 async read(id){const file=join(this.dir(id),'project.json');let p;try{p=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')throw fail('项目不存在',404);throw e;}if(p.schemaVersion!==2)throw fail('项目版本不兼容，请使用新项目');return p;}
 async list(){await this.init();const es=await readdir(this.root,{withFileTypes:true});const out=[];for(const e of es){if(!e.isDirectory()||e.name.startsWith('.'))continue;try{const p=await this.read(e.name);out.push({id:p.id,name:p.name,revision:p.revision,fps:p.fps,durationFrames:p.durationFrames,width:p.width,height:p.height,objectCount:p.objects.length,shotCount:p.shots.length,updatedAt:p.updatedAt});}catch{}}return out.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
 async create(name){if(typeof name!=='string'||name.length>120)throw fail('项目名称需要 1–120 个字');const p=emptyProject(name.trim()||'未命名预演');await this.install(p);return p;}
 async install(p){await this.init();this.id(p.id);const dir=this.dir(p.id);await mkdir(join(dir,'assets'),{recursive:true});await mkdir(join(dir,'output'),{recursive:true});await atomicJson(join(dir,'project.json'),p);return p;}
 serial(id,fn){const tail=this.queues.get(id)||Promise.resolve();const next=tail.catch(()=>{}).then(fn);this.queues.set(id,next);return next.finally(()=>{if(this.queues.get(id)===next)this.queues.delete(id);});}
 async mutate(id,expectedRevision,fn,label='修改'){
  return this.serial(id,async()=>{const before=await this.read(id);if(!Number.isInteger(expectedRevision)||expectedRevision!==before.revision)throw fail(`项目已更新（当前版本 ${before.revision}），请读取最新项目后重试`,409);
   const next=await fn(clone(before));if(!next||next.id!==id)throw fail('命令不能更改项目 ID');
   const {validateProject}=await import('./generated-core.mjs');const errors=validateProject(next);if(errors.length)throw fail(errors.join('\n'));
   const dir=this.dir(id);let h=await this.history(id);h.undo.push({label,project:before});h.undo=h.undo.slice(-50);h.redo=[];
   next.revision=before.revision+1;next.updatedAt=new Date().toISOString();await atomicJson(join(dir,'.history.json'),h);await atomicJson(join(dir,'project.json'),next);this.events.emit(id,{revision:next.revision});return next;
  });
 }
 async commands(id,expectedRevision,commands){if(!Array.isArray(commands)||!commands.length||commands.length>200)throw fail('一次提交 1–200 条命令');const {applyCommands}=await import('./generated-core.mjs');return this.mutate(id,expectedRevision,p=>applyCommands(p,commands),commands.map(c=>c.type).slice(0,3).join(' · '));}
 async history(id){try{return JSON.parse(await readFile(join(this.dir(id),'.history.json'),'utf8'));}catch{return{undo:[],redo:[]};}}
 async historyState(id){await this.read(id);const h=await this.history(id);return{canUndo:h.undo.length>0,canRedo:h.redo.length>0};}
 async undoRedo(id,revision,action){return this.serial(id,async()=>{const p=await this.read(id);if(p.revision!==revision)throw fail('版本已变化，请刷新后重试',409);const h=await this.history(id),from=action==='undo'?h.undo:h.redo,to=action==='undo'?h.redo:h.undo;const item=from.pop();if(!item)throw fail(action==='undo'?'没有可撤销的修改':'没有可重做的修改');to.push({label:item.label,project:p});const next=clone(item.project);next.revision=p.revision+1;next.updatedAt=new Date().toISOString();await atomicJson(join(this.dir(id),'.history.json'),h);await atomicJson(join(this.dir(id),'project.json'),next);this.events.emit(id,{revision:next.revision});return next;});}
 async addAsset(id,revision,asset){return this.mutate(id,revision,p=>{if(p.assets.some(a=>a.id===asset.id))return p;p.assets.push(asset);if(asset.kind==='model'){
   const objs=objectsForModel(asset);let k=1;const suffix=p.objects.some(o=>o.id==='product')?'-'+asset.id.slice(-6):'';for(const o of objs){o.id+=suffix;o.name=suffix?asset.name+' · '+o.name:o.name;}p.objects.push(...objs);
   if(p.assets.filter(a=>a.kind==='model').length===1){const b=asset.bounds,center=b.min.map((v,i)=>(v+b.max[i])/2),size=Math.max(...b.max.map((v,i)=>v-b.min[i])),pose={position:[center[0]+size,center[1]+size*.6,center[2]+size*1.6],target:center,focalLength:40,focusDistance:size*2,aperture:8};p.shots[0].camera.from=pose;p.shots[0].camera.to=clone(pose);p.shots[0].description='产品建立镜头，可在三维视口设置起终点。';}
  }return p;},'导入素材');}
 async assetFile(id,file){if(typeof file!=='string'||file.includes('\0')||file.split(/[/\\]/).some(x=>x==='..'||x.startsWith('.'))||!file.startsWith('assets/'))throw fail('素材路径不合法');const base=await realpath(join(this.dir(id),'assets'));const full=await realpath(join(this.dir(id),file));if(!full.startsWith(base+sep))throw fail('素材不能越过项目目录',403);const s=await stat(full);if(!s.isFile())throw fail('素材不是文件');return full;}
}
