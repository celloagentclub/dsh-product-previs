import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const base=new URL('../',import.meta.url);
await build({stdin:{contents:"export * from './src/core/evaluate'; export * from './src/core/commands';",resolveDir:fileURLToPath(base),loader:'ts'},outfile:fileURLToPath(new URL('host/generated-core.mjs',base)),bundle:true,platform:'node',format:'esm',target:'node20',external:['three'],sourcemap:true});
console.log('Built shared core for host');
