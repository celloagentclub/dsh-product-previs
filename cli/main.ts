import {spawnSync} from 'node:child_process';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {COMMAND_CATALOG, COMPOSITION_CATALOG, MOVE_CATALOG} from '../src/agent/catalog';
import {resolveModel} from '../src/agent/models';
import {commitCommands, loadProject, redoProject, undoProject} from '../src/agent/session';
import {decodeWav, detectBeats, encodeWav, synthBed} from '../src/audio/beats';
import {applyCommands} from '../src/core/commands';
import {activeShot, evaluateProject} from '../src/core/evaluate';
import type {Command, PrevisProject} from '../src/core/types';
import {directFromBrief} from '../src/director/pipeline';
import {ARM_JOINTS} from '../src/product/arm';
import {promptPack, storyboardHtml} from '../src/director/prompts';
import {renderFilm} from './render';

const args = process.argv.slice(2);
const command = args[0] || 'help';
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const has = (name: string) => args.includes(`--${name}`);

function help(): void {
  console.log(`previs <command>

  commands                         列出白名单命令
  direct --brief "..." --out DIR   从简报生成影片（编剧/导演/摄影/剪辑）
  apply --project FILE --commands FILE
  evaluate --project FILE --frame N
  beats --audio FILE
  align --project FILE [--bpm N]
  music:swap --project FILE --audio FILE [--render]
  storyboard --project FILE
  prompts --project FILE
  render --project FILE [--width N --height N] [--no-stills]
  undo --project FILE
  redo --project FILE
  mcp                              启动 MCP stdio 服务
  calibrate                        见 npm run arm:calibrate

模型：--model scripted|deepseek|codex（默认 scripted，不需要密钥）
换音乐：把任意音频交给 music:swap，会重新检拍、卡点并可选重渲。`);
}

async function writeFilm(out: string, project: PrevisProject, extra: unknown): Promise<void> {
  await mkdir(join(out, 'assets'), {recursive: true});
  await mkdir(join(out, 'output'), {recursive: true});
  await copyFile(resolve('assets/models/arm-white.glb'), join(out, 'assets/arm-white.glb'));
  const seconds = project.durationFrames / project.fps + 0.5;
  const wav = encodeWav(synthBed({bpm: project.film?.bpm ?? 178, seconds}), 44100);
  await writeFile(join(out, 'assets/bed.wav'), wav);
  await writeFile(join(out, 'project.json'), JSON.stringify(project, null, 2));
  await writeFile(join(out, 'outline.json'), JSON.stringify(extra, null, 2));
  await writeFile(join(out, 'prompts.json'), JSON.stringify(promptPack(project), null, 2));
  await writeFile(join(out, 'storyboard.html'), storyboardHtml(project));
}

async function run(): Promise<void> {
  if (command === 'help' || command === '--help') return help();
  if (command === 'commands') {
    console.log(JSON.stringify({commands: COMMAND_CATALOG, moves: MOVE_CATALOG, compositions: COMPOSITION_CATALOG}, null, 2));
    return;
  }
  if (command === 'direct') {
    const brief = flag('brief') || (flag('brief-file') ? await readFile(flag('brief-file')!, 'utf8') : '');
    const out = flag('out') || 'films/cybopal-wow';
    if (!brief.trim()) throw new Error('需要 --brief 或 --brief-file');
    const result = await directFromBrief(brief, resolveModel(flag('model')));
    await writeFilm(out, result.project, {outline: result.outline, scores: result.scores, mean: result.mean, passes: result.passes, vision: result.vision});
    await writeFile(join(out, 'scores.json'), JSON.stringify({mean: result.mean, passes: result.passes, vision: result.vision, scores: result.scores}, null, 2));
    console.log(`${out}/project.json  ${result.project.shots.length} 镜  ${(result.project.durationFrames / result.project.fps).toFixed(2)}s  均分 ${result.mean.toFixed(3)}  视觉 ${result.vision}`);
    if (has('render')) await renderFilm({projectPath: join(out, 'project.json'), width: flag('width') ? Number(flag('width')) : undefined, height: flag('height') ? Number(flag('height')) : undefined, grade: !has('no-grade')});
    return;
  }
  if (command === 'apply') {
    const projectPath = flag('project');
    const file = flag('commands');
    if (!projectPath || !file) throw new Error('需要 --project 和 --commands');
    const commands = JSON.parse(await readFile(file, 'utf8')) as Command[];
    const next = await commitCommands(projectPath, commands);
    console.log(`revision ${next.revision}`);
    return;
  }
  if (command === 'evaluate') {
    const project = await loadProject(flag('project') || '');
    const frame = Number(flag('frame') ?? 0);
    const state = evaluateProject(project, frame);
    const shot = activeShot(project, frame);
    console.log(JSON.stringify({frame: state.frame, shotId: state.shotId, kind: shot.kind ?? '3d', name: shot.name, camera: state.camera, joints: Object.fromEntries(Object.entries(state.objects).filter(([, object]) => Object.keys(object.jointAngles).length).map(([id, object]) => [id, object.jointAngles]))}, null, 2));
    return;
  }
  if (command === 'beats') {
    const audio = flag('audio');
    if (!audio) throw new Error('需要 --audio');
    const dest = audio.endsWith('.wav') ? audio : join(tmpdir(), 'previs-detect.wav');
    const decoded = await wavOf(audio, dest);
    const detected = detectBeats(decoded.samples, decoded.sampleRate);
    console.log(JSON.stringify({bpm: detected.bpm, beats: detected.times.length, first: detected.times.slice(0, 8)}, null, 2));
    return;
  }
  if (command === 'align') {
    const projectPath = flag('project');
    if (!projectPath) throw new Error('需要 --project');
    const bpm = Number(flag('bpm') || (await loadProject(projectPath)).film?.bpm || 178);
    const next = await commitCommands(projectPath, [{type: 'timeline.align', bpm}]);
    console.log(`aligned ${next.shots.length} shots @ ${bpm} BPM, ${next.durationFrames} frames`);
    return;
  }
  if (command === 'music:swap') {
    const projectPath = flag('project');
    const audio = flag('audio');
    if (!projectPath || !audio) throw new Error('需要 --project 和 --audio');
    const dest = join(dirname(projectPath), 'assets/score.wav');
    await mkdir(dirname(dest), {recursive: true});
    const decoded = await wavOf(audio, dest);
    const detected = detectBeats(decoded.samples, decoded.sampleRate);
    const project = await loadProject(projectPath);
    const commands: Command[] = [];
    if (!project.assets.some(asset => asset.id === 'score')) commands.push({type: 'asset.add', asset: {id: 'score', name: basename(audio), kind: 'audio', file: 'assets/score.wav'}});
    commands.push({type: 'audio.set', audio: {assetId: 'score', startFrame: 0, trimStart: 0, gain: 0.9}});
    commands.push({type: 'timeline.align', bpm: detected.bpm, onsets: detected.times});
    const next = await commitCommands(projectPath, commands);
    await writeFile(join(dirname(projectPath), 'storyboard.html'), storyboardHtml(next));
    await writeFile(join(dirname(projectPath), 'prompts.json'), JSON.stringify(promptPack(next), null, 2));
    console.log(`节拍 ${detected.bpm} BPM，${detected.times.length} 个重拍，影片改为 ${next.durationFrames} 帧`);
    if (!has('no-render')) await renderFilm({projectPath, width: flag('width') ? Number(flag('width')) : 1280, height: flag('height') ? Number(flag('height')) : 720});
    return;
  }
  if (command === 'storyboard' || command === 'prompts') {
    const project = await loadProject(flag('project') || '');
    const target = flag('out') || join(dirname(flag('project') || '.'), command === 'storyboard' ? 'storyboard.html' : 'prompts.json');
    await writeFile(target, command === 'storyboard' ? storyboardHtml(project) : JSON.stringify(promptPack(project), null, 2));
    console.log(target);
    return;
  }
  if (command === 'anim') {
    const projectPath = flag('project');
    if (!projectPath) throw new Error('需要 --project');
    const project = await loadProject(projectPath);
    const samples = [];
    for (let frame = 0; frame < project.durationFrames; frame++) {
      const state = evaluateProject(project, frame);
      const shot = activeShot(project, frame);
      if ((shot.kind ?? '3d') === 'broll-code') continue;
      const arm = state.objects.arm;
      samples.push({
        f: frame, shot: shot.id, motion: shot.intent?.role === 'action', move: shot.intent?.move ?? '',
        angles: arm?.jointAngles ?? {}, camera: state.camera, text: state.objects.panel?.screen || shot.screenContent || '',
      });
    }
    const payload = {fps: project.fps, width: project.width, height: project.height, joints: ARM_JOINTS, samples};
    const target = flag('out') || join(dirname(projectPath), 'anim.json');
    await writeFile(target, JSON.stringify(payload));
    console.log(`${target}  ${samples.length} 帧`);
    return;
  }
  if (command === 'render') {
    const projectPath = flag('project');
    if (!projectPath) throw new Error('需要 --project');
    const output = await renderFilm({projectPath, out: flag('out'), width: flag('width') ? Number(flag('width')) : undefined, height: flag('height') ? Number(flag('height')) : undefined, stills: !has('no-stills'), grade: !has('no-grade'), frame: flag('frame') ? Number(flag('frame')) : undefined});
    console.log(output);
    return;
  }
  if (command === 'undo') { console.log((await undoProject(flag('project') || '')).revision); return; }
  if (command === 'redo') { console.log((await redoProject(flag('project') || '')).revision); return; }
  if (command === 'validate') {
    const project = await loadProject(flag('project') || '');
    applyCommands(project, []);
    console.log('ok');
    return;
  }
  if (command === 'mcp') return mcp();
  throw new Error(`未知子命令 ${command}`);
}

async function wavOf(source: string, dest: string): Promise<{samples: Float32Array; sampleRate: number}> {
  if (!(source.endsWith('.wav') && source === dest)) {
    const converted = spawnSync('ffmpeg', ['-y', '-i', source, '-ac', '1', '-ar', '44100', dest], {stdio: 'inherit'});
    if (converted.status !== 0) throw new Error('ffmpeg 没能把音频转成 wav');
  }
  return decodeWav(await readFile(dest));
}

function send(message: unknown): void {
  const json = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

async function mcp(): Promise<void> {
  const tools = [
    {name: 'previs_commands', description: '列出白名单命令、运镜和构图。', inputSchema: {type: 'object', properties: {}}},
    {name: 'previs_direct', description: '从一句简报生成整部片子的 project.json。', inputSchema: {type: 'object', properties: {brief: {type: 'string'}, out: {type: 'string'}, model: {type: 'string'}}, required: ['brief']}},
    {name: 'previs_apply', description: '对项目文件应用一批白名单命令，并记入撤销历史。', inputSchema: {type: 'object', properties: {project: {type: 'string'}, commands: {type: 'array'}}, required: ['project', 'commands']}},
    {name: 'previs_evaluate', description: '求值某一帧的机位、镜头种类和关节角。', inputSchema: {type: 'object', properties: {project: {type: 'string'}, frame: {type: 'number'}}, required: ['project', 'frame']}},
    {name: 'previs_beats', description: '检测音频节拍。', inputSchema: {type: 'object', properties: {audio: {type: 'string'}}, required: ['audio']}},
    {name: 'previs_align', description: '按 BPM 重排切点。', inputSchema: {type: 'object', properties: {project: {type: 'string'}, bpm: {type: 'number'}}, required: ['project']}},
    {name: 'previs_storyboard', description: '写出分镜 HTML。', inputSchema: {type: 'object', properties: {project: {type: 'string'}}, required: ['project']}},
    {name: 'previs_prompts', description: '写出给 Kling / Veo 的逐镜提示词。', inputSchema: {type: 'object', properties: {project: {type: 'string'}}, required: ['project']}},
    {name: 'previs_undo', description: '撤销上一批命令。', inputSchema: {type: 'object', properties: {project: {type: 'string'}}, required: ['project']}},
    {name: 'previs_redo', description: '重做上一批命令。', inputSchema: {type: 'object', properties: {project: {type: 'string'}}, required: ['project']}},
  ];
  const call = async (name: string, input: Record<string, unknown>) => {
    if (name === 'previs_commands') return {commands: COMMAND_CATALOG, moves: MOVE_CATALOG, compositions: COMPOSITION_CATALOG};
    if (name === 'previs_direct') {
      const out = String(input.out || 'films/from-agent');
      const result = await directFromBrief(String(input.brief), resolveModel(typeof input.model === 'string' ? input.model : undefined));
      await writeFilm(out, result.project, result.outline);
      return {project: join(out, 'project.json'), shots: result.project.shots.length, mean: result.mean, vision: result.vision};
    }
    if (name === 'previs_apply') return commitCommands(String(input.project), input.commands as Command[]);
    if (name === 'previs_evaluate') {
      const project = await loadProject(String(input.project));
      const frame = Number(input.frame);
      const state = evaluateProject(project, frame);
      return {frame: state.frame, shotId: state.shotId, kind: activeShot(project, frame).kind ?? '3d', camera: state.camera};
    }
    if (name === 'previs_beats') {
      const decoded = decodeWav(await readFile(String(input.audio)));
      const detected = detectBeats(decoded.samples, decoded.sampleRate);
      return {bpm: detected.bpm, times: detected.times};
    }
    if (name === 'previs_align') return commitCommands(String(input.project), [{type: 'timeline.align', bpm: Number(input.bpm || 178)}]);
    if (name === 'previs_storyboard') {
      const project = await loadProject(String(input.project));
      const target = join(dirname(String(input.project)), 'storyboard.html');
      await writeFile(target, storyboardHtml(project));
      return {file: target};
    }
    if (name === 'previs_prompts') {
      const project = await loadProject(String(input.project));
      const target = join(dirname(String(input.project)), 'prompts.json');
      await writeFile(target, JSON.stringify(promptPack(project), null, 2));
      return {file: target};
    }
    if (name === 'previs_undo') return undoProject(String(input.project));
    if (name === 'previs_redo') return redoProject(String(input.project));
    throw new Error(`未知工具 ${name}`);
  };
  let buffer = Buffer.alloc(0);
  for await (const chunk of process.stdin) {
    buffer = Buffer.concat([buffer, chunk as Buffer]);
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) break;
      const match = /Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, headerEnd).toString('utf8'));
      if (!match) { buffer = buffer.subarray(headerEnd + 4); continue; }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) break;
      const message = JSON.parse(buffer.subarray(start, start + length).toString('utf8')) as {id?: number; method?: string; params?: {name?: string; arguments?: Record<string, unknown>}};
      buffer = buffer.subarray(start + length);
      if (message.method === 'notifications/initialized' || message.id === undefined) continue;
      try {
        if (message.method === 'initialize') {
          send({jsonrpc: '2.0', id: message.id, result: {protocolVersion: '2024-11-05', capabilities: {tools: {}}, serverInfo: {name: 'previs', version: '0.2.0'}}});
        } else if (message.method === 'tools/list') {
          send({jsonrpc: '2.0', id: message.id, result: {tools}});
        } else if (message.method === 'tools/call') {
          const result = await call(message.params?.name || '', message.params?.arguments || {});
          send({jsonrpc: '2.0', id: message.id, result: {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]}});
        } else send({jsonrpc: '2.0', id: message.id, error: {code: -32601, message: `未知方法 ${message.method}`}});
      } catch (error) {
        send({jsonrpc: '2.0', id: message.id, error: {code: -32000, message: error instanceof Error ? error.message : String(error)}});
      }
    }
  }
}

run().catch(error => { console.error(error instanceof Error ? error.stack || error.message : error); process.exit(1); });
