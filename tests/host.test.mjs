import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {ProjectStore} from '../host/store.mjs';
import {RenderJobs} from '../host/jobs.mjs';
import {createWorkbench,BASE} from '../host/index.mjs';
import {parseGlb,whiteGlb,modelMetadata,checkedSource} from '../host/assets.mjs';
async function temp(t){const p=await mkdtemp(join(tmpdir(),'product-previs-test-'));t.after(async()=>{assert.ok(resolve(p).startsWith(resolve(tmpdir())+'/product-previs-test-'));await rm(p,{recursive:true,force:true});});return p;}
test('atomic revisions, simultaneous edits, persistent undo and redo',async t=>{
 const store=new ProjectStore(await temp(t)),p=await store.create('测试');const results=await Promise.allSettled([store.commands(p.id,1,[{type:'project.update',patch:{name:'A'}}]),store.commands(p.id,1,[{type:'project.update',patch:{name:'B'}}])]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);let current=await store.read(p.id);assert.equal(current.revision,2);assert.equal(current.name,'A');
 await assert.rejects(()=>store.commands(p.id,2,[{type:'project.update',patch:{durationFrames:-10}}]));assert.equal((await store.read(p.id)).revision,2);
 current=await store.undoRedo(p.id,2,'undo');assert.equal(current.name,'测试');assert.equal(current.revision,3);current=await store.undoRedo(p.id,3,'redo');assert.equal(current.name,'A');assert.equal(current.revision,4);
 const again=new ProjectStore(store.root);assert.equal((await again.read(p.id)).name,'A');assert.equal((await again.historyState(p.id)).canUndo,true);
});
test('HTTP host JSON, security, range support and absent outputs',async t=>{
 const root=await temp(t),work=createWorkbench({root}),server=createServer(work.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{work.renders.dispose();server.closeAllConnections();server.close();});const url=`http://127.0.0.1:${server.address().port}${BASE}`;
 const post=(path,data,origin)=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(data)});
 let r=await post('/api/projects',{name:'场景'});assert.equal(r.status,200);const {project:p}=await r.json();
 r=await post('/api/commands',{id:p.id,expectedRevision:1,commands:[{type:'project.update',patch:{name:'新场景'}}]},'https://untrusted.example');assert.equal(r.status,403);
 r=await post('/api/commands',{id:p.id,expectedRevision:1,commands:[{type:'project.update',patch:{name:'新场景'}}]});assert.equal(r.status,200);
 r=await post('/api/commands',{id:p.id,expectedRevision:1,commands:[{type:'project.update',patch:{name:'错误覆盖'}}]});assert.equal(r.status,409);
 await writeFile(join(work.store.dir(p.id),'assets','sample.glb'),Buffer.from('0123456789'));
 r=await fetch(url+'/asset?id='+p.id+'&file=assets%2Fsample.glb',{headers:{Range:'bytes=2-5'}});assert.equal(r.status,206);assert.equal(await r.text(),'2345');
 r=await fetch(url+'/asset?id='+p.id+'&file=assets%2F..%2Fproject.json');assert.equal(r.status,400);
 r=await fetch(url+'/output?project='+p.id+'&job=not-found');assert.equal(r.status,404);
 r=await post('/api/selection',{id:p.id,objectId:'floor',frame:100,shotId:'shot-01'});assert.equal(r.status,200);r=await fetch(url+'/api/context?id='+p.id);assert.equal((await r.json()).selection.objectId,'floor');
});
test('GLB white preview preserves source transforms, strips images and repacks geometry',async()=>{
 const buf=Buffer.alloc(48);[-1,0,0,1,0,0,0,1,0].forEach((v,i)=>buf.writeFloatLE(v,i*4));Buffer.from([7,7,7,7]).copy(buf,36);
 const d={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'part',mesh:0,translation:[1,2,3],scale:[.001,.001,.001]}],meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},material:0}]}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC2'}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:40,byteLength:8},{buffer:0,byteOffset:36,byteLength:4}],buffers:[{byteLength:48}],images:[{bufferView:2,mimeType:'image/png'}],textures:[{source:0}],materials:[{}]};
 const result=whiteGlb(d,buf),parsed=parseGlb(result);assert.equal(parsed.doc.images,undefined);assert.equal(parsed.doc.nodes[0].extras._previsIndex,0);assert.deepEqual(parsed.doc.nodes[0].scale,[.001,.001,.001]);assert.equal(parsed.bin.length,36);assert.equal(parsed.doc.meshes[0].primitives[0].attributes.TEXCOORD_0,undefined);
 const meta=modelMetadata(parsed.doc,parsed.bin);assert.equal(meta.triangles,1);assert.equal(meta.parts.length,1);assert.deepEqual(meta.bounds.min,[.999,2,3]);assert.deepEqual(meta.bounds.max,[1.001,2.001,3]);
});
test('render history never marks its own running jobs as interrupted',async t=>{
 const store=new ProjectStore(await temp(t)),p=await store.create('渲染'),manager=new RenderJobs(store);
 const live={id:'job-live',projectId:p.id,status:'rendering',progress:.3,createdAt:new Date().toISOString()};manager.jobs.set(live.id,live);await manager.persist(live);
 assert.equal((await manager.list(p.id))[0].status,'rendering');
 const restarted=new RenderJobs(store);assert.equal((await restarted.list(p.id))[0].status,'failed');
 const p2=await store.create('第二项目'),done={id:'job-done',projectId:p2.id,status:'completed',progress:1,createdAt:new Date().toISOString()};await manager.persist(done);assert.equal((await manager.list(p2.id))[0].status,'completed');
});
test('source assets require explicit allowed directory and valid GLB header',async t=>{
 const root=await temp(t);await mkdir(join(root,'allowed'));const p=join(root,'outside.png');await writeFile(p,'test');await assert.rejects(()=>checkedSource(p,[join(root,'allowed')]));assert.equal(await checkedSource(p,[root]),await (await import('node:fs/promises')).realpath(p));assert.throws(()=>parseGlb(Buffer.from('invalid')));
});
