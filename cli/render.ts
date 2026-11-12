import {createReadStream, existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {mkdir, readFile} from 'node:fs/promises';
import {dirname, extname, join, resolve} from 'node:path';
import type {PrevisProject} from '../src/core/types';

const MIME: Record<string, string> = {'.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.png': 'image/png'};

async function serve(root: string): Promise<{origin: string; close: () => void}> {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (!url.pathname.endsWith('/asset')) { res.writeHead(404); res.end(); return; }
    const file = url.searchParams.get('file') || '';
    const path = resolve(root, file);
    if (!path.startsWith(resolve(root)) || !existsSync(path)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'content-type': MIME[extname(path)] || 'application/octet-stream', 'access-control-allow-origin': '*'});
    createReadStream(path).pipe(res);
  });
  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('素材服务没有端口');
  return {origin: `http://127.0.0.1:${address.port}`, close: () => server.close()};
}

export async function renderFilm(options: {projectPath: string; out?: string; width?: number; height?: number; stills?: boolean; grade?: boolean; frame?: number}): Promise<string> {
  const project = JSON.parse(await readFile(options.projectPath, 'utf8')) as PrevisProject;
  const root = dirname(resolve(options.projectPath));
  const width = options.width || project.width;
  const height = options.height || project.height;
  const graded = options.grade === false ? {...project, film: project.film ? {...project.film, grade: false} : project.film, width, height} : {...project, width, height};
  const bundle = resolve('render-dist');
  if (!existsSync(join(bundle, 'index.html'))) throw new Error('渲染场景还没构建。先运行 npm run build');
  const {selectComposition, renderMedia, renderStill} = await import('@remotion/renderer');
  const server = await serve(root);
  const browserExecutable = existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;
  const inputProps = {project: graded, assetBase: `${server.origin}/product-previs/asset?id=local`, sourceFps: project.fps, outputFps: project.fps, outputFrames: graded.durationFrames};
  try {
    const composition = await selectComposition({serveUrl: bundle, id: 'ProductPrevis', inputProps, browserExecutable, chromiumOptions: {gl: 'angle'}, timeoutInMilliseconds: 180000});
    if (options.frame !== undefined) {
      const output = options.out || join(root, 'output', `probe-${options.frame}.png`);
      await mkdir(dirname(output), {recursive: true});
      await renderStill({serveUrl: bundle, composition, inputProps, frame: options.frame, output, imageFormat: 'png', browserExecutable, chromiumOptions: {gl: 'angle'}, timeoutInMilliseconds: 180000});
      return output;
    }
    const stillDir = join(root, 'output/frames');
    if (options.stills !== false) {
      await mkdir(stillDir, {recursive: true});
      for (const shot of [...graded.shots].sort((a, b) => a.start - b.start)) {
        const frame = shot.start + Math.floor((shot.end - shot.start - 1) / 2);
        const output = join(stillDir, `${shot.id}.png`);
        process.stdout.write(`still ${shot.id} @ ${frame}\n`);
        await renderStill({serveUrl: bundle, composition, inputProps, frame, output, imageFormat: 'png', browserExecutable, chromiumOptions: {gl: 'angle'}, timeoutInMilliseconds: 180000});
      }
    }
    const output = options.out || join(root, 'output/sample.mp4');
    await mkdir(dirname(output), {recursive: true});
    await renderMedia({
      serveUrl: bundle, composition, inputProps, outputLocation: output, codec: 'h264',
      muted: !graded.audio, enforceAudioTrack: false, pixelFormat: 'yuv420p', crf: 20, x264Preset: 'veryfast',
      concurrency: 2, browserExecutable, chromiumOptions: {gl: 'angle'}, timeoutInMilliseconds: 180000,
      onProgress: progress => process.stdout.write(`\rframe ${progress.renderedFrames}/${graded.durationFrames}`),
    });
    process.stdout.write('\n');
    return output;
  } finally { server.close(); }
}
