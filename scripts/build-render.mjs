import {bundle} from '@remotion/bundler';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await bundle({entryPoint:fileURLToPath(new URL('../src/render/index.tsx',import.meta.url)),rootDir:root,outDir:fileURLToPath(new URL('../render-dist',import.meta.url)),onProgress:()=>{},
  // Source maps embed absolute build paths; keep them out of published artifacts.
  webpackOverride:(c)=>({...c,devtool:false})});
// Remotion writes an absolute remotion_cwd into the page. Replace it with the
// bundle's own directory so published artifacts carry no build-machine paths.
const {readFile,writeFile}=await import('node:fs/promises');
const indexPath=fileURLToPath(new URL('../render-dist/index.html',import.meta.url));
const html=await readFile(indexPath,'utf8');
await writeFile(indexPath,html.replace(/window\.remotion_cwd = "[^"]*";/,'window.remotion_cwd = "./";'));
const bundlePath=fileURLToPath(new URL('../render-dist/bundle.js',import.meta.url));
const bundled=await readFile(bundlePath,'utf8');
await writeFile(bundlePath,bundled.replace(/\/\/# sourceMappingURL=.*$/gm,''));
console.log('Built deterministic Remotion scene:',result);
