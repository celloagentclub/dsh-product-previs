import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';

await build({
  entryPoints: ['cli/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'cli/previs.bundle.mjs',
  packages: 'external',
  logLevel: 'warning',
});
const result = spawnSync(process.execPath, ['cli/previs.bundle.mjs', ...process.argv.slice(2)], {stdio: 'inherit'});
process.exit(result.status ?? 1);
