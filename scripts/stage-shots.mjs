/**
 * Stage the six shots with solved framing instead of hand-guessed metres.
 * Each shot states an intent (what fills the frame, from where, which way it moves)
 * and the solver returns the two camera endpoints. Subjects are measured on the
 * real frames, so animation and camera stay in sync.
 */
import {readFile} from 'node:fs/promises';
import {ProjectStore} from '../host/store.mjs';
import {solveCamera} from './solve-camera.mjs';

const store = new ProjectStore();
const id = process.argv[2] || 'previs-230c581a';
const project0 = await store.read(id);
const {evaluateProject} = await import('../host/generated-core.mjs');

const mid = (a, b) => Math.round((a + b) / 2);
const aspect = project0.width / project0.height;

/** Camera plan per shot. fill = fraction of frame height the subject should occupy. */
const plan = [
  {
    id: 'shot-01', name: '01 · 产品建立', start: 0, end: 120,
    description: '桌面高度起幅，升起并推近到产品英雄位；32→50mm，产品从占画面 38% 长到 62%。',
    subject: ['product'], aim: 'product',
    from: {az: 34, el: 6, fill: 0.38, focal: 32, cy: -0.15},
    to: {az: 24, el: 12, fill: 0.62, focal: 50, cy: 0.02},
  },
  {
    id: 'shot-02', name: '02 · 人物入场', start: 120, end: 240,
    // Framed on the person: this shot is their entrance, the desk is context.
    description: '跟随人物走近坐下，人物占画面 46%→58%，产品留在背景交代场景。',
    subject: ['actor'], aim: 'actor',
    from: {az: 52, el: 8, fill: 0.46, focal: 40, cx: 0.10},
    to: {az: 44, el: 6, fill: 0.58, focal: 44, cx: 0.04},
  },
  {
    id: 'shot-03', name: '03 · 伸手与关节', start: 240, end: 384,
    // Framed on the product: the joints and the screen are the subject; the hand
    // reaches into the same area, so it stays in frame on its own.
    description: '贴合关节动作的近景：机械臂转向与屏幕调整占画面 55%→68%，人物手部入画配合。',
    subject: ['product'], aim: 'product',
    from: {az: 52, el: 9, fill: 0.55, focal: 55, cx: 0.08},
    to: {az: 44, el: 11, fill: 0.68, focal: 70, cx: 0.02},
  },
  {
    id: 'shot-04', name: '04 · 产品环绕', start: 384, end: 480,
    // The display faces +X and every other shot sits on that side, so the orbit
    // sweeps 75° -> 0° and stays on the readable side of the 180° line.
    description: '在显示器正面一侧环绕产品，交代形式与体积，约 75°；48→55mm，产品保持 60% 高度。',
    subject: ['product'], aim: 'product',
    from: {az: 75, el: 12, fill: 0.60, focal: 48},
    to: {az: 0, el: 10, fill: 0.60, focal: 55},
    orbit: true,
  },
  {
    id: 'shot-05', name: '05 · 部件拆解', start: 480, end: 600,
    description: '随零件散开同步后拉，让拆解有呼吸空间，再随回装收拢；40→38mm，产品从 62% 收到 50%。',
    subject: ['product'], aim: 'product',
    from: {az: 30, el: 16, fill: 0.62, focal: 40},
    to: {az: 26, el: 18, fill: 0.50, focal: 38},
  },
  {
    id: 'shot-06', name: '06 · 收尾全景', start: 600, end: 720,
    // Two-shot by design: the closing frame holds product and user together.
    description: '产品与人物同框收尾，极缓推近留余韵；44→47mm，双主体从 42% 到 50%。',
    subject: ['product', 'actor'], aim: 'product',
    from: {az: 42, el: 9, fill: 0.42, focal: 44, cx: 0.14},
    to: {az: 38, el: 8, fill: 0.50, focal: 47, cx: 0.10},
  },
];

function subjectPointsAcross(startFrame, endFrame, subjectIds, samples = 9) {
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const f = Math.round(startFrame + (endFrame - startFrame) * (i / (samples - 1)));
    pts.push(...subjectPointsAt(f, subjectIds));
  }
  return pts;
}

function subjectPointsAt(frame, subjectIds) {
  const evaluated = evaluateProject(project0, frame);
  const pts = [];
  for (const objectId of subjectIds) {
    const object = project0.objects.find(o => o.id === objectId);
    const state = evaluated.objects[objectId];
    if (!object || !state?.visible) continue;
    if (object.kind === 'actor') {
      const h = object.actor?.height ?? 1.75, b = state.transform.position;
      for (const dx of [-0.28, 0.28]) for (const dz of [-0.28, 0.28]) for (const dy of [0, h]) {
        pts.push([b[0] + dx, b[1] + dy, b[2] + dz]);
      }
      continue;
    }
    const asset = project0.assets.find(a => a.id === object.assetId);
    if (!asset?.parts) continue;
    const origin = object.sourceOrigin ?? [0, 0, 0];
    const selected = object.partIds ?? asset.parts.map(p => p.id);
    for (const part of asset.parts) {
      if (!selected.includes(part.id)) continue;
      const m = state.partMatrices?.[part.id];
      if (!m) continue;
      for (let i = 0; i < 8; i++) {
        const c = [
          (i & 1) ? part.bounds.max[0] : part.bounds.min[0],
          (i & 2) ? part.bounds.max[1] : part.bounds.min[1],
          (i & 4) ? part.bounds.max[2] : part.bounds.min[2],
        ];
        const lx = c[0] - origin[0], ly = c[1] - origin[1], lz = c[2] - origin[2];
        pts.push([
          m[0] * lx + m[4] * ly + m[8] * lz + m[12] + state.transform.position[0],
          m[1] * lx + m[5] * ly + m[9] * lz + m[13] + state.transform.position[1],
          m[2] * lx + m[6] * ly + m[10] * lz + m[14] + state.transform.position[2],
        ]);
      }
    }
  }
  return pts;
}

const shots = [];
// Boundaries come from the live project so a retime (e.g. to music tempo) is not
// overwritten when cameras are re-solved.
const boundary = (id, fallback) => project0.shots.find(s => s.id === id) ?? fallback;
for (const step of plan) {
  const live = boundary(step.id, {start: step.start, end: step.end});
  const startFrame = live.start;
  const endFrame = live.end - 1;
  // Cover the whole shot at both ends: animation (explode, walking, joints) makes
  // the subject bigger between samples, and a camera framed only on the endpoints
  // lets it leave the frame in the middle.
  const fromPts = subjectPointsAcross(startFrame, mid(startFrame, endFrame), step.subject);
  const toPts = subjectPointsAcross(mid(startFrame, endFrame), endFrame, step.subject);
  const from = solveCamera({points: fromPts, focalLength: step.from.focal, aspect, azimuthDeg: step.from.az, elevationDeg: step.from.el, fill: step.from.fill, wantX: step.from.cx ?? 0, wantY: step.from.cy ?? 0});
  const to = solveCamera({points: toPts, focalLength: step.to.focal, aspect, azimuthDeg: step.to.az, elevationDeg: step.to.el, fill: step.to.fill, wantX: step.to.cx ?? 0, wantY: step.to.cy ?? 0});
  if (!from || !to) throw new Error('无法求解镜头 ' + step.id);
  const cameraSpec = {from: from.pose, to: to.pose, move: step.orbit ? 'orbit' : 'linear', easing: 'smooth'};
  shots.push({id: step.id, name: step.name, start: live.start, end: live.end, description: step.description, camera: cameraSpec});
  const f = r => (r ? `${r.bounds.height.toFixed(2)}h c(${r.bounds.cx.toFixed(2)},${r.bounds.cy.toFixed(2)})` : '-');
  const d = r => r ? Math.hypot(...r.pose.position.map((v, k) => v - r.pose.target[k])).toFixed(2) : '-';
  console.log(`${step.id} ${step.from.focal}->${step.to.focal}mm  ${f(from)} -> ${f(to)}  dist ${d(from)}/${d(to)}m`);
}

const saved = await store.mutate(id, project0.revision, p => ({...p, shots}), '按求解机位重排运镜');
console.log('camera restaged at revision', saved.revision);
