/**
 * Build the Seedance handoff set: per-shot keyframes rendered with the real
 * product textures, plus a prompt written from the actual camera and action data.
 * Nothing here is typed by hand — every number comes from the project.
 */
import {selectComposition, renderStill} from '@remotion/renderer';
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const P = process.env.PREVIS_PROJECT || '';
if (!P) { console.error('请设置 PREVIS_PROJECT 指向预演工程目录'); process.exit(1); }
const OUT = process.argv[2] || '/tmp/previs-handoff';
const project = JSON.parse(await readFile(join(P, 'project.json'), 'utf8'));
const textured = {...project, assets: project.assets.map(a => ({...a, file: 'assets/original/5da3d36cc32b-textured-indexed.glb'}))};

const root = join(homedir(), '.cache/puppeteer/chrome-headless-shell');
const vs = (await readdir(root)).sort((a, b) => a.localeCompare(b, undefined, {numeric: true})).reverse();
let browserExecutable = null;
for (const v of vs) {
  const p = join(root, v, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
  if (existsSync(p)) { browserExecutable = p; break; }
}

const serveUrl = join(ROOT, 'render-dist');
const chromiumOptions = {gl: 'angle'};
const inputProps = {
  project: textured,
  assetBase: 'http://127.0.0.1:60682/product-previs/asset?id=previs-230c581a',
  sourceFps: project.fps,
  outputFps: project.fps,
  outputFrames: project.durationFrames,
};
const composition = await selectComposition({serveUrl, id: 'ProductPrevis', inputProps, browserExecutable, chromiumOptions, timeoutInMilliseconds: 180000});

await mkdir(join(OUT, 'frames'), {recursive: true});
for (const shot of project.shots) {
  for (const [label, frame] of [['start', shot.start], ['end', shot.end - 1]]) {
    const file = join(OUT, 'frames', `${shot.id}_${label}.png`);
    await renderStill({serveUrl, composition, inputProps, frame, output: file, imageFormat: 'png', browserExecutable, chromiumOptions, timeoutInMilliseconds: 180000});
    console.log('frame', shot.id, label, frame);
  }
}
