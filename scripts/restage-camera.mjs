/**
 * Restage camera work only. Objects, joints, tracks and timing stay untouched so
 * any manual edits the director already made are preserved.
 *
 * World facts this design is built on (measured from the project, not guessed):
 *   product  x -0.47..-0.01  y 0.80..1.50  z -0.31..0.31   centre (-0.24, 1.15, 0)
 *   desk top y 0.80
 *   actor    walks x 0.96 -> 0.44, hand reaches to about (0.04, 1.24, 0.16)
 *   display faces +z, so shots that must read the screen stay on the +z side
 */
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ProjectStore} from '../host/store.mjs';

const store = new ProjectStore();
const id = process.argv[2] || 'previs-230c581a';
const project = await store.read(id);

const camera = (position, target, focalLength) => ({
  position,
  target,
  focalLength,
  focusDistance: Math.hypot(...position.map((v, i) => v - target[i])),
  aperture: 8,
});

const shot = (id, name, start, end, description, cameraSpec) => ({id, name, start, end, description, camera: cameraSpec});

const shots = [
  shot('shot-01', '01 · 产品建立', 0, 120, '桌面高度起幅，缓慢升起并推近到产品英雄位；32→50mm 收窄，交代空间再聚焦产品。', {
    from: camera([1.55, 0.86, 2.25], [-0.22, 0.98, 0], 32),
    to: camera([0.60, 1.32, 1.30], [-0.24, 1.20, 0], 50),
    move: 'linear', easing: 'smooth',
  }),
  shot('shot-02', '02 · 人物入场', 120, 240, '跟随人物走近，机位缓推并轻微左移，末段落到两人关系的中景；40→44mm。', {
    from: camera([1.78, 1.44, 1.95], [0.42, 1.04, 0.12], 40),
    to: camera([1.28, 1.30, 1.68], [0.14, 1.00, 0.06], 44),
    move: 'linear', easing: 'smooth',
  }),
  shot('shot-03', '03 · 伸手与关节', 240, 384, '贴合动作的近景：人物伸手、机械臂转向、屏幕调整；55→70mm 持续压近强化细节，不越出画面。', {
    from: camera([0.85, 1.30, 1.05], [-0.22, 1.15, 0], 55),
    to: camera([0.55, 1.34, 0.72], [-0.24, 1.24, 0.02], 70),
    move: 'linear', easing: 'smooth',
  }),
  shot('shot-04', '04 · 产品环绕', 384, 480, '环绕产品交代形式与体积，约 90° 横移；48→55mm 缓慢收紧。', {
    from: camera([0.95, 1.42, 1.30], [-0.24, 1.18, 0], 48),
    to: camera([-1.45, 1.30, 1.05], [-0.24, 1.18, 0], 55),
    move: 'orbit', easing: 'smooth',
  }),
  shot('shot-05', '05 · 部件拆解', 480, 600, '随零件散开同步后拉，让拆解有呼吸空间，再随回装收拢；40→38mm 保持全貌。', {
    from: camera([1.05, 1.52, 1.55], [-0.24, 1.24, 0], 40),
    to: camera([1.30, 1.68, 1.85], [-0.24, 1.32, 0], 38),
    move: 'linear', easing: 'smooth',
  }),
  shot('shot-06', '06 · 收尾全景', 600, 720, '产品与人物同框收尾，极缓推近留余韵；44→47mm。', {
    from: camera([1.62, 1.50, 2.05], [0.02, 1.02, 0.02], 44),
    to: camera([1.48, 1.44, 1.88], [0.04, 1.02, 0.02], 47),
    move: 'linear', easing: 'smooth',
  }),
];

const next = {...project, shots};
const saved = await store.mutate(id, project.revision, () => next, '重写六镜运镜');
console.log('shots restaged, revision', saved.revision);
for (const s of saved.shots) {
  console.log(` ${s.id} ${String(s.start).padStart(3)}-${String(s.end).padStart(3)} ${s.camera.move.padEnd(6)} ${s.camera.from.focalLength}->${s.camera.to.focalLength}mm`);
}
