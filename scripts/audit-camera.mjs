/** Camera framing audit: where does the subject actually land in frame? */
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {evaluateProject} from '../host/generated-core.mjs';

const P = process.env.PREVIS_PROJECT || '';
if (!P) { console.error('请设置 PREVIS_PROJECT 指向预演工程目录'); process.exit(1); }
const project = JSON.parse(await readFile(join(P, 'project.json'), 'utf8'));

/** Project a world point into normalized screen space using the shot camera. */
function projectPoint(pose, point, aspect) {
  const {position: p, target: t} = pose;
  const fwd = [t[0] - p[0], t[1] - p[1], t[2] - p[2]];
  const fl = Math.hypot(...fwd) || 1;
  const f = fwd.map(v => v / fl);
  let right = [f[2] * 0 - f[1] * 0, 0, 0];
  // right = normalize(cross(f, up)) with up = (0,1,0)
  right = [f[2], 0, -f[0]];
  const rl = Math.hypot(...right) || 1;
  right = right.map(v => v / rl);
  const up = [
    right[1] * f[2] - right[2] * f[1],
    right[2] * f[0] - right[0] * f[2],
    right[0] * f[1] - right[1] * f[0],
  ];
  const d = [point[0] - p[0], point[1] - p[1], point[2] - p[2]];
  const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (z <= 1e-6) return null;
  const x = (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / z;
  const y = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / z;
  // full-frame 36mm sensor, focalLength mm -> half-height in NDC
  const halfH = 18 / pose.focalLength;
  const halfW = halfH * aspect;
  return {x: x / halfW, y: y / halfH, depth: z};
}

const aspect = project.width / project.height;

function subjectBoxes(frame, project) {
  const out = {};
  for (const object of project.objects) {
    if (['plane', 'light'].includes(object.kind)) continue;
    const state = frame.objects[object.id];
    if (!state?.visible) continue;
    const asset = project.assets.find(a => a.id === object.assetId);
    const pts = [];
    if (object.kind === 'model' && asset?.kind === 'model') {
      const origin = object.sourceOrigin ?? [0, 0, 0];
      const selected = object.partIds ?? asset.parts.map(p => p.id);
      for (const part of asset.parts) {
        if (!selected.includes(part.id)) continue;
        const m = state.partMatrices[part.id];
        if (!m) continue;
        for (const corner of [0, 1, 2, 3, 4, 5, 6, 7].map(i => [
          (i & 1) ? part.bounds.max[0] : part.bounds.min[0],
          (i & 2) ? part.bounds.max[1] : part.bounds.min[1],
          (i & 4) ? part.bounds.max[2] : part.bounds.min[2],
        ])) {
          const lx = corner[0] - origin[0], ly = corner[1] - origin[1], lz = corner[2] - origin[2];
          pts.push([
            m[0] * lx + m[4] * ly + m[8] * lz + m[12] + state.transform.position[0],
            m[1] * lx + m[5] * ly + m[9] * lz + m[13] + state.transform.position[1],
            m[2] * lx + m[6] * ly + m[10] * lz + m[14] + state.transform.position[2],
          ]);
        }
      }
    } else if (object.kind === 'actor') {
      const h = object.actor?.height ?? 1.75;
      const b = state.transform.position;
      for (const dx of [-0.3, 0.3]) for (const dz of [-0.3, 0.3]) for (const dy of [0, h]) {
        pts.push([b[0] + dx, b[1] + dy, b[2] + dz]);
      }
    } else {
      const s = state.transform.scale, b = state.transform.position;
      for (const dx of [-s[0] / 2, s[0] / 2]) for (const dz of [-s[2] / 2, s[2] / 2]) {
        pts.push([b[0] + dx, b[1] + s[1] / 2, b[2] + dz]);
      }
    }
    out[object.id] = pts;
  }
  return out;
}

const report = [];
for (const shot of project.shots) {
  for (const frameAt of [shot.start, shot.start + Math.floor((shot.end - shot.start - 1) / 2), shot.end - 1]) {
    const frame = evaluateProject(project, frameAt);
    const boxes = subjectBoxes(frame, project);
    let all = [];
    const per = {};
    for (const [id, pts] of Object.entries(boxes)) {
      const projected = pts.map(p => projectPoint(frame.camera, p, aspect)).filter(Boolean);
      if (!projected.length) continue;
      const bx = {
        x0: Math.min(...projected.map(p => p.x)), x1: Math.max(...projected.map(p => p.x)),
        y0: Math.min(...projected.map(p => p.y)), y1: Math.max(...projected.map(p => p.y)),
        depth: Math.min(...projected.map(p => p.depth)),
      };
      per[id] = bx;
      all = all.concat(projected);
    }
    if (!all.length) continue;
    const box = {
      x0: Math.min(...all.map(p => p.x)), x1: Math.max(...all.map(p => p.x)),
      y0: Math.min(...all.map(p => p.y)), y1: Math.max(...all.map(p => p.y)),
    };
    const offscreen = Object.entries(per).filter(([, b]) => b.x0 < -1 || b.x1 > 1 || b.y0 < -1 || b.y1 > 1).map(([id]) => id);
    report.push({
      shot: shot.name, frame: frameAt, move: shot.camera.move, focal: Math.round(frame.camera.from?.focalLength ?? frame.camera.focalLength),
      prodX: [+per.product?.x0.toFixed(2), +per.product?.x1.toFixed(2)].join('..'),
      prodY: [+per.product?.y0.toFixed(2), +per.product?.y1.toFixed(2)].join('..'),
      actorX: per.actor ? [+per.actor.x0.toFixed(2), +per.actor.x1.toFixed(2)].join('..') : '-',
      wide: `${box.x0.toFixed(2)}..${box.x1.toFixed(2)} x ${box.y0.toFixed(2)}..${box.y1.toFixed(2)}`,
      offscreen,
    });
  }
}
console.table(report);
