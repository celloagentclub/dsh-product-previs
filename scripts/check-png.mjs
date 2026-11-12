import {inflateSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
/** Decode lossless Chromium PNGs to detect the blank-canvas regression. */
export function pngStats(data){
 if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Not a PNG');
 let width,height,channels;const chunks=[];
 for(let p=8;p+12<=data.length;){const n=data.readUInt32BE(p),type=data.toString('ascii',p+4,p+8),b=data.subarray(p+8,p+8+n);if(type==='IHDR'){width=b.readUInt32BE(0);height=b.readUInt32BE(4);if(b[8]!==8||![2,6].includes(b[9]))throw new Error('Only RGB/RGBA 8-bit PNG is supported');channels=b[9]===6?4:3;}if(type==='IDAT')chunks.push(b);p+=n+12;}
 const raw=inflateSync(Buffer.concat(chunks)),rowSize=width*channels;let previous=Buffer.alloc(rowSize),at=0,sum=0,sum2=0,count=0;
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[at++],row=Buffer.alloc(rowSize);for(let x=0;x<rowSize;x++){const v=raw[at++],a=x>=channels?row[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0;row[x]=(v+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;}for(let x=0;x<rowSize;x+=channels){const v=row[x];sum+=v;sum2+=v*v;count++;}previous=row;}
 return{width,height,spatialStd:Math.sqrt(Math.max(0,sum2/count-(sum/count)**2)),sha256:createHash('sha256').update(data).digest('hex')};
}
if(import.meta.url===new URL(process.argv[1],'file://'+process.cwd()+'/').href){const list=[];for(const path of process.argv.slice(2)){const s=pngStats(await readFile(path));if(s.spatialStd<5)throw new Error(`Blank render: ${path}`);console.log(path,s);list.push(s.sha256);}if(new Set(list).size!==list.length)throw new Error('Distinct timeline frames unexpectedly identical');}
