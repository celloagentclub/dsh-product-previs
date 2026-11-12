import {readFile,writeFile,mkdir,copyFile,realpath,stat} from 'node:fs/promises';
import {join,extname,basename,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {Matrix4,Vector3,Quaternion,Box3} from 'three';

export const DEFAULT_MODEL=process.env.PREVIS_MODEL||'';
export const DEFAULT_ASSET_ROOT=process.env.PREVIS_ASSET_ROOT||'';
const JSON_CHUNK=0x4e4f534a,BIN_CHUNK=0x004e4942;
const MAX_BYTES=512*1024*1024;
const padded=(n)=>Math.ceil(n/4)*4;
export function parseGlb(data){
 if(data.length<20||data.toString('ascii',0,4)!=='glTF'||data.readUInt32LE(4)!==2)throw new Error('需要 glTF 2.0 的 .glb 文件');
 const length=data.readUInt32LE(8);if(length!==data.length)throw new Error('GLB 文件长度不完整');
 let doc,bin;for(let at=12;at+8<=length;){const n=data.readUInt32LE(at),kind=data.readUInt32LE(at+4);at+=8;if(at+n>length)throw new Error('GLB 数据块越界');if(kind===JSON_CHUNK)doc=JSON.parse(data.toString('utf8',at,at+n).replace(/[\0 ]+$/,''));if(kind===BIN_CHUNK)bin=data.subarray(at,at+n);at+=n;}
 if(!doc||!bin)throw new Error('GLB 必须包含 JSON 和内嵌几何数据');
 if((doc.buffers||[]).some(b=>b.uri))throw new Error('第一版只接收资源完整内嵌的 GLB，请先将外部资源打包进 GLB');
 if((doc.extensionsRequired||[]).some(x=>['KHR_draco_mesh_compression','EXT_meshopt_compression'].includes(x)))throw new Error('此 GLB 使用几何压缩，请导出未压缩 GLB 后导入');
 return {doc,bin};
}
function localMatrix(n){return n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation||[0,0,0])),new Quaternion(...(n.rotation||[0,0,0,1])),new Vector3(...(n.scale||[1,1,1])));}
function accessorBounds(d,bin,i){
 const a=d.accessors[i];if(a.min?.length===3&&a.max?.length===3)return new Box3(new Vector3(...a.min),new Vector3(...a.max));
 const v=d.bufferViews[a.bufferView];if(!v||a.componentType!==5126||a.type!=='VEC3')throw new Error('无法读取几何尺寸：缺少有效的 POSITION 范围');
 const box=new Box3(),stride=v.byteStride||12,start=(v.byteOffset||0)+(a.byteOffset||0);
 for(let k=0;k<a.count;k++){const p=start+k*stride;box.expandByPoint(new Vector3(bin.readFloatLE(p),bin.readFloatLE(p+4),bin.readFloatLE(p+8)));}return box;
}
export function modelMetadata(d,bin){
 const ns=d.nodes||[],world=[],boxes=[],parents=new Map(),visit=(i,parent)=>{
  if(world[i])throw new Error('模型节点重复引用或有循环，无法稳定绑定');
  const n=ns[i];if(!n)throw new Error('模型引用了不存在的节点');const m=new Matrix4().multiplyMatrices(parent,localMatrix(n));world[i]=m;const box=new Box3();
  if(n.mesh!==undefined)for(const p of d.meshes[n.mesh].primitives||[])if(p.attributes?.POSITION!==undefined)box.union(accessorBounds(d,bin,p.attributes.POSITION).applyMatrix4(m));
  for(const c of n.children||[]){parents.set(c,i);box.union(visit(c,m));}boxes[i]=box;return box;
 };
 const roots=d.scenes?.[d.scene||0]?.nodes||[];const sceneBox=new Box3();for(const i of roots)sceneBox.union(visit(i,new Matrix4()));
 if(sceneBox.isEmpty())throw new Error('模型中没有可用的三角网格');
 let selected=[];
 const arm=ns.findIndex(n=>n.name==='移动机械臂');
 if(arm>=0){selected=(ns[arm].children||[]).filter(i=>boxes[i]&&!boxes[i].isEmpty());for(let i=0;i<ns.length;i++)if(ns[i].name==='Mac Studio'&&boxes[i]&&!boxes[i].isEmpty()&&!selected.some(s=>{let q=i;while(parents.has(q)){q=parents.get(q);if(q===s)return true;}return false;}))selected.push(i);}
 else {for(let i of roots){if(!boxes[i]||boxes[i].isEmpty())continue;while((ns[i].children||[]).filter(c=>boxes[c]&&!boxes[c].isEmpty()).length===1&&ns[i].mesh===undefined)i=(ns[i].children||[]).find(c=>boxes[c]&&!boxes[c].isEmpty());const children=(ns[i].children||[]).filter(c=>boxes[c]&&!boxes[c].isEmpty());selected.push(...(children.length?children:[i]));}}
 selected=[...new Set(selected)];
 // Keep the highest selected ancestor, otherwise e.g. Mac Studio group + mesh are rendered twice.
 selected=selected.filter(i=>{let parent=parents.get(i);while(parent!==undefined){if(selected.includes(parent))return false;parent=parents.get(parent);}return true;});
 const parts=selected.map(i=>{const n=ns[i],b=boxes[i],label=n.name||`部件 ${i}`,center=b.getCenter(new Vector3()).toArray();return{id:`node-${i}`,label,nodeIndex:i,bounds:{min:b.min.toArray(),max:b.max.toArray()},center,role:/办公桌|桌子|椅/.test(label)?'set':/Mac Studio|电脑/.test(label)?'computer':/Studio Display|显示屏/.test(label)?'screen':'product'};});
 let triangles=0;for(const m of d.meshes||[])for(const p of m.primitives||[]){const n=d.accessors[p.indices??p.attributes?.POSITION]?.count||0;if((p.mode??4)===4)triangles+=Math.floor(n/3);}
 return {parts,triangles,bounds:{min:sceneBox.min.toArray(),max:sceneBox.max.toArray()}};
}
/** Strip images, UVs and color data, repack used binary views. Preserve every node transform and source index. */
export function whiteGlb(sourceDoc,bin){
 const d=structuredClone(sourceDoc),used=new Set();
 (d.nodes||[]).forEach((n,i)=>{n.extras={...n.extras,_previsIndex:i};});
 for(const m of d.meshes||[])for(const p of m.primitives||[]){
  p.material=0;for(const key of Object.keys(p.attributes||{}))if(!['POSITION','NORMAL','JOINTS_0','WEIGHTS_0'].includes(key))delete p.attributes[key];
  Object.values(p.attributes||{}).forEach(i=>used.add(i));if(p.indices!==undefined)used.add(p.indices);
  for(const t of p.targets||[])Object.values(t).forEach(i=>used.add(i));
 }
 for(const s of d.skins||[])if(s.inverseBindMatrices!==undefined)used.add(s.inverseBindMatrices);
 for(const a of d.animations||[])for(const s of a.samplers||[]){used.add(s.input);used.add(s.output);}
 const accessorIds=[...used].sort((a,b)=>a-b),amap=new Map(accessorIds.map((x,i)=>[x,i])),views=new Set();
 d.accessors=accessorIds.map(i=>{const a=d.accessors[i];if(a.bufferView!==undefined)views.add(a.bufferView);if(a.sparse){views.add(a.sparse.indices.bufferView);views.add(a.sparse.values.bufferView);}return a;});
 const vids=[...views].sort((a,b)=>a-b),vmap=new Map(vids.map((x,i)=>[x,i])),chunks=[];let off=0;
 d.bufferViews=vids.map(i=>{const v=d.bufferViews[i],bytes=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),pad=Buffer.alloc(padded(bytes.length));bytes.copy(pad);chunks.push(pad);const r={...v,buffer:0,byteOffset:off};off+=pad.length;return r;});
 for(const a of d.accessors){if(a.bufferView!==undefined)a.bufferView=vmap.get(a.bufferView);if(a.sparse){a.sparse.indices.bufferView=vmap.get(a.sparse.indices.bufferView);a.sparse.values.bufferView=vmap.get(a.sparse.values.bufferView);}}
 for(const m of d.meshes||[])for(const p of m.primitives||[]){for(const k of Object.keys(p.attributes||{}))p.attributes[k]=amap.get(p.attributes[k]);if(p.indices!==undefined)p.indices=amap.get(p.indices);for(const t of p.targets||[])for(const k of Object.keys(t))t[k]=amap.get(t[k]);}
 for(const s of d.skins||[])if(s.inverseBindMatrices!==undefined)s.inverseBindMatrices=amap.get(s.inverseBindMatrices);
 for(const a of d.animations||[])for(const s of a.samplers||[]){s.input=amap.get(s.input);s.output=amap.get(s.output);}
 d.materials=[{name:'PREVIS · white clay',pbrMetallicRoughness:{baseColorFactor:[.72,.73,.75,1],metallicFactor:0,roughnessFactor:.85},doubleSided:true}];delete d.images;delete d.textures;delete d.samplers;
 delete d.extensions;d.extensionsUsed=(d.extensionsUsed||[]).filter(x=>!x.startsWith('KHR_materials_')&&x!=='KHR_lights_punctual');d.extensionsRequired=(d.extensionsRequired||[]).filter(x=>!x.startsWith('KHR_materials_')&&x!=='KHR_lights_punctual');
 for(const n of d.nodes||[])if(n.extensions?.KHR_lights_punctual)delete n.extensions.KHR_lights_punctual;
 const geometry=Buffer.concat(chunks);d.buffers=[{byteLength:geometry.length}];const json=Buffer.from(JSON.stringify(d));const jbuf=Buffer.alloc(padded(json.length),0x20);json.copy(jbuf);const header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jbuf.length+8+geometry.length,8);const jhead=Buffer.alloc(8);jhead.writeUInt32LE(jbuf.length);jhead.writeUInt32LE(JSON_CHUNK,4);const bhead=Buffer.alloc(8);bhead.writeUInt32LE(geometry.length);bhead.writeUInt32LE(BIN_CHUNK,4);return Buffer.concat([header,jhead,jbuf,bhead,geometry]);
}
export async function checkedSource(file,allowedRoots){
 if(typeof file!=='string'||!file||file.includes('\0'))throw new Error('请提供有效的本地素材路径');
 const full=await realpath(resolve(file));let allowed=false;
 for(const r of allowedRoots){try{const rr=await realpath(r);if(full===rr||full.startsWith(rr+sep)){allowed=true;break;}}catch{}}
 if(!allowed)throw new Error('素材不在允许目录中，请通过文件选择上传或使用已指定的产品目录');
 const s=await stat(full);if(!s.isFile())throw new Error('素材路径必须是文件');if(s.size>MAX_BYTES)throw new Error('第一版单素材最大支持 512MB');return full;
}
export async function importAsset(projectDir,file,allowedRoots){
 const source=await checkedSource(file,allowedRoots),ext=extname(source).toLowerCase();
 const kind=ext==='.glb'?'model':['.jpg','.jpeg','.png','.webp'].includes(ext)?'image':['.mp4','.webm','.mov'].includes(ext)?'video':['.mp3','.wav','.m4a','.ogg','.aac','.flac'].includes(ext)?'audio':null;
 if(!kind)throw new Error('支持 GLB、PNG/JPG/WebP、MP4/WebM/MOV 和常见音频文件');
 const bytes=await readFile(source),hash=createHash('sha256').update(bytes).digest('hex'),id=`${kind}-${hash.slice(0,12)}`;
 const originals=join(projectDir,'assets','original');await mkdir(originals,{recursive:true});const safeName=basename(source).replace(/[\0/\\]/g,'_');await copyFile(source,join(originals,`${hash.slice(0,12)}-${safeName}`));
 if(kind!=='model')return{id,name:basename(source),kind,file:`assets/original/${hash.slice(0,12)}-${safeName}`,hash};
 const {doc,bin}=parseGlb(bytes),metadata=modelMetadata(doc,bin),white=whiteGlb(doc,bin);await mkdir(join(projectDir,'assets','white'),{recursive:true});const rel=`assets/white/${hash.slice(0,12)}.glb`;await writeFile(join(projectDir,rel),white);
 return{id,name:basename(source),kind:'model',file:rel,sourceName:basename(source),hash,originalBytes:bytes.length,previewBytes:white.length,...metadata};
}
