/**
 * Builds the small white-model GLB from src/product/arm.calibration.json.
 * Geometry is already in product-local meters. Node 0 is the group; part i is node i+1.
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const spec = JSON.parse(readFileSync(resolve(root, 'src/product/arm.calibration.json'), 'utf8'));
const out = resolve(root, process.argv[2] || 'assets/models/arm-white.glb');

const floats = [];
const indices = [];
function pushVertex(position, normal) {
  floats.push(...position, ...normal);
  return (floats.length / 6) - 1;
}
function addTriangle(a, b, c) { indices.push(a, b, c); }

function addBox(center, size, material) {
  const [cx, cy, cz] = center, [sx, sy, sz] = size.map(v => v / 2);
  const faces = [
    [[1, 0, 0], [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]]],
    [[0, 1, 0], [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]],
    [[0, -1, 0], [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]]],
    [[0, 0, 1], [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, -1]]],
  ];
  const start = indices.length;
  for (const [normal, corners] of faces) {
    const ids = corners.map(([x, y, z]) => pushVertex([cx + x * sx, cy + y * sy, cz + z * sz], normal));
    addTriangle(ids[0], ids[1], ids[2]);
    addTriangle(ids[0], ids[2], ids[3]);
  }
  return {start, count: indices.length - start, material};
}

function addCylinder(from, to, radius, material, sides = 12) {
  const axis = to.map((v, i) => v - from[i]);
  const length = Math.hypot(...axis) || 1;
  const y = axis.map(v => v / length);
  const tmp = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const xRaw = cross(tmp, y);
  const xl = Math.hypot(...xRaw) || 1;
  const x = xRaw.map(v => v / xl);
  const z = cross(x, y);
  const ring = (origin, normal) => Array.from({length: sides}, (_, i) => {
    const a = i / sides * Math.PI * 2;
    const offset = x.map((v, k) => v * Math.cos(a) * radius + z[k] * Math.sin(a) * radius);
    return pushVertex(origin.map((v, k) => v + offset[k]), normal ?? offset.map(v => v / radius));
  });
  const start = indices.length;
  const bottom = ring(from, y.map(v => -v));
  const top = ring(to, y);
  const bottomSide = ring(from);
  const topSide = ring(to);
  const bc = pushVertex(from, y.map(v => -v));
  const tc = pushVertex(to, y);
  for (let i = 0; i < sides; i++) {
    const n = (i + 1) % sides;
    addTriangle(bottom[i], bc, bottom[n]);
    addTriangle(top[n], tc, top[i]);
    addTriangle(bottomSide[i], topSide[i], topSide[n]);
    addTriangle(bottomSide[i], topSide[n], bottomSide[n]);
  }
  return {start, count: indices.length - start, material};
}

const primitives = [];
for (const part of spec.parts) {
  const material = part.id === 'display' || part.id === 'bracket' ? 1 : 0;
  primitives.push(part.shape === 'box' ? addBox(part.center, part.size, material) : addCylinder(part.from, part.to, part.radius, material));
}

const position = new Float32Array(floats.length / 2);
const normal = new Float32Array(floats.length / 2);
for (let i = 0; i < floats.length; i += 6) {
  const v = i / 6;
  position[v * 3] = floats[i]; position[v * 3 + 1] = floats[i + 1]; position[v * 3 + 2] = floats[i + 2];
  normal[v * 3] = floats[i + 3]; normal[v * 3 + 1] = floats[i + 4]; normal[v * 3 + 2] = floats[i + 5];
}
const indexArray = new Uint16Array(indices);
const bin = Buffer.concat([Buffer.from(position.buffer), Buffer.from(normal.buffer), Buffer.from(indexArray.buffer)]);
const posBytes = position.byteLength, norBytes = normal.byteLength, idxBytes = indexArray.byteLength;

function minMax(array, stride, offset) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < array.length; i += stride) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], array[i + offset + k]); max[k] = Math.max(max[k], array[i + offset + k]);
  }
  return {min, max};
}
const bounds = minMax(position, 3, 0);
let indexMin = Infinity, indexMax = -Infinity;
for (const value of indexArray) { indexMin = Math.min(indexMin, value); indexMax = Math.max(indexMax, value); }

const accessors = [
  {bufferView: 0, componentType: 5126, count: position.length / 3, type: 'VEC3', min: bounds.min, max: bounds.max},
  {bufferView: 1, componentType: 5126, count: normal.length / 3, type: 'VEC3'},
  {bufferView: 2, componentType: 5123, count: indexArray.length, type: 'SCALAR', min: [indexMin], max: [indexMax]},
];
const meshes = primitives.map((primitive, i) => ({
  name: spec.parts[i].id,
  primitives: [{attributes: {POSITION: 0, NORMAL: 1}, indices: 2, material: primitive.material, mode: 4}],
}));
// Each part needs its own index view, otherwise every mesh draws the whole buffer.
// Rebuild accessors per primitive.
const views = [];
const builtAccessors = [];
const builtMeshes = [];
let byteOffset = 0;
const chunks = [];
function align(n) { return (n + 3) & ~3; }
primitives.forEach((primitive, i) => {
  const slice = indexArray.slice(primitive.start, primitive.start + primitive.count);
  // Dedicated position/normal would be smaller to split, but sharing the vertex
  // buffer and slicing indices is enough: glTF indices address the shared vertex accessor.
  const idx = Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength);
  const pad = Buffer.alloc(align(idx.length));
  idx.copy(pad);
  const view = views.length;
  views.push({buffer: 0, byteOffset, byteLength: idx.length, target: 34963});
  byteOffset += pad.length;
  chunks.push(pad);
  const acc = builtAccessors.length;
  let lo = Infinity, hi = -Infinity;
  for (const value of slice) { lo = Math.min(lo, value); hi = Math.max(hi, value); }
  builtAccessors.push({bufferView: view, componentType: 5123, count: slice.length, type: 'SCALAR', min: [lo], max: [hi]});
  builtMeshes.push({name: spec.parts[i].id, primitives: [{attributes: {POSITION: 0, NORMAL: 1}, indices: acc, material: primitive.material, mode: 4}]});
});
const vertexBin = Buffer.concat([Buffer.from(position.buffer), Buffer.from(normal.buffer)]);
const vertexPad = Buffer.alloc(align(vertexBin.length));
vertexBin.copy(vertexPad);
const indexBin = Buffer.concat(chunks);
const binOut = Buffer.concat([vertexPad, indexBin]);
// Fix index view offsets to sit after the vertex block.
const vertexBytes = vertexPad.length;
for (const view of views) view.byteOffset += vertexBytes;
const posView = {buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962};
const norView = {buffer: 0, byteOffset: posBytes, byteLength: norBytes, target: 34962};
const allViews = [posView, norView, ...views.map(view => ({...view, buffer: 0}))];
// accessor bufferView indexes: position 0, normal 1, then index views start at 2.
// builtAccessors currently point at `view` which was 0-based in `views`. Shift by 2.
for (const acc of builtAccessors) acc.bufferView += 2;
const doc = {
  asset: {version: '2.0', generator: 'dsh-product-previs white arm'},
  scene: 0,
  scenes: [{nodes: [0]}],
  nodes: [
    {name: 'arm-white', children: spec.parts.map((_, i) => i + 1), extras: {_previsIndex: 0}},
    ...spec.parts.map((part, i) => ({name: part.id, mesh: i, extras: {_previsIndex: i + 1}})),
  ],
  meshes: builtMeshes,
  materials: [
    {name: 'clay', pbrMetallicRoughness: {baseColorFactor: [0.78, 0.79, 0.8, 1], metallicFactor: 0.35, roughnessFactor: 0.38}},
    {name: 'bezel', pbrMetallicRoughness: {baseColorFactor: [0.16, 0.17, 0.18, 1], metallicFactor: 0.6, roughnessFactor: 0.28}},
  ],
  accessors: [
    {bufferView: 0, componentType: 5126, count: position.length / 3, type: 'VEC3', min: bounds.min, max: bounds.max},
    {bufferView: 1, componentType: 5126, count: normal.length / 3, type: 'VEC3'},
    ...builtAccessors,
  ],
  bufferViews: allViews,
  buffers: [{byteLength: binOut.length}],
};
void accessors; void meshes; void indexMin; void indexMax; void idxBytes;
const json = Buffer.from(JSON.stringify(doc));
const jpad = Buffer.alloc(align(json.length), 0x20);
json.copy(jpad);
const total = 12 + 8 + jpad.length + 8 + binOut.length;
const header = Buffer.alloc(12);
header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jpad.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binOut.length, 0); bh.writeUInt32LE(0x004E4942, 4);
mkdirSync(dirname(out), {recursive: true});
writeFileSync(out, Buffer.concat([header, jh, jpad, bh, binOut]));
console.log(`${out} ${binOut.length + jpad.length} bytes, ${spec.parts.length} parts`);
