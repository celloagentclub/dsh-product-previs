import {Euler, Matrix4, Quaternion, Vector3} from 'three';
import {evaluateProject} from '../core/evaluate';
import type {CameraMove, CameraPose, Easing, PrevisProject, V3} from '../core/types';
import {ARM_PARTS} from '../product/arm';
import {solveCamera} from './solver';

export const MOVE_NAMES = ['slow-pull', 'slow-push', 'locked', 'orbit', 'crane', 'macro', 'handheld', 'over-shoulder', 'fly-along', 'macro-orbit', 'whip', 'push-impact', 'rack-focus'] as const;
export type MoveName = typeof MOVE_NAMES[number];

/** Azimuth 0 looks along Z (the arm's profile). Azimuth 90 looks along X, at the screen. */
export const COMPOSITIONS: Record<string, {azimuth: number; elevation: number; wantX: number; wantY: number}> = {
  centered: {azimuth: 32, elevation: 8, wantX: 0, wantY: 0.02},
  macro: {azimuth: 78, elevation: 6, wantX: 0, wantY: 0},
  side: {azimuth: 0, elevation: 2, wantX: 0, wantY: 0},
  front: {azimuth: 90, elevation: 3, wantX: 0, wantY: 0},
  angle45: {azimuth: 45, elevation: 10, wantX: 0, wantY: 0},
  low: {azimuth: 24, elevation: -8, wantX: 0, wantY: -0.04},
  top: {azimuth: 20, elevation: 72, wantX: 0, wantY: 0},
  'over-shoulder': {azimuth: 155, elevation: 12, wantX: 0.28, wantY: 0.05},
};

const SUBJECTS: Record<string, string[]> = {
  shoulder: ['seg1'],
  elbow: ['seg3'],
  base: ['base'],
  screen: ['display'],
  arm: ARM_PARTS.map(part => part.id),
  motion: ARM_PARTS.map(part => part.id),
};

export const PULL_SPEED = 0.1;

interface Solved { pose: CameraPose; distance: number }

function solveAt(points: V3[], focal: number, aspect: number, azimuth: number, elevation: number, fill: number, wantX: number, wantY: number, minDistance: number): Solved | null {
  for (const attempt of [fill, fill * 0.85, fill * 0.7, Math.min(fill, 0.45)]) {
    const result = solveCamera({points, focalLength: focal, aspect, azimuthDeg: azimuth, elevationDeg: elevation, fill: Math.max(0.12, attempt), wantX, wantY, minDistance});
    if (!result) continue;
    return {pose: {...result.pose, position: result.pose.position as V3, target: result.pose.target as V3}, distance: result.distance as number};
  }
  return null;
}

/** World-space corners of the posed parts. Uses the same matrices as the renderer. */
export function subjectPoints(project: PrevisProject, objectId: string, frame: number, subject: string): V3[] {
  const partIds = SUBJECTS[subject] ?? SUBJECTS.arm;
  const state = evaluateProject(project, frame);
  const object = project.objects.find(item => item.id === objectId);
  const asset = project.assets.find(item => item.id === object?.assetId);
  const evaluated = state.objects[objectId];
  if (!object || !evaluated || asset?.kind !== 'model') throw new Error(`取景对象不存在：${objectId}`);
  const origin = object.sourceOrigin ?? [0, 0, 0];
  const rotation = evaluated.transform.rotation;
  const objectMatrix = new Matrix4().compose(
    new Vector3(...evaluated.transform.position),
    new Quaternion().setFromEuler(new Euler(rotation[0] * Math.PI / 180, rotation[1] * Math.PI / 180, rotation[2] * Math.PI / 180, 'XYZ')),
    new Vector3(...evaluated.transform.scale),
  );
  const points: V3[] = [];
  for (const part of asset.parts.filter(item => partIds.includes(item.id))) {
    const delta = evaluated.partMatrices[part.id];
    if (!delta) continue;
    const local = new Matrix4().fromArray(delta);
    for (const x of [part.bounds.min[0], part.bounds.max[0]]) {
      for (const y of [part.bounds.min[1], part.bounds.max[1]]) {
        for (const z of [part.bounds.min[2], part.bounds.max[2]]) {
          const point = new Vector3(x - origin[0], y - origin[1], z - origin[2]).applyMatrix4(local).applyMatrix4(objectMatrix);
          points.push([point.x, point.y, point.z]);
        }
      }
    }
  }
  if (points.length < 2) throw new Error(`主体没有可取景的点：${subject}`);
  return points;
}

export interface SolvedMove {
  from: CameraPose; to: CameraPose; move: CameraMove; easing: Easing; orbitDegrees?: number; points?: V3[];
}

export function solveMove(options: {
  project: PrevisProject; objectId: string; start: number; end: number;
  move: string; composition: string; subject?: string;
  azimuth?: number; elevation?: number; fill?: number; focal?: number; aperture?: number; pullSpeed?: number;
}): SolvedMove {
  const requested = options.move === 'macro' ? 'slow-pull' : options.move === 'macro-orbit' ? 'orbit' : options.move === 'push-impact' ? 'slow-push' : options.move;
  if (!MOVE_NAMES.includes(requested as MoveName)) throw new Error(`未知运镜：${options.move}（支持 ${MOVE_NAMES.join(' / ')}）`);
  const compositionName = options.composition === 'macro' ? 'macro' : options.move === 'over-shoulder' && !COMPOSITIONS[options.composition] ? 'over-shoulder' : options.composition;
  const preset = COMPOSITIONS[compositionName];
  if (!preset) throw new Error(`未知构图：${options.composition}（支持 ${Object.keys(COMPOSITIONS).join(' / ')}）`);
  const azimuth = options.azimuth ?? preset.azimuth;
  const elevation = options.elevation ?? preset.elevation;
  const macro = compositionName === 'macro' || options.move === 'macro' || options.move === 'macro-orbit';
  const focal = options.focal ?? (options.move === 'macro-orbit' ? 90 : macro ? 85 : options.move === 'fly-along' ? 32 : options.move === 'over-shoulder' ? 40 : 50);
  const fill = options.fill ?? (macro ? 0.72 : requested === 'locked' ? 0.74 : options.move === 'whip' ? 0.62 : 0.6);
  const aperture = options.aperture ?? (options.move === 'rack-focus' ? 1.8 : macro ? 2.4 : requested === 'locked' ? 4 : 2.8);
  const aspect = options.project.width / options.project.height;
  const subject = options.subject ?? (requested === 'locked' ? 'motion' : macro ? 'shoulder' : 'arm');
  const minDistance = macro ? 0.08 : 0.35;
  const duration = Math.max(1 / options.project.fps, (options.end - options.start - 1) / options.project.fps);
  const framingSubject = subject === 'motion' ? 'arm' : subject;
  const fromPoints = subjectPoints(options.project, options.objectId, options.start, framingSubject);
  const toFrame = Math.max(options.start, options.end - 1);
  const toPoints = subject === 'motion'
    ? [...fromPoints, ...subjectPoints(options.project, options.objectId, toFrame, 'arm')]
    : subjectPoints(options.project, options.objectId, toFrame, framingSubject);
  const paint = (pose: CameraPose): CameraPose => ({...pose, aperture, focalLength: focal});
  const framed = subject === 'motion' ? toPoints : fromPoints;
  const startSolve = solveAt(framed, focal, aspect, azimuth, elevation, fill, preset.wantX, preset.wantY, minDistance);
  if (!startSolve) throw new Error(`构图无解：${options.move} / ${options.composition}`);

  if (options.move === 'rack-focus') {
    const pose = paint(startSolve.pose);
    const held = {...pose, position: [...pose.position] as V3, target: [...pose.target] as V3, aperture: 1.8};
    return {from: {...held, focusDistance: Math.max(0.2, pose.focusDistance * 0.28)}, to: held, move: 'linear', easing: 'smooth'};
  }
  if (requested === 'locked' || requested === 'over-shoulder') {
    const pose = paint(startSolve.pose);
    return {from: pose, to: {...pose, position: [...pose.position], target: [...pose.target]}, move: 'static', easing: 'linear'};
  }
  if (options.move === 'whip') {
    const end = solveAt(fromPoints, focal, aspect, azimuth + 78, elevation - 8, fill, preset.wantX, preset.wantY, minDistance) ?? startSolve;
    return {from: paint(startSolve.pose), to: paint(end.pose), move: 'linear', easing: 'ease-in'};
  }
  if (options.move === 'fly-along') {
    const end = solveAt(fromPoints, focal + 6, aspect, azimuth + 28, elevation + 6, Math.min(0.84, fill + 0.08), preset.wantX, preset.wantY, minDistance) ?? startSolve;
    const mid = startSolve.pose.position.map((value, index) => (value + end.pose.position[index]) / 2 + [0.05, 0.08, -0.12][index]) as V3;
    return {from: paint(startSolve.pose), to: paint(end.pose), move: 'spline', easing: 'smooth', points: [mid]};
  }
  if (options.move === 'macro-orbit' || requested === 'orbit') {
    const sweep = options.move === 'macro-orbit' ? 70 : 26;
    const end = solveAt(fromPoints, focal, aspect, azimuth + sweep, elevation, fill, preset.wantX, preset.wantY, minDistance) ?? startSolve;
    return {from: paint(startSolve.pose), to: paint(end.pose), move: 'orbit', easing: 'smooth', orbitDegrees: options.move === 'macro-orbit' ? 70 : 26};
  }
  if (requested === 'crane') {
    const end = solveAt(fromPoints, focal, aspect, azimuth, elevation + 16, fill, preset.wantX, preset.wantY, minDistance) ?? startSolve;
    return {from: paint(startSolve.pose), to: paint(end.pose), move: 'linear', easing: 'smooth'};
  }
  if (requested === 'handheld') {
    const end = solveAt(fromPoints, focal, aspect, azimuth + 3, elevation + 1, fill * 0.96, preset.wantX, preset.wantY, minDistance) ?? startSolve;
    const mid = startSolve.pose.position.map((value, index) => value * 0.55 + end.pose.position[index] * 0.45 + [0.014, 0.008, -0.01][index]) as V3;
    return {from: {...paint(startSolve.pose), roll: -1.3}, to: {...paint(end.pose), roll: 1.1}, move: 'spline', easing: 'linear', points: [mid]};
  }
  const speed = options.pullSpeed ?? (options.move === 'push-impact' ? 0.45 : PULL_SPEED);
  const endDistance = Math.max(minDistance + 0.02, startSolve.distance + (requested === 'slow-push' ? -1 : 1) * speed * duration);
  const endFill = Math.min(0.92, Math.max(0.18, fill * (startSolve.distance / endDistance)));
  const end = solveAt(toPoints, focal, aspect, azimuth, elevation, endFill, preset.wantX, preset.wantY, minDistance) ?? startSolve;
  return {from: paint(startSolve.pose), to: paint(end.pose), move: 'linear', easing: options.move === 'push-impact' ? 'ease-out' : 'linear'};
}
