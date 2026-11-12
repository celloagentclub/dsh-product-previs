/**
 * Per-frame framing safety: does any named subject leave the frame anywhere in
 * a shot? Three sample frames per shot is not enough — animation moves the
 * subject between them, so this walks every frame.
 */
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {evaluateProject} from '../host/generated-core.mjs';
import {projectPoint} from './solve-camera.mjs';

const P = process.env.PREVIS_PROJECT || '';
if (!P) { console.error('请设置 PREVIS_PROJECT 指向预演工程目录'); process.exit(1); }
const project = JSON.parse(await readFile(join(P, 'project.json'), 'utf8'));
const aspect = project.width / project.height;

function pointsOf(evaluated, objectId) {
  const object = project.objects.find(o => o.id === objectId);
  const state = evaluated.objects[objectId];
  if (!object || !state?.visible) return [];
  if (object.kind === 'actor') {
    const h = object.actor?.height ?? 1.75, b = state.transform.position;
    const pts = [];
    for (const dx of [-0.28, 0.28]) for (const dz of [-0.28, 0.28]) for (const dy of [0, h]) pts.push([b[0] + dx, b[1] + dy, b[2] + dz]);
    return pts;
  }
  const asset = project.assets.find(a => a.id === object.assetId);
  if (!asset?.parts) return [];
  const origin = object.sourceOrigin ?? [0, 0, 0];
  const selected = object.partIds ?? asset.parts.map(p => p.id);
  const pts = [];
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
  return pts;
}

/** Which objects must stay readable in each shot. */
const mustSee = {
  'shot-01': ['product'],
  'shot-02': ['actor'],
  'shot-03': ['product'],
  'shot-04': ['product'],
  'shot-05': ['product'],
  'shot-06': ['product', 'actor'],
};

const rows = [];
for (const shot of project.shots) {
  const wanted = mustSee[shot.id] ?? ['product'];
  let worst = null;
  for (let f = shot.start; f < shot.end; f++) {
    const evaluated = evaluateProject(project, f);
    for (const id of wanted) {
      const pts = pointsOf(evaluated, id);
      const proj = pts.map(p => projectPoint(evaluated.camera.position, evaluated.camera.target, evaluated.camera.focalLength, aspect, p));
      if (proj.some(p => p === null)) {
        worst = worst ?? {frame: f, id, reason: 'behind camera'};
        continue;
      }
      const x0 = Math.min(...proj.map(p => p.x)), x1 = Math.max(...proj.map(p => p.x));
      const y0 = Math.min(...proj.map(p => p.y)), y1 = Math.max(...proj.map(p => p.y));
      // Frame edges are at -1 and +1. Overflow is how far past an edge the subject goes.
      const out = Math.max(0, -1 - y0, y1 - 1);
      // x normally exceeds 1 for wide subjects; horizontal crop is expected, vertical is not.
      const cut = (y0 < -1 ? 1 : 0) + (y1 > 1 ? 1 : 0);
      if (!worst || out > worst.out || (cut > (worst.cut || 0))) {
        worst = {frame: f, id, out: +out.toFixed(2), cut, box: [x0, x1, y0, y1].map(v => +v.toFixed(2))};
      }
    }
  }
  rows.push({shot: shot.name, want: wanted.join('+'), worstFrame: worst?.frame, worstSubject: worst?.id, overrun: worst?.out, edgesCut: worst?.cut, box: worst?.box?.join(',')});
}
console.table(rows);
const bad = rows.filter(r => r.overrun > 0.02);
if (bad.length) {
  console.log('\n出画镜头：');
  for (const r of bad) console.log(` ${r.shot} @${r.worstFrame} ${r.worstSubject} 纵向超出画面 ${r.overrun}`);
}
