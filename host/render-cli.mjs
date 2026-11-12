import {createServer} from 'node:http';
import {createWorkbench} from './index.mjs';
const flags=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(v.startsWith('--'))a.push([v.slice(2),all[i+1]]);return a;},[]));
const app=createWorkbench(),items=await app.store.list(),id=flags.id||items[0]?.id;
if(!id)throw new Error('没有可导出的项目：先在工作台新建并编排');
const server=createServer(app.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,p=await app.store.read(id);
try{
 const job=await app.renders.start(id,p.revision,origin,{...(flags.width?{width:Number(flags.width)}:{}),...(flags.height?{height:Number(flags.height)}:{}),...(flags.fps?{fps:Number(flags.fps)}:{})});
 await new Promise((resolve,reject)=>{const interval=setInterval(async()=>{const j=(await app.renders.list(id)).find(x=>x.id===job.id);console.log(`${Math.round(j.progress*100)}% ${j.message}`);if(['completed','failed','cancelled'].includes(j.status)){clearInterval(interval);if(j.status==='completed'){console.log(app.store.dir(id)+'/'+j.file);resolve();}else reject(new Error(j.error||j.status));}},1500);});
}catch(e){console.error(e.message);process.exitCode=1;}finally{app.renders.dispose();server.closeAllConnections();server.close();}
