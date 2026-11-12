// The framing solver is plain JavaScript so the existing node:test file can import it.
// @ts-expect-error no declaration file; the signature below is the contract tests already lock.
import {boundsOf as boundsOfRaw, projectPoint as projectPointRaw, solveCamera as solveCameraRaw} from '../../scripts/solve-camera.mjs';
import type {V3} from '../core/types';

export interface SolvedCamera {
  pose: {position: number[]; target: number[]; focalLength: number; focusDistance: number; aperture: number};
  bounds: {height: number; cx: number; cy: number; width: number};
  distance: number;
}

export function solveCamera(input: {
  points: number[][]; focalLength: number; aspect: number; azimuthDeg: number; elevationDeg: number;
  fill: number; wantX?: number; wantY?: number; minDistance?: number; maxDistance?: number;
}): SolvedCamera | null {
  return solveCameraRaw(input) as SolvedCamera | null;
}

export function boundsOf(position: V3, target: V3, focalLength: number, aspect: number, points: V3[]) {
  return boundsOfRaw(position, target, focalLength, aspect, points) as {height: number; cx: number; cy: number; width: number; x0: number; x1: number; y0: number; y1: number} | null;
}

export function projectPoint(position: V3, target: V3, focalLength: number, aspect: number, point: V3) {
  return projectPointRaw(position, target, focalLength, aspect, point) as {x: number; y: number; depth: number} | null;
}
