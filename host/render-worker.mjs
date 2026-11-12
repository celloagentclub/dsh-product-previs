import {selectComposition,renderMedia,renderStill,makeCancelSignal} from '@remotion/renderer';
import {readFile,mkdir,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const emit=(v)=>process.stdout.write(JSON.stringify(v)+'\n');
const {cancel,cancelSignal}=makeCancelSignal();process.on('SIGTERM',()=>cancel());process.on('SIGINT',()=>cancel());
async function chrome(){if(process.env.PREVIS_CHROME&&existsSync(process.env.PREVIS_CHROME))return process.env.PREVIS_CHROME;const root=join(homedir(),'.cache','puppeteer','chrome-headless-shell');try{const vs=(await readdir(root)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).reverse();for(const v of vs){const p=join(root,v,process.platform==='darwin'?'chrome-headless-shell-mac-arm64/chrome-headless-shell':'chrome-headless-shell-linux64/chrome-headless-shell');if(existsSync(p))return p;}}catch{}return null;}
try{
 const cfg=JSON.parse(await readFile(process.argv[2],'utf8'));await mkdir(dirname(cfg.output),{recursive:true});
 emit({progress:.01,message:'准备已构建的三维导出场景'});
 const serveUrl=join(ROOT,'render-dist');if(!existsSync(join(serveUrl,'index.html')))throw new Error('渲染场景尚未构建，请运行 npm run build');
 const inputProps={project:cfg.project,assetBase:cfg.assetBase,sourceFps:cfg.sourceFps||cfg.project.fps,frameOffset:cfg.frameOffset||0,outputFps:cfg.outputFps||cfg.project.fps,outputFrames:cfg.renderDurationFrames||cfg.project.durationFrames};
 const browserExecutable=await chrome(),chromiumOptions={gl:'angle'};
 const composition=await selectComposition({serveUrl,id:'ProductPrevis',inputProps,browserExecutable,chromiumOptions,timeoutInMilliseconds:120000});
 if(cfg.stillFrame!==undefined){await renderStill({serveUrl,composition,inputProps,frame:cfg.stillFrame,output:cfg.output,imageFormat:'png',browserExecutable,chromiumOptions,timeoutInMilliseconds:120000,cancelSignal});}
 else await renderMedia({serveUrl,composition,inputProps,outputLocation:cfg.output,codec:'h264',muted:!cfg.project.audio,enforceAudioTrack:false,pixelFormat:'yuv420p',crf:20,x264Preset:'fast',concurrency:1,browserExecutable,chromiumOptions,timeoutInMilliseconds:120000,cancelSignal,logLevel:'warn',onProgress:p=>emit({progress:.10+.89*p.progress,message:`渲染 ${p.renderedFrames}/${inputProps.outputFrames} 帧`})});
 emit({progress:1,message:'导出完成',completed:true});
}catch(e){emit({error:e.stack||e.message});process.exitCode=1;}
