import {bundle} from '@remotion/bundler';
import {fileURLToPath} from 'node:url';
import {readFile, writeFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = fileURLToPath(new URL('../render-dist', import.meta.url));

const result = await bundle({
  entryPoint: fileURLToPath(new URL('../src/render/index.tsx', import.meta.url)),
  rootDir: root,
  outDir,
  onProgress: () => {},
});

// Remotion writes an absolute remotion_cwd into the page.
const indexPath = join(outDir, 'index.html');
const html = await readFile(indexPath, 'utf8');
await writeFile(indexPath, html.replace(/window\.remotion_cwd = "[^"]*";/, 'window.remotion_cwd = "./";'));

// Bundled dependencies ship their own `//# sourceMappingURL=GLTFLoader.js.map`
// comments pointing at files that do not exist in this bundle. The renderer
// follows them and fails with ENOENT, so strip dangling references and keep
// only the ones that resolve.
for (const name of await readdir(outDir)) {
  if (!name.endsWith('.js')) continue;
  const file = join(outDir, name);
  const text = await readFile(file, 'utf8');
  if (!text.includes('sourceMappingURL=')) continue;
  const fixed = await Promise.all(text.split('\n').map(async line => {
    const m = /^\/\/# sourceMappingURL=(.+?)\s*$/.exec(line);
    if (!m) return line;
    const target = m[1];
    if (target === 'bundle.js.map' || name === 'bundle.js') {
      return `//# sourceMappingURL=${name}.map`;
    }
    try {
      await readFile(join(outDir, target));
      return line;
    } catch {
      return ''; // dangling reference: drop it
    }
  }));
  const next = fixed.filter((line, i) => line !== '' || !/sourceMappingURL=/.test(text.split('\n')[i])).join('\n');
  if (next !== text) await writeFile(file, next);
}

// Source maps stay (the renderer follows sourceMappingURL), but they must not
// carry this machine's absolute build paths into a published artifact.
let scrubbed = 0;
for (const name of await readdir(outDir)) {
  if (!name.endsWith('.map')) continue;
  const file = join(outDir, name);
  const text = await readFile(file, 'utf8');
  if (!text.includes(root)) continue;
  await writeFile(file, text.split(root).join('').split(root.slice(0, -1)).join(''));
  scrubbed += 1;
}

console.log('Built deterministic Remotion scene:', result, scrubbed ? `(scrubbed ${scrubbed} source maps)` : '');
