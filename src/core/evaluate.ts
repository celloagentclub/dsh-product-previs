import {Box3, CatmullRomCurve3, Euler, MathUtils, Matrix4, Quaternion, Vector3} from 'three';
import {screenMountMatrix, transformMatrix} from './matrices';
import type {ActorGesture, ActorPose, CameraPose, Easing, EvaluatedFrame, EvaluatedObject, JointBinding, Keyframe, PoseBlend, PrevisProject, SceneObject, Shot, Track, TrackValue, Transform, V3} from './types';

const rad = MathUtils.degToRad;
const deg = MathUtils.radToDeg;
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const vec = (a: V3) => new Vector3(...a);
const tuple = (v: Vector3): V3 => [v.x, v.y, v.z];
const mixV = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function ease(t: number, easing: Easing = 'linear'): number {
  t = clamp(t);
  if (easing === 'smooth') return t * t * (3 - 2 * t);
  if (easing === 'ease-in') return t * t;
  if (easing === 'ease-out') return 1 - (1 - t) * (1 - t);
  return t;
}

/** Keys use absolute project frames. Outside their interval they hold their nearest key. */
export function keyInterval(keys: Keyframe[], frame: number): {a: Keyframe; b: Keyframe; t: number} | null {
  if (!keys.length) return null;
  // Sorting copies is intentional: evaluation must not change the document on backward seeks.
  const ordered = [...keys].sort((a, b) => a.frame - b.frame);
  const first = ordered[0];
  if (frame <= first.frame) return {a: first, b: first, t: 0};
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1], b = ordered[i];
    if (frame < b.frame) return {a, b, t: ease((frame - a.frame) / (b.frame - a.frame), a.easing)};
  }
  const last = ordered[ordered.length - 1];
  return {a: last, b: last, t: 0};
}

function rotationAt(a: V3, b: V3, t: number): V3 {
  const from = new Quaternion().setFromEuler(new Euler(rad(a[0]), rad(a[1]), rad(a[2]), 'XYZ'));
  const to = new Quaternion().setFromEuler(new Euler(rad(b[0]), rad(b[1]), rad(b[2]), 'XYZ'));
  const result = new Euler().setFromQuaternion(from.slerp(to, t), 'XYZ');
  return [deg(result.x), deg(result.y), deg(result.z)];
}

function trackValue(track: Track | undefined, frame: number): TrackValue | undefined {
  const segment = track && keyInterval(track.keys, frame);
  if (!segment) return undefined;
  const {a, b, t} = segment;
  if (track?.property === 'visible' || track?.property === 'screen') return a.value;
  if (typeof a.value === 'number' && typeof b.value === 'number') return lerp(a.value, b.value, t);
  if (Array.isArray(a.value) && Array.isArray(b.value)) {
    return track?.property === 'rotation' ? rotationAt(a.value, b.value, t) : mixV(a.value, b.value, t);
  }
  return a.value;
}

function blendAt<T extends string>(track: Track | undefined, frame: number, fallback: T): PoseBlend<T> {
  const segment = track && keyInterval(track.keys, frame);
  if (!segment) return {from: fallback, to: fallback, mix: 0};
  return {from: segment.a.value as T, to: segment.b.value as T, mix: segment.t};
}

/** Parent pivots remain in object-local rest coordinates; use parent * local delta. */
export function orderedJoints(joints: JointBinding[]): JointBinding[] {
  const byId = new Map(joints.map(j => [j.id, j]));
  const done = new Set<string>(), visiting = new Set<string>(), result: JointBinding[] = [];
  const visit = (joint: JointBinding) => {
    if (done.has(joint.id)) return;
    if (visiting.has(joint.id)) throw new Error(`关节父级成环：${joint.id}`);
    visiting.add(joint.id);
    if (joint.parentId) {
      const parent = byId.get(joint.parentId);
      if (!parent) throw new Error(`关节 ${joint.id} 的父级不存在：${joint.parentId}`);
      visit(parent);
    }
    visiting.delete(joint.id);
    done.add(joint.id);
    result.push(joint);
  };
  joints.forEach(visit);
  return result;
}

function partMatrices(project: PrevisProject, object: SceneObject, angles: Record<string, number>, explode: number): Record<string, number[]> {
  const asset = project.assets.find(a => a.id === object.assetId);
  const parts = object.partIds ?? (asset?.kind === 'model' ? asset.parts.map(p => p.id) : []);
  const joints = orderedJoints(object.joints ?? []);
  const byId = new Map(joints.map(j => [j.id, j]));
  const deltas = new Map<string, Matrix4>();
  for (const j of joints) {
    const axis = vec(j.axis);
    if (axis.lengthSq() === 0) throw new Error(`关节轴不能为零：${j.id}`);
    const local = new Matrix4().makeTranslation(...j.pivot)
      .multiply(new Matrix4().makeRotationAxis(axis.normalize(), rad(angles[j.id] - j.restAngle)))
      .multiply(new Matrix4().makeTranslation(-j.pivot[0], -j.pivot[1], -j.pivot[2]));
    deltas.set(j.id, local);
  }
  const result: Record<string, number[]> = Object.create(null);
  for (const id of parts) {
    const influencing = new Set<string>();
    for (const j of joints) if (j.affects.includes(id)) {
      let ancestor: JointBinding | undefined = j;
      while (ancestor) {
        influencing.add(ancestor.id);
        ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
      }
    }
    const direction = object.explodeDirections?.[id] ?? [0, 0, 0];
    // Explosion offsets are authored in rest meters, added in the object frame (not rotated by a joint).
    const matrix = new Matrix4().makeTranslation(direction[0] * explode, direction[1] * explode, direction[2] * explode);
    for (const j of joints) if (influencing.has(j.id)) matrix.multiply(deltas.get(j.id)!);
    result[id] = matrix.toArray();
  }
  return result;
}

export function evaluateCamera(shot: Shot, frame: number): CameraPose {
  const {from, to, move, easing} = shot.camera;
  // end is exclusive: end-1 is the last displayed frame, and reaches the authored endpoint.
  const t = move === 'static' ? 0 : ease((frame - shot.start) / Math.max(1, shot.end - shot.start - 1), easing);
  const target = mixV(from.target, to.target, t);
  let position = mixV(from.position, to.position, t);
  if (move === 'orbit') {
    const a = vec(from.position).sub(vec(from.target));
    const b = vec(to.position).sub(vec(to.target));
    const ra = a.length(), rb = b.length();
    const thetaA = Math.atan2(a.x, a.z), thetaB = Math.atan2(b.x, b.z);
    const shortest = Math.atan2(Math.sin(thetaB - thetaA), Math.cos(thetaB - thetaA));
    const sweep = shot.camera.orbitDegrees === undefined ? shortest : rad(shot.camera.orbitDegrees);
    const theta = thetaA + sweep * t;
    const phiA = ra ? Math.acos(clamp(a.y / ra, -1, 1)) : Math.PI / 2;
    const phiB = rb ? Math.acos(clamp(b.y / rb, -1, 1)) : Math.PI / 2;
    const radius = lerp(ra, rb, t), phi = lerp(phiA, phiB, t);
    position = tuple(new Vector3(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.cos(theta)).add(vec(target)));
  } else if (move === 'spline') {
    const points = [from.position, ...(shot.camera.points ?? []), to.position];
    position = tuple(new CatmullRomCurve3(points.map(vec), false, 'centripetal').getPoint(t));
  }
  const rollA = from.roll ?? 0, rollB = to.roll ?? 0;
  const rollDelta = ((rollB - rollA + 540) % 360) - 180;
  return {position, target, focalLength: lerp(from.focalLength, to.focalLength, t), focusDistance: lerp(from.focusDistance, to.focusDistance, t), aperture: lerp(from.aperture, to.aperture, t), roll: rollA + rollDelta * t};
}

function finiteResult(value: unknown, path = 'frame'): void {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`求值产生了非有限数值：${path}`);
  if (Array.isArray(value)) value.forEach((v, i) => finiteResult(v, `${path}[${i}]`));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => finiteResult(v, `${path}.${k}`));
}

/** Stateless absolute-frame evaluation, shared by the live stage and offline renderer. */
export function evaluateProject(project: PrevisProject, frame: number): EvaluatedFrame {
  return evaluateProjectInternal(project, frame, true);
}

function bindingPoint(project: PrevisProject, frame: EvaluatedFrame, binding: NonNullable<Shot['camera']['targetBinding']>): V3 {
  const object = project.objects.find(o => o.id === binding.objectId);
  const state = frame.objects[binding.objectId];
  if (!object || !state) throw new Error(`镜头注视对象不存在：${binding.objectId}`);
  const local = new Vector3(...(binding.offset ?? [0, 0, 0]));
  if (binding.partId) {
    const asset = project.assets.find(a => a.id === object.assetId);
    const part = asset?.kind === 'model' ? asset.parts.find(p => p.id === binding.partId) : undefined;
    const delta = state.partMatrices[binding.partId];
    if (!part || !delta) throw new Error(`镜头注视部件不存在：${binding.partId}`);
    local.add(vec(part.center).sub(vec(object.sourceOrigin ?? [0, 0, 0]))).applyMatrix4(new Matrix4().fromArray(delta));
  } else if (object.kind === 'model') {
    const asset = project.assets.find(a => a.id === object.assetId);
    if (asset?.kind === 'model') {
      const bounds = new Box3(), origin = vec(object.sourceOrigin ?? [0, 0, 0]);
      for (const part of asset.parts) {
        const delta = state.partMatrices[part.id];
        if (!delta) continue;
        bounds.union(new Box3(vec(part.bounds.min).sub(origin), vec(part.bounds.max).sub(origin)).applyMatrix4(new Matrix4().fromArray(delta)));
      }
      if (!bounds.isEmpty()) local.add(bounds.getCenter(new Vector3()));
    }
  } else if (object.kind === 'actor') local.y += (object.actor?.height ?? 1.75) * 0.5;
  return tuple(local.applyMatrix4(transformMatrix(state.transform)).applyMatrix4(screenMountMatrix(project, frame, object)));
}

function evaluateProjectInternal(project: PrevisProject, frame: number, applyBinding: boolean): EvaluatedFrame {
  if (!Number.isFinite(frame)) throw new Error('帧号必须是有限数值');
  if (!project.shots.length) throw new Error('项目没有镜头；请先添加拍摄镜头再预览或导出');
  if (!Number.isFinite(project.durationFrames) || project.durationFrames < 1 || !Number.isFinite(project.fps) || project.fps <= 0) throw new Error('项目时长或帧率无效');
  frame = clamp(frame, 0, project.durationFrames - 1);
  const shots = [...project.shots].sort((a, b) => a.start - b.start);
  const shot = shots.find(s => s.start <= frame && frame < s.end)
    ?? [...shots].reverse().find(s => s.start <= frame) ?? shots[0];
  const objects: Record<string, EvaluatedObject> = Object.create(null);
  const trackMap = new Map<string, Map<string, Track>>();
  for (const track of project.tracks) {
    if (!trackMap.has(track.objectId)) trackMap.set(track.objectId, new Map());
    trackMap.get(track.objectId)!.set(track.property, track);
  }
  for (const object of project.objects) {
    const tracks = trackMap.get(object.id);
    const get = (property: string) => trackValue(tracks?.get(property), frame);
    const transform: Transform = {
      position: [...(get('position') as V3 ?? object.transform.position)],
      rotation: [...(get('rotation') as V3 ?? object.transform.rotation)],
      scale: [...(get('scale') as V3 ?? object.transform.scale)],
    };
    const jointAngles: Record<string, number> = Object.create(null);
    for (const joint of object.joints ?? []) jointAngles[joint.id] = clamp(get(`joint:${joint.id}`) as number ?? joint.restAngle, joint.minDeg, joint.maxDeg);
    const explode = Math.max(0, get('explode') as number ?? 0);
    const visibility = get('visible');
    const visible = visibility === undefined ? object.visible : typeof visibility === 'number' ? visibility >= 0.5 : visibility === 'true';
    objects[object.id] = {
      id: object.id, transform, visible, jointAngles, partMatrices: partMatrices(project, object, jointAngles, explode), explode,
      pose: blendAt<ActorPose>(tracks?.get('pose'), frame, object.actor?.pose ?? 'standing'),
      gesture: blendAt<ActorGesture>(tracks?.get('gesture'), frame, object.actor?.gesture ?? 'neutral'),
      screen: get('screen') as string | undefined,
      walkPhase: (frame / project.fps * Math.PI * 2 * 1.25) % (Math.PI * 2),
    };
  }
  const result: EvaluatedFrame = {frame, shotId: shot.id, camera: evaluateCamera(shot, frame), objects};
  const binding = applyBinding ? shot.camera.targetBinding : undefined;
  if (binding) {
    const point = bindingPoint(project, result, binding);
    result.camera.target = point;
    if (binding.followPosition) {
      // Evaluate objects at the reference frame without applying camera bindings: no recursive follow chain.
      const start = evaluateProjectInternal(project, shot.start, false);
      const delta = vec(point).sub(vec(bindingPoint(project, start, binding)));
      result.camera.position = tuple(vec(result.camera.position).add(delta));
    }
  }
  finiteResult(result);
  return result;
}
