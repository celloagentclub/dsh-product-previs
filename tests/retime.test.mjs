import test from 'node:test';
import assert from 'node:assert/strict';
import {retimeToCuts, beatCuts} from '../src/core/retime.ts';

const shots = [
  {id: 'a', start: 0, end: 120},
  {id: 'b', start: 120, end: 240},
  {id: 'c', start: 240, end: 720},
];
const cuts = [0, 121, 240, 720];

test('cut frames follow the new boundary exactly', () => {
  const {shots: out} = retimeToCuts({shots, cuts, tracks: []});
  assert.deepEqual(out.map(s => [s.start, s.end]), [[0, 121], [121, 240], [240, 720]]);
});

test('a keyframe pinned to an old cut lands on the new cut', () => {
  const tracks = [{id: 't', objectId: 'o', property: 'position', keys: [{frame: 120, value: 1}]}];
  const {tracks: out} = retimeToCuts({shots, cuts, tracks});
  assert.equal(out[0].keys[0].frame, 121);
});

test('keyframes keep their position inside the shot', () => {
  // frame 60 is halfway through shot a (0-120) -> halfway through 0-121
  const tracks = [{id: 't', objectId: 'o', property: 'x', keys: [{frame: 60, value: 1}]}];
  const {tracks: out} = retimeToCuts({shots, cuts, tracks});
  assert.equal(out[0].keys[0].frame, 61);
});

test('keyframe values and easing are untouched', () => {
  const tracks = [{id: 't', objectId: 'o', property: 'x', keys: [{frame: 120, value: [1, 2, 3], easing: 'smooth'}]}];
  const {tracks: out} = retimeToCuts({shots, cuts, tracks});
  assert.deepEqual(out[0].keys[0].value, [1, 2, 3]);
  assert.equal(out[0].keys[0].easing, 'smooth');
});

test('keys that collide after rounding merge instead of duplicating', () => {
  // A shot shrinking hard forces two neighbouring frames onto the same target.
  const tiny = [{id: 'a', start: 0, end: 100}, {id: 'b', start: 100, end: 720}];
  const squeeze = [0, 4, 720];
  const tracks = [{id: 't', objectId: 'o', property: 'x', keys: [{frame: 98, value: 'first'}, {frame: 99, value: 'last'}]}];
  const {tracks: out} = retimeToCuts({shots: tiny, cuts: squeeze, tracks});
  const frames = out[0].keys.map(k => k.frame);
  assert.equal(new Set(frames).size, frames.length, '不能出现重复帧');
  // the later key wins where they collide
  const atFour = out[0].keys.filter(k => k.frame === 4);
  if (atFour.length) assert.equal(atFour[0].value, 'last');
});

test('adjacent keys stay distinct when there is room', () => {
  const tracks = [{id: 't', objectId: 'o', property: 'x', keys: [{frame: 120, value: 'at-cut'}, {frame: 121, value: 'after'}]}];
  const {tracks: out} = retimeToCuts({shots, cuts, tracks});
  assert.deepEqual(out[0].keys.map(k => [k.frame, k.value]), [[121, 'at-cut'], [122, 'after']]);
});

test('keyframe order stays sorted', () => {
  const tracks = [{id: 't', objectId: 'o', property: 'x', keys: [{frame: 0, value: 0}, {frame: 600, value: 1}, {frame: 120, value: 2}]}];
  const {tracks: out} = retimeToCuts({shots, cuts, tracks});
  const frames = out[0].keys.map(k => k.frame);
  assert.deepEqual(frames, [...frames].sort((a, b) => a - b));
});

test('mismatched or non-monotonic cuts are refused', () => {
  assert.throws(() => retimeToCuts({shots, cuts: [0, 100], tracks: []}), /切点数量/);
  assert.throws(() => retimeToCuts({shots, cuts: [0, 200, 100, 720], tracks: []}), /递增/);
  assert.throws(() => retimeToCuts({shots, cuts: [1, 121, 240, 720], tracks: []}), /第 0 帧/);
});

test('beat grid lands on eighth notes and keeps the total duration', () => {
  const six = [
    {id: '1', start: 0, end: 120}, {id: '2', start: 120, end: 240}, {id: '3', start: 240, end: 384},
    {id: '4', start: 384, end: 480}, {id: '5', start: 480, end: 600}, {id: '6', start: 600, end: 720},
  ];
  const out = beatCuts({bpm: 115, fps: 24, durationFrames: 720, shots: six});
  assert.equal(out.length, 7);
  assert.equal(out[0], 0);
  assert.equal(out[6], 720, '总时长必须保持 720 帧');
  const half = (60 / 115) * 24 / 2;
  for (const c of out.slice(1, -1)) {
    const beats = c / half;
    assert.ok(Math.abs(beats - Math.round(beats)) < 0.25, `切点 ${c} 不在八分音符网格上`);
  }
});

test('120 BPM at 24fps is exactly 12 frames per beat', () => {
  const out = beatCuts({bpm: 120, fps: 24, durationFrames: 720, shots: [
    {id: '1', start: 0, end: 120}, {id: '2', start: 120, end: 264}, {id: '3', start: 264, end: 720},
  ]});
  // 120 / 6 (half beat = 6 frames) -> 120 is already exact
  assert.deepEqual(out, [0, 120, 264, 720]);
});
