import {Vector3} from 'three';
import type {ActorGesture, ActorPose, EvaluatedObject, SceneObject, V3} from '../core/types';

export interface ActorSkeleton {
  pelvis: V3; chest: V3; neck: V3; head: V3;
  leftShoulder: V3; leftElbow: V3; leftHand: V3;
  rightShoulder: V3; rightElbow: V3; rightHand: V3;
  leftHip: V3; leftKnee: V3; leftFoot: V3;
  rightHip: V3; rightKnee: V3; rightFoot: V3;
}
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const down = (length: number, angle: number): V3 => [0, -length * Math.cos(angle), -length * Math.sin(angle)];

function poseSkeleton(pose: ActorPose, phase: number): ActorSkeleton {
  const seated = pose === 'sitting';
  const walking = pose === 'walking';
  const pelvis: V3 = [0, seated ? 0.56 : 0.94 + (walking ? Math.abs(Math.sin(phase)) * 0.018 : 0), 0];
  const shoulderY = pelvis[1] + 0.47;
  const leftShoulder: V3 = [-0.235, shoulderY, 0], rightShoulder: V3 = [0.235, shoulderY, 0];
  const legs = (side: number): {hip: V3; knee: V3; foot: V3} => {
    const hip: V3 = [side * 0.115, pelvis[1], 0];
    const cycle = phase + (side < 0 ? 0 : Math.PI);
    const swing = walking ? Math.sin(cycle) * 0.5 : 0;
    const knee = add(hip, seated ? [0, -0.03, 0.405] : down(0.43, swing));
    const foot = add(knee, seated ? [0, -0.445, 0.025] : down(0.43, swing - (walking ? Math.max(0, Math.sin(cycle)) * 0.85 : 0)));
    // Feet have a small, deterministic clearance while the support leg stays on the floor.
    foot[1] = Math.max(0.065, foot[1]);
    return {hip, knee, foot};
  };
  const left = legs(-1), right = legs(1);
  const arms = (side: number, shoulder: V3) => {
    const swing = walking ? -Math.sin(phase + (side < 0 ? 0 : Math.PI)) * 0.32 : 0;
    const elbow = add(shoulder, down(0.285, swing));
    return {elbow, hand: add(elbow, down(0.265, swing - 0.12))};
  };
  const la = arms(-1, leftShoulder), ra = arms(1, rightShoulder);
  return {
    pelvis, chest: [0, pelvis[1] + 0.27, 0], neck: [0, shoulderY + 0.075, 0], head: [0, shoulderY + 0.205, 0],
    leftShoulder, rightShoulder, leftElbow: la.elbow, leftHand: la.hand, rightElbow: ra.elbow, rightHand: ra.hand,
    leftHip: left.hip, leftKnee: left.knee, leftFoot: left.foot,
    rightHip: right.hip, rightKnee: right.knee, rightFoot: right.foot,
  };
}

function solveArm(shoulder: V3, target: V3, side: number): {elbow: V3; hand: V3} {
  const start = new Vector3(...shoulder);
  const delta = new Vector3(...target).sub(start);
  const length = Math.min(0.549, Math.max(0.025, delta.length()));
  const direction = delta.lengthSq() < 1e-12 ? new Vector3(0, -1, 0) : delta.normalize();
  const bend = new Vector3(side * 0.35, -1, 0);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(direction, -direction.z);
  bend.normalize();
  const along = (0.285 ** 2 - 0.265 ** 2 + length ** 2) / (2 * length);
  const height = Math.sqrt(Math.max(0, 0.285 ** 2 - along ** 2));
  return {elbow: start.clone().addScaledVector(direction, along).addScaledVector(bend, height).toArray() as V3, hand: start.clone().addScaledVector(direction, length).toArray() as V3};
}

function withGesture(base: ActorSkeleton, gesture: ActorGesture, target?: V3): ActorSkeleton {
  if (gesture === 'neutral') return base;
  const result = {...base};
  for (const side of [-1, 1]) {
    const shoulder = side < 0 ? base.leftShoulder : base.rightShoulder;
    let destination: V3;
    if (gesture === 'reach') destination = target ?? [side * 0.18, shoulder[1] - 0.18, 0.65];
    else if (gesture === 'raise') destination = [side * 0.34, shoulder[1] + 0.52, 0.03];
    else destination = [side * 0.17, shoulder[1] - 0.16, 0.43];
    const arm = solveArm(shoulder, destination, side);
    if (side < 0) {result.leftElbow = arm.elbow; result.leftHand = arm.hand;}
    else {result.rightElbow = arm.elbow; result.rightHand = arm.hand;}
  }
  return result;
}

/** Actor targets use object-local meters, before root rotation/scale, with feet at local y=0. */
export function evaluateActorSkeleton(object: SceneObject, state: EvaluatedObject): ActorSkeleton {
  const a = poseSkeleton(state.pose.from, state.walkPhase), b = poseSkeleton(state.pose.to, state.walkPhase);
  const base = {} as ActorSkeleton;
  for (const key of Object.keys(a) as (keyof ActorSkeleton)[]) base[key] = mix(a[key], b[key], state.pose.mix);
  const ratio = (object.actor?.height ?? 1.75) / 1.75;
  const target = object.actor?.target?.map(v => v / ratio) as V3 | undefined;
  const ga = withGesture(base, state.gesture.from, target), gb = withGesture(base, state.gesture.to, target);
  const result = {} as ActorSkeleton;
  for (const key of Object.keys(ga) as (keyof ActorSkeleton)[]) result[key] = mix(ga[key], gb[key], state.gesture.mix).map(v => v * ratio) as V3;
  return result;
}
