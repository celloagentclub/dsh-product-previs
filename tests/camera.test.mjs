import test from 'node:test';
import assert from 'node:assert/strict';
import {solveCamera, boundsOf, projectPoint} from '../scripts/solve-camera.mjs';

/** A 1×1×1 cube sitting on the ground, so 1 unit = 1 metre of subject. */
const cube = (cx = 0, cy = 0.5, cz = 0, size = 1) => {
  const pts = [];
  for (const x of [cx - size / 2, cx + size / 2])
    for (const y of [cy - size / 2, cy + size / 2])
      for (const z of [cz - size / 2, cz + size / 2]) pts.push([x, y, z]);
  return pts;
};

const ASPECT = 16 / 9;

test('projection puts a centred subject at screen centre', () => {
  const pts = cube();
  const b = boundsOf([0, 0.5, 10], [0, 0.5, 0], 50, ASPECT, pts);
  assert.ok(Math.abs(b.cx) < 1e-9);
  assert.ok(Math.abs(b.cy) < 1e-9);
});

test('requested filling of frame height is honoured', () => {
  for (const fill of [0.25, 0.5, 0.75]) {
    const solved = solveCamera({points: cube(), focalLength: 50, aspect: ASPECT, azimuthDeg: 0, elevationDeg: 0, fill});
    assert.ok(solved, `solve failed for fill ${fill}`);
    assert.ok(Math.abs(solved.bounds.height - fill * 2) < 0.02, `fill ${fill} gave height ${solved.bounds.height}`);
  }
});

test('closer requests move the camera closer', () => {
  const wide = solveCamera({points: cube(), focalLength: 50, aspect: ASPECT, azimuthDeg: 0, elevationDeg: 0, fill: 0.3});
  const tight = solveCamera({points: cube(), focalLength: 50, aspect: ASPECT, azimuthDeg: 0, elevationDeg: 0, fill: 0.7});
  assert.ok(tight.distance < wide.distance);
});

test('subject can be placed off centre on purpose', () => {
  const solved = solveCamera({points: cube(), focalLength: 50, aspect: ASPECT, azimuthDeg: 0, elevationDeg: 0, fill: 0.5, wantX: -0.35, wantY: 0.2});
  assert.ok(Math.abs(solved.bounds.cx - (-0.35)) < 0.02, `cx ${solved.bounds.cx}`);
  assert.ok(Math.abs(solved.bounds.cy - 0.2) < 0.02, `cy ${solved.bounds.cy}`);
  // sizing must survive the aim step
  assert.ok(Math.abs(solved.bounds.height - 1.0) < 0.05, `height ${solved.bounds.height}`);
});

test('camera direction follows the requested azimuth', () => {
  const pts = cube();
  const front = solveCamera({points: pts, focalLength: 50, aspect: ASPECT, azimuthDeg: 0, elevationDeg: 0, fill: 0.5});
  const side = solveCamera({points: pts, focalLength: 50, aspect: ASPECT, azimuthDeg: 90, elevationDeg: 0, fill: 0.5});
  assert.ok(front.pose.position[2] > 0, 'azimuth 0 should stand on +Z');
  assert.ok(side.pose.position[0] > 0, 'azimuth 90 should stand on +X');
});

test('elevation lifts the camera above the subject', () => {
  const solved = solveCamera({points: cube(), focalLength: 50, aspect: ASPECT, azimuthDeg: 0, elevationDeg: 30, fill: 0.5});
  assert.ok(solved.pose.position[1] > 0.5, 'camera should be above the subject centre');
});

test('impossible requests are refused rather than silently wrong', () => {
  const solved = solveCamera({points: cube(), focalLength: 50, aspect: ASPECT, azimuthDeg: 0, elevationDeg: 0, fill: 8});
  assert.equal(solved, null);
});
