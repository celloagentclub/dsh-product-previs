import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Matrix4, Vector3} from 'three';
import {describe, expect, it} from 'vitest';
import {commitCommands, loadProject, saveProject, undoProject} from '../src/agent/session';
import {decodeWav, detectBeats, encodeWav, frameAtBeat, realignProject, synthBed} from '../src/audio/beats';
import {applyCommands} from '../src/core/commands';
import {evaluateProject} from '../src/core/evaluate';
import {identityTransform, type PrevisProject, type V3} from '../src/core/types';
import {compileFilm} from '../src/director/compile';
import {planFilm, writeNarrative} from '../src/director/plan';
import {directFromBrief} from '../src/director/pipeline';
import {pixelVerdict, scorePixels} from '../src/director/pixels';
import {meanScore} from '../src/director/rubric';
import {ARM_JOINTS, armModelAsset, lowestPoint, mergePoses, poseAngles, screenPosition, solveIk, transformPoint} from '../src/product/arm';

const near = (actual: V3, expected: V3, digits = 4) => expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, digits));

describe('arm kinematics', () => {
  it('keeps the screen on its rest centre and matches evaluateProject', () => {
    const rest = poseAngles('rest');
    near(screenPosition(rest), [0.27, 0.515, 0], 5);
    const asset = armModelAsset();
    const project: PrevisProject = {
      schemaVersion: 2, id: 'rig', name: 'rig', revision: 1, fps: 24, durationFrames: 10, width: 1920, height: 1080,
      assets: [asset], objects: [{id: 'arm', name: 'arm', kind: 'model', assetId: asset.id, partIds: asset.parts.map(part => part.id), sourceOrigin: [0, 0, 0], transform: identityTransform(), visible: true, joints: ARM_JOINTS}],
      shots: [{id: 's', name: 's', start: 0, end: 10, description: '', camera: {from: {position: [1, 1, 2], target: [0, 0.4, 0], focalLength: 40, focusDistance: 2, aperture: 4}, to: {position: [1, 1, 2], target: [0, 0.4, 0], focalLength: 40, focusDistance: 2, aperture: 4}, move: 'static', easing: 'linear'}}],
      tracks: [{id: 'arm-joint-seg2', objectId: 'arm', property: 'joint:seg2', keys: [{frame: 0, value: 20}]}],
      createdAt: '2026-11-12T00:00:00.000Z', updatedAt: '2026-11-12T00:00:00.000Z',
    };
    const state = evaluateProject(project, 0);
    const display = asset.parts.find(part => part.id === 'display')!;
    const moved = new Vector3(...display.center).applyMatrix4(new Matrix4().fromArray(state.objects.arm.partMatrices.display));
    near(moved.toArray() as V3, transformPoint('display', display.center, {seg2: 20}), 5);
  });

  it('reaches a point in front of a face and stays inside the joint limits', () => {
    const goal: V3 = [0.32, 0.42, 0.1];
    const solved = solveIk(goal, poseAngles('rest'), 90);
    expect(solved.error).toBeLessThan(0.02);
    expect(solved.reached).toBe(true);
    for (const joint of ARM_JOINTS) {
      expect(solved.angles[joint.id]).toBeGreaterThanOrEqual(joint.minDeg);
      expect(solved.angles[joint.id]).toBeLessThanOrEqual(joint.maxDeg);
    }
    expect(solved.angles.portrait).toBe(90);
    const unreachable = solveIk([4, 4, 4]);
    expect(unreachable.reached).toBe(false);
    for (const joint of ARM_JOINTS) expect(unreachable.angles[joint.id]).toBeLessThanOrEqual(joint.maxDeg);
  });

  it('keeps the folded pose above the floor', () => {
    expect(lowestPoint(poseAngles('folded'))).toBeGreaterThan(-0.01);
    expect(lowestPoint(poseAngles('nod'))).toBeGreaterThan(-0.01);
  });
});

describe('director commands', () => {
  it('builds a brand film from a brief with both shot kinds, then undoes a batch', async () => {
    const result = await directFromBrief('40秒品牌片，对标苹果，纯黑，无旁白，电子乐 178 BPM，主角是 CyboPal 机械臂。');
    expect(result.project.film?.title).toBe('ZEESWAY A1');
    expect(result.project.film?.style).toBe('brand');
    expect(result.project.film?.look).toBe('studio-black');
    expect(result.project.shots.some(shot => shot.kind === '3d')).toBe(true);
    expect(result.project.shots.some(shot => shot.kind === 'broll-code')).toBe(true);
    expect(result.project.objects.some(object => object.kind === 'actor')).toBe(false);
    expect(result.project.shots.some(shot => shot.dialogue?.vo)).toBe(false);
    const seconds = (result.project.durationFrames - 1) / result.project.fps;
    expect(seconds).toBeGreaterThan(36);
    expect(seconds).toBeLessThan(46);
    expect(result.mean).toBeGreaterThan(0.72);
    expect(result.project.shots.every(shot => shot.videoPrompt && shot.videoPrompt.length > 40)).toBe(true);
    const beats = result.project.shots.map(shot => shot.intent?.beats ?? 0);
    expect(Math.min(...beats)).toBeLessThanOrEqual(2);
    for (const shot of result.project.shots) {
      if (!shot.intent?.beats) continue;
      expect(shot.start).toBe(frameAtBeat(result.project.shots.filter(item => item.start < shot.start).reduce((sum, item) => sum + (item.intent?.beats ?? 0), 0), 178, 24));
    }
    const directory = await mkdtemp(join(tmpdir(), 'previs-'));
    const path = join(directory, 'project.json');
    await saveProject(path, result.project);
    const edited = await commitCommands(path, [{type: 'project.update', patch: {name: '改过'}}]);
    expect(edited.name).toBe('改过');
    expect(edited.revision).toBe(result.project.revision + 1);
    expect((await undoProject(path)).name).toBe(result.project.name);
    await rm(directory, {recursive: true});
  });

  it('rejects an unknown action and an unknown command', () => {
    const narrative = writeNarrative('40秒品牌片');
    const project = compileFilm(narrative, planFilm(narrative));
    expect(() => applyCommands(project, [{type: 'arm.action', objectId: 'arm', action: 'explode', start: 0, end: 10}])).toThrow('未知机械臂动作');
    expect(() => applyCommands(project, [{type: 'not.a.command'} as never])).toThrow('未知命令');
  });

  it('solves a locked side view and a slow pull without dragging', () => {
    const narrative = writeNarrative('40秒品牌片 178 BPM');
    const project = compileFilm(narrative, planFilm(narrative));
    const locked = project.shots.find(shot => shot.intent?.move === 'locked' && shot.intent.composition === 'side');
    const push = project.shots.find(shot => shot.intent?.move === 'push-impact');
    expect(locked?.camera.move).toBe('static');
    expect(push?.camera.easing).toBe('ease-out');
    const distance = (pose: {position: V3; target: V3}) => Math.hypot(...pose.position.map((value, index) => value - pose.target[index]) as V3);
    expect(distance(push!.camera.to)).toBeLessThan(distance(push!.camera.from));
  });
  it('moves the screen by a clearly readable distance', () => {
    const folded = screenPosition(poseAngles('folded'));
    const eye = screenPosition(poseAngles('rest'));
    const closer = screenPosition(poseAngles('closer'));
    const turned = screenPosition(mergePoses('closer', 'turned'));
    const travel = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(travel(folded, eye)).toBeGreaterThan(0.28);
    expect(travel(eye, closer)).toBeGreaterThan(0.15);
    expect(travel(closer, turned)).toBeGreaterThan(0.2);
    expect(lowestPoint(poseAngles('folded'))).toBeGreaterThan(-0.02);
  });
});

describe('beats', () => {
  it('hears the 178 BPM placeholder and realigns cuts onto a new grid', () => {
    const samples = synthBed({bpm: 178, seconds: 12});
    const wav = encodeWav(samples, 44100);
    const decoded = decodeWav(wav);
    const detected = detectBeats(decoded.samples, decoded.sampleRate);
    expect(detected.bpm).toBeGreaterThan(174);
    expect(detected.bpm).toBeLessThan(182);
    expect(detected.times.length).toBeGreaterThan(20);
    const narrative = writeNarrative('40秒品牌片 178 BPM');
    const project = compileFilm(narrative, planFilm(narrative));
    const again = realignProject(project, 178);
    expect(again.shots.map(shot => [shot.start, shot.end])).toEqual(project.shots.map(shot => [shot.start, shot.end]));
    const slower = applyCommands(project, [{type: 'timeline.align', bpm: 120}]);
    expect(slower.durationFrames).toBeGreaterThan(project.durationFrames);
    expect(slower.film?.bpm).toBe(120);
    expect(slower.shots[0].start).toBe(0);
    for (let i = 1; i < slower.shots.length; i++) expect(slower.shots[i].start).toBeGreaterThanOrEqual(slower.shots[i - 1].end);
  });
});

describe('pixel motion check', () => {
  it('flags a frozen product and accepts an obvious move', () => {
    const still = new Uint8Array(64);
    for (let i = 0; i < 16; i++) { still[i * 4] = 210; still[i * 4 + 1] = 210; still[i * 4 + 2] = 210; still[i * 4 + 3] = 255; }
    const moved = new Uint8Array(still);
    for (let i = 0; i < 8; i++) { moved[i * 4] = 20; moved[i * 4 + 1] = 20; moved[i * 4 + 2] = 20; }
    expect(pixelVerdict(scorePixels(still, still, 1), true)).toContain('动作在像素上不明显');
    expect(pixelVerdict(scorePixels(still, moved, 1), true)).toEqual([]);
    const empty = new Uint8Array(64);
    expect(pixelVerdict(scorePixels(empty, empty, 1), false).join()).toContain('不在画面');
  });
});

describe('white model file', () => {
  it('is a small glTF with one node per arm part', async () => {
    const file = await readFile(new URL('../assets/models/arm-white.glb', import.meta.url));
    expect(file.byteLength).toBeLessThan(200_000);
    expect(file.toString('ascii', 0, 4)).toBe('glTF');
    const jsonLength = file.readUInt32LE(12);
    const doc = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/, ''));
    const names = doc.nodes.map((node: {name: string}) => node.name);
    for (const id of ['base', 'seg1', 'seg2', 'seg3', 'seg4', 'seg5', 'bracket', 'display']) expect(names).toContain(id);
    expect(doc.images).toBeUndefined();
  });
});
