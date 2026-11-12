import {Matrix4, Vector3} from 'three';
import type {Easing, JointBinding, ModelAsset, V3} from '../core/types';
import calibration from './arm.calibration.json';

export interface ArmPartSpec {
  id: string; label: string; role: 'product' | 'screen';
  shape: 'box' | 'cylinder';
  center?: number[]; size?: number[];
  from?: number[]; to?: number[]; radius?: number;
}

const rad = (deg: number) => deg * Math.PI / 180;
const v3 = (a: number[]): V3 => [a[0], a[1], a[2]];

export const ARM_ORIGIN_WORLD: V3 = v3(calibration.armOriginWorld);
export const SCREEN_CENTER: V3 = v3(calibration.screenCenter);
export const ARM_PARTS = calibration.parts as ArmPartSpec[];
export const ARM_JOINTS: JointBinding[] = calibration.joints.map(joint => ({
  id: joint.id,
  label: joint.label,
  parentId: 'parentId' in joint ? joint.parentId : undefined,
  pivot: v3(joint.pivot),
  axis: v3(joint.axis),
  minDeg: joint.minDeg,
  maxDeg: joint.maxDeg,
  restAngle: joint.restAngle,
  affects: [...joint.affects],
}));

/** GLB node 0 is the group; part i lives on node i+1 with extras._previsIndex. */
export function partNodeIndex(partId: string): number {
  const index = ARM_PARTS.findIndex(part => part.id === partId);
  if (index < 0) throw new Error(`机械臂部件不存在：${partId}`);
  return index + 1;
}

export const ACTIONS = ['hold', 'unfold', 'fold', 'rise', 'lower', 'follow-face', 'portrait', 'landscape', 'nod', 'cable-tuck'] as const;
export type ArmAction = typeof ACTIONS[number];

const POSE_DELTAS: Record<string, Record<string, number>> = {
  rest: {},
  folded: calibration.poses.folded,
  portrait: calibration.poses.portrait,
  nod: calibration.poses.nod,
  raised: {seg2: 12, seg3: -8},
  lowered: {seg2: -20, seg3: 16},
};

export function jointById(id: string): JointBinding {
  const joint = ARM_JOINTS.find(item => item.id === id);
  if (!joint) throw new Error(`关节不存在：${id}`);
  return joint;
}

export function clampJoint(id: string, angle: number): number {
  const joint = jointById(id);
  return Math.min(joint.maxDeg, Math.max(joint.minDeg, angle));
}

export function poseAngles(name: string): Record<string, number> {
  const delta = POSE_DELTAS[name];
  if (!delta) throw new Error(`姿态不存在：${name}`);
  const angles: Record<string, number> = {};
  for (const joint of ARM_JOINTS) angles[joint.id] = clampJoint(joint.id, delta[joint.id] ?? joint.restAngle);
  return angles;
}

/** Same parent-before-child order as evaluate.ts, duplicated so the product layer does not import the evaluator. */
function ordered(joints: JointBinding[]): JointBinding[] {
  const byId = new Map(joints.map(joint => [joint.id, joint]));
  const done = new Set<string>();
  const result: JointBinding[] = [];
  const visit = (joint: JointBinding) => {
    if (done.has(joint.id)) return;
    if (joint.parentId) {
      const parent = byId.get(joint.parentId);
      if (parent) visit(parent);
    }
    done.add(joint.id);
    result.push(joint);
  };
  joints.forEach(visit);
  return result;
}

export function influencingJoints(partId: string): JointBinding[] {
  const byId = new Map(ARM_JOINTS.map(joint => [joint.id, joint]));
  const ids = new Set<string>();
  for (const joint of ARM_JOINTS) if (joint.affects.includes(partId)) {
    let current: JointBinding | undefined = joint;
    while (current) {
      ids.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return ordered(ARM_JOINTS.filter(joint => ids.has(joint.id)));
}

function rotateAround(point: V3, pivot: V3, axis: V3, degrees: number): V3 {
  if (Math.abs(degrees) < 1e-10) return [...point];
  const matrix = new Matrix4().makeTranslation(...pivot)
    .multiply(new Matrix4().makeRotationAxis(new Vector3(...axis).normalize(), rad(degrees)))
    .multiply(new Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
  return new Vector3(...point).applyMatrix4(matrix).toArray() as V3;
}

/** Forward kinematics in product-local meters. Child hinges run first, matching evaluateProject. */
export function transformPoint(partId: string, local: V3, angles: Record<string, number>): V3 {
  const chain = influencingJoints(partId);
  let point = [...local] as V3;
  for (const joint of [...chain].reverse()) {
    const delta = (angles[joint.id] ?? joint.restAngle) - joint.restAngle;
    point = rotateAround(point, joint.pivot, joint.axis, delta);
  }
  return point;
}

export function screenPosition(angles: Record<string, number>): V3 {
  return transformPoint('display', SCREEN_CENTER, angles);
}

export interface IkResult { angles: Record<string, number>; error: number; screen: V3; reached: boolean }

const IK_JOINTS = ['seg4', 'seg3', 'seg2', 'base_yaw'];

/** Jacobian-transpose IK on the four joints that translate the screen. Portrait is applied separately. */
export function solveIk(goal: V3, seed: Record<string, number> = {}, portrait?: number): IkResult {
  const angles = poseAngles('rest');
  for (const [id, value] of Object.entries(seed)) if (id in angles && Number.isFinite(value)) angles[id] = clampJoint(id, value);
  if (portrait !== undefined) angles.portrait = clampJoint('portrait', portrait);
  const distance = () => Math.hypot(...goal.map((value, index) => value - screenPosition(angles)[index]));
  for (let iteration = 0; iteration < 24 && distance() > 0.008; iteration++) {
    for (const id of IK_JOINTS) {
      const origin = angles[id];
      let best = origin, bestError = distance();
      for (const delta of [-24, -10, -4, -1.5, -0.4, 0.4, 1.5, 4, 10, 24]) {
        angles[id] = clampJoint(id, origin + delta);
        const error = distance();
        if (error < bestError) { bestError = error; best = angles[id]; }
      }
      angles[id] = best;
    }
  }
  const screen = screenPosition(angles);
  const error = Math.hypot(...goal.map((value, index) => value - screen[index]));
  return {angles, error, screen, reached: error < 0.02};
}

export interface ActionKey { frame: number; value: number | V3; easing?: Easing }
export interface ActionPlan {
  joints: Record<string, ActionKey[]>;
  motions: {objectId: string; property: 'position'; keys: ActionKey[]}[];
}

function keysFor(start: number, end: number, from: Record<string, number>, to: Record<string, number>, mid?: {at: number; pose: Record<string, number>}): Record<string, ActionKey[]> {
  const last = Math.max(start, end - 1);
  const joints: Record<string, ActionKey[]> = {};
  for (const joint of ARM_JOINTS) {
    const keys: ActionKey[] = [{frame: start, value: from[joint.id], easing: 'smooth'}];
    if (mid && mid.at > start && mid.at < last) keys.push({frame: mid.at, value: mid.pose[joint.id], easing: 'smooth'});
    if (last !== start) keys.push({frame: last, value: to[joint.id], easing: 'smooth'});
    joints[joint.id] = keys;
  }
  return joints;
}

const CABLE_OUT: V3 = [0.18, 0.05, 0.09];
const CABLE_IN: V3 = [0.055, 0.036, 0.05];

function faceGoal(goal?: V3, facing?: V3, distance?: number): V3 {
  if (goal) return goal;
  const face: V3 = [0.9, 0.42, 0.05];
  const look = facing ?? [-1, 0, 0];
  const length = Math.hypot(...look) || 1;
  const metres = distance ?? 0.6;
  return face.map((value, index) => value + look[index] / length * metres) as V3;
}

/** Joint keys (and the cable move) for one shot. Every actuated joint is keyed at both ends so a 3D shot does not drift toward the next one. */
export function planAction(action: string, start: number, end: number, options: {goal?: V3; facing?: V3; distance?: number; portrait?: boolean} = {}): ActionPlan {
  if (!ACTIONS.includes(action as ArmAction)) throw new Error(`未知机械臂动作：${action}（支持 ${ACTIONS.join(' / ')}）`);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) throw new Error('动作需要整数帧并且 start < end');
  const rest = poseAngles('rest');
  const folded = poseAngles('folded');
  const portrait = poseAngles('portrait');
  const nod = poseAngles('nod');
  const motions: ActionPlan['motions'] = [];
  let from = rest, to = rest, mid: {at: number; pose: Record<string, number>} | undefined;
  if (action === 'unfold') { from = folded; to = rest; }
  else if (action === 'fold') { from = rest; to = folded; }
  else if (action === 'rise') { from = poseAngles('lowered'); to = poseAngles('raised'); }
  else if (action === 'lower') { from = poseAngles('raised'); to = poseAngles('lowered'); }
  else if (action === 'portrait') { from = rest; to = portrait; }
  else if (action === 'landscape') { from = portrait; to = rest; }
  else if (action === 'nod') {
    from = portrait; to = portrait;
    mid = {at: start + Math.max(1, Math.round((end - start) * 0.45)), pose: nod};
  } else if (action === 'cable-tuck') {
    from = portrait; to = portrait;
    const last = Math.max(start, end - 1);
    motions.push({objectId: 'cable', property: 'position', keys: [{frame: start, value: CABLE_OUT, easing: 'smooth'}, {frame: last, value: CABLE_IN, easing: 'smooth'}]});
  } else if (action === 'follow-face') {
    const solved = solveIk(faceGoal(options.goal, options.facing, options.distance), rest, options.portrait === false ? 0 : 90);
    from = rest;
    to = solved.angles;
  }
  return {joints: keysFor(start, end, from, to, mid), motions};
}

function boundsOf(part: ArmPartSpec): {min: V3; max: V3; center: V3} {
  const points: V3[] = [];
  if (part.shape === 'box' && part.center && part.size) {
    const center = v3(part.center), size = v3(part.size);
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push([center[0] + x * size[0] / 2, center[1] + y * size[1] / 2, center[2] + z * size[2] / 2]);
  } else if (part.from && part.to && part.radius) {
    const from = v3(part.from), to = v3(part.to), radius = part.radius;
    const axis = to.map((value, index) => value - from[index]) as V3;
    const length = Math.hypot(...axis) || 1;
    const y = axis.map(value => value / length) as V3;
    const tmp: V3 = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const x = cross(tmp, y);
    const xl = Math.hypot(...x) || 1;
    const xu = x.map(value => value / xl) as V3;
    const z = cross(xu, y);
    for (const origin of [from, to]) for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      points.push(origin.map((value, index) => value + (xu[index] * Math.cos(angle) + z[index] * Math.sin(angle)) * radius) as V3);
    }
  }
  const min = [0, 1, 2].map(index => Math.min(...points.map(point => point[index]))) as V3;
  const max = [0, 1, 2].map(index => Math.max(...points.map(point => point[index]))) as V3;
  const center = min.map((value, index) => (value + max[index]) / 2) as V3;
  return {min, max, center};
}

export function armModelAsset(file = 'assets/arm-white.glb'): ModelAsset {
  const parts = ARM_PARTS.map(part => {
    const bounds = boundsOf(part);
    return {id: part.id, label: part.label, nodeIndex: partNodeIndex(part.id), bounds: {min: bounds.min, max: bounds.max}, center: bounds.center, role: part.role === 'screen' ? 'screen' as const : 'product' as const};
  });
  const min = [0, 1, 2].map(index => Math.min(...parts.map(part => part.bounds.min[index]))) as V3;
  const max = [0, 1, 2].map(index => Math.max(...parts.map(part => part.bounds.max[index]))) as V3;
  return {
    id: 'arm-white', name: 'CyboPal 白模', kind: 'model', file, sourceName: 'arm-white.glb', hash: 'arm-white',
    originalBytes: 0, previewBytes: 0, triangles: 960,
    bounds: {min, max}, parts,
  };
}

export function lowestPoint(angles: Record<string, number>): number {
  let low = Infinity;
  for (const part of ARM_PARTS) {
    const asset = armModelAsset().parts.find(item => item.id === part.id)!;
    for (const x of [asset.bounds.min[0], asset.bounds.max[0]]) {
      for (const y of [asset.bounds.min[1], asset.bounds.max[1]]) {
        for (const z of [asset.bounds.min[2], asset.bounds.max[2]]) {
          low = Math.min(low, transformPoint(part.id, [x, y, z], angles)[1]);
        }
      }
    }
  }
  return low;
}
