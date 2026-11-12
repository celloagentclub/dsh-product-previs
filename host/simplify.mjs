import {MeshoptSimplifier} from 'meshoptimizer/simplifier';
import {BufferGeometry,BufferAttribute} from 'three';
const pad=n=>Math.ceil(n/4)*4;
const read=(d,b,i)=>{const a=d.accessors[i],v=d.bufferViews[a.bufferView],size=a.type==='VEC3'?3:1,bytes=a.componentType===5126||a.componentType===5125?4:a.componentType===5123?2:1,stride=v.byteStride||size*bytes,off=(v.byteOffset||0)+(a.byteOffset||0),out=a.componentType===5126?new Float32Array(a.count*size):new Uint32Array(a.count*size);for(let n=0;n<a.count;n++)for(let c=0;c<size;c++){const p=off+n*stride+c*bytes;out[n*size+c]=a.componentType===5126?b.readFloatLE(p):bytes===4?b.readUInt32LE(p):bytes===2?b.readUInt16LE(p):b.readUInt8(p);}return out;};
/** Simplify triangles only, preserving every source node, transform and semantic part.
 * Preview tolerance is 0.05% of each mesh's own extent; source and full white model stay intact.
 */
export async function simplifyWhite(d,bin){
 if(d.skins?.length||d.animations?.length||d.meshes.some(m=>m.primitives.some(p=>p.targets||(p.mode??4)!==4)))return null;
 await MeshoptSimplifier.ready;const doc=structuredClone(d);doc.accessors=[];doc.bufferViews=[];const chunks=[];let offset=0,triangleCount=0;
 const add=(typed,type,componentType,min,max)=>{const bytes=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength),chunk=Buffer.alloc(pad(bytes.length));bytes.copy(chunk);const vi=doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length})-1;chunks.push(chunk);offset+=chunk.length;return doc.accessors.push({bufferView:vi,byteOffset:0,componentType,count:typed.length/(type==='VEC3'?3:1),type,...(min?{min,max}:{})})-1;};
 for(let mi=0;mi<d.meshes.length;mi++)for(let pi=0;pi<d.meshes[mi].primitives.length;pi++){
  const old=d.meshes[mi].primitives[pi],p=doc.meshes[mi].primitives[pi],positions=read(d,bin,old.attributes.POSITION),count=positions.length/3;
  let indices=old.indices!==undefined?read(d,bin,old.indices):Uint32Array.from({length:count},(_,i)=>i);
  if(indices.length>6000){const weld=MeshoptSimplifier.generatePositionRemap(positions,3);indices=Uint32Array.from(indices,i=>weld[i]);const target=Math.max(3000,Math.floor(indices.length*.15/3)*3);const result=MeshoptSimplifier.simplify(indices,positions,3,target,.0005);indices=result[0];if(indices.length>target*2){
    const lock=new Uint8Array(count),extreme=[0,0,0,0,0,0];for(let v=1;v<count;v++)for(let axis=0;axis<3;axis++){if(positions[v*3+axis]<positions[extreme[axis*2]*3+axis])extreme[axis*2]=v;if(positions[v*3+axis]>positions[extreme[axis*2+1]*3+axis])extreme[axis*2+1]=v;}for(const v of extreme)lock[v]=1;
    const sloppy=MeshoptSimplifier.simplifySloppy(indices,positions,3,lock,target,.002);if(sloppy[0].length>=3)indices=sloppy[0];
  }}
  const [remap,unique]=MeshoptSimplifier.compactMesh(indices),compact=new Float32Array(unique*3);
  for(let i=0;i<count;i++)if(remap[i]!==0xffffffff&&remap[i]<unique)for(let c=0;c<3;c++)compact[remap[i]*3+c]=positions[i*3+c];
  const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(compact,3));g.setIndex(new BufferAttribute(indices,1));g.computeVertexNormals();g.computeBoundingBox();
  const min=g.boundingBox.min.toArray(),max=g.boundingBox.max.toArray();p.attributes={POSITION:add(compact,'VEC3',5126,min,max),NORMAL:add(g.attributes.normal.array,'VEC3',5126)};p.indices=add(indices,'SCALAR',5125);triangleCount+=indices.length/3;g.dispose();
 }
 const binary=Buffer.concat(chunks);doc.buffers=[{byteLength:binary.length}];const raw=Buffer.from(JSON.stringify(doc)),j=Buffer.alloc(pad(raw.length),32);raw.copy(j);const h=Buffer.alloc(20);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+j.length+8+binary.length,8);h.writeUInt32LE(j.length,12);h.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);return{data:Buffer.concat([h,j,bh,binary]),triangles:triangleCount};
}
