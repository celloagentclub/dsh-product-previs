/**
 * Compare a KeyShot (or any) GLB's segment origins with src/product/arm.calibration.json.
 * Usage: node scripts/calibrate-arm.mjs /path/to/model.glb
 * The 148MB source file stays outside git. Edit the JSON, then npm run arm:white.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const file = process.argv[2] || process.env.PREVIS_ARM_GLB || 'models/cybopal-arm.glb';
const spec = JSON.parse(readFileSync(resolve('src/product/arm.calibration.json'), 'utf8'));
let buf;
try { buf = readFileSync(resolve(file)); }
catch { console.error(`找不到 ${file}。把 KeyShot GLB 放到 models/cybopal-arm.glb（不要提交），或设置 PREVIS_ARM_GLB。`); process.exit(1); }
const jsonLen = buf.readUInt32LE(12);
const doc = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const nodes = doc.nodes || [];
const parent = new Map();
nodes.forEach((node, index) => (node.children || []).forEach(child => parent.set(child, index)));
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const local = node => node.matrix || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const world = index => { const chain = []; let cursor = index; while (cursor !== undefined) { chain.push(local(nodes[cursor])); cursor = parent.get(cursor); } return chain.reverse().reduce(mul); };
const tf = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const arm = nodes.findIndex(node => node.name === '移动机械臂');
if (arm < 0) { console.error('没有名为「移动机械臂」的节点。白模仍可用，但这份校准表对不上。'); process.exit(2); }
const origin = tf(world(arm), [0, 0, 0]);
console.log(`臂组世界原点 ${origin.map(v => v.toFixed(4)).join(', ')}  校准表 ${spec.armOriginWorld.join(', ')}`);
const byId = new Map(spec.joints.map(joint => [joint.id, joint.pivot]));
const named = [['第一段', 'seg2'], ['第二段', 'seg2'], ['第三段', 'seg3'], ['第四段', 'seg4']];
let worst = 0;
for (const [index, node] of nodes.entries()) {
  if (parent.get(index) !== arm) continue;
  const point = tf(world(index), [0, 0, 0]).map((value, axis) => value - origin[axis]);
  const match = named.find(([prefix]) => node.name.startsWith(prefix));
  const pivot = match ? byId.get(match[1]) : null;
  const delta = pivot ? Math.hypot(pivot[0] - point[0], pivot[1] - point[1], pivot[2] - point[2]) : null;
  if (delta !== null) worst = Math.max(worst, delta);
  console.log(`${node.name.padEnd(18)} 原点 ${point.map(v => v.toFixed(4)).join(', ')}  ${delta === null ? '参考（不参与铰链门限）' : `Δ ${(delta * 1000).toFixed(1)} mm`}`);
}
console.log(worst < 0.002 ? '第一到第四段铰链和校准表一致（2mm 内）。' : '铰链偏离校准表。改 src/product/arm.calibration.json 后运行 npm run arm:white。');
process.exit(worst < 0.002 ? 0 : 3);
