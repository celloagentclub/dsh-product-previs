/**
 * Write the Seedance prompt sheet from project data — every focal length, camera
 * move and action timing is read from the project, not retyped by hand.
 */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';

const P = process.env.PREVIS_PROJECT || '';
if (!P) { console.error('请设置 PREVIS_PROJECT 指向预演工程目录'); process.exit(1); }
const OUT = process.argv[2] || '/tmp/previs-handoff';
const project = JSON.parse(await readFile(join(P, 'project.json'), 'utf8'));
const {evaluateProject} = await import('../host/generated-core.mjs');

const moveName = {linear: '推/移', orbit: '环绕', spline: '路径', static: '固定'};
/** Say what the camera physically does, based on the solved endpoints. */
function motionPhrase(shot) {
  const a = dist(shot.camera.from), b = dist(shot.camera.to);
  const delta = b - a;
  const inOut = Math.abs(delta) < 0.15 ? '距离基本不变' : delta < 0 ? `机位从约 ${a.toFixed(1)} 米推近到 ${b.toFixed(1)} 米` : `机位从约 ${a.toFixed(1)} 米后拉到 ${b.toFixed(1)} 米`;
  const az0 = azim(shot.camera.from), az1 = azim(shot.camera.to);
  const swing = Math.round(((az1 - az0 + 540) % 360) - 180);
  const lateral = Math.abs(swing) < 4 ? '' : `并水平移动约 ${Math.abs(swing)}°（${swing > 0 ? '向右' : '向左'}）`;
  const rise = el(shot.camera.to) - el(shot.camera.from);
  const lift = Math.abs(rise) < 1.5 ? '' : `，同时${rise > 0 ? '升高' : '降低'}约 ${Math.abs(rise).toFixed(0)}°`;
  return inOut + lateral + lift;
}
const easeName = {smooth: '缓入缓出', linear: '匀速', 'ease-in': '渐加速', 'ease-out': '渐减速'};

function azim(pose) {
  const [x, , z] = pose.position.map((v, i) => v - pose.target[i]);
  return Math.round(Math.atan2(x, z) * 180 / Math.PI);
}
const el = pose => {
  const d = pose.position.map((v, i) => v - pose.target[i]);
  const horiz = Math.hypot(d[0], d[2]);
  return Math.round(Math.atan2(d[1], horiz) * 180 / Math.PI);
};
const dist = pose => Math.hypot(...pose.position.map((v, i) => v - pose.target[i]));

/** Describe what the product/user are doing inside this shot, from the tracks. */
function actionText(shot) {
  const parts = [];
  const jointKeys = new Set();
  for (const track of project.tracks) {
    if (!track.property.startsWith('joint:')) continue;
    for (const k of track.keys) if (k.frame >= shot.start && k.frame < shot.end && k.value !== 0) jointKeys.add(track.property);
  }
  if (jointKeys.size) parts.push(`机械臂 ${jointKeys.size} 个关节转向`);
  const explode = project.tracks.find(t => t.objectId === 'product' && t.property === 'explode');
  if (explode) {
    const active = explode.keys.filter(k => k.frame >= shot.start && k.frame < shot.end);
    const peak = Math.max(...active.map(k => Number(k.value) || 0));
    if (peak > 0.5) parts.push('部件逐层离开装配位并回装');
  }
  const pose = project.tracks.find(t => t.objectId === 'actor' && t.property === 'pose');
  if (pose) {
    const inShot = pose.keys.filter(k => k.frame >= shot.start && k.frame < shot.end).map(k => k.value);
    if (inShot.includes('walking')) parts.push('人物走动入位');
    if (inShot.includes('sitting')) parts.push('人物坐下');
  }
  const gesture = project.tracks.find(t => t.objectId === 'actor' && t.property === 'gesture');
  if (gesture) {
    const inShot = gesture.keys.filter(k => k.frame >= shot.start && k.frame < shot.end).map(k => k.value);
    if (inShot.includes('reach')) parts.push('抬手伸向屏幕');
    if (inShot.includes('type')) parts.push('手部在桌面前操作');
  }
  const screen = project.tracks.find(t => t.objectId === 'screen-content' && t.property === 'screen');
  if (screen) {
    const texts = [...new Set(screen.keys.filter(k => k.frame >= shot.start && k.frame < shot.end).map(k => k.value))];
    if (texts.length) parts.push(`屏幕内容 ${texts.map(t => `「${t}」`).join(' → ')}`);
  }
  return parts.length ? parts.join('，') : '产品静置，环境与光线保持稳定';
}

const lines = [];
lines.push('# Seedance 交接包 · 二代 AI 机械臂\n');
lines.push('每个镜头给两张真实材质关键帧（首/尾）和一段提示词。提示词里的焦段、机位角度、时长、动作时序都由预演工程导出，不是手写估计。\n');
lines.push('用法：把 `frames/<shot>_start.png` 作为图生视频的首帧参考（有尾帧槽位时再给 `_end.png`），提示词粘贴进 Seedance。\n');
lines.push('---\n');

for (const shot of project.shots) {
  const startState = evaluateProject(project, shot.start);
  const endState = evaluateProject(project, shot.end - 1);
  const seconds = (shot.end - shot.start) / project.fps;
  const f0 = shot.camera.from.focalLength, f1 = shot.camera.to.focalLength;
  const lens = f0 === f1 ? `${f0}mm` : `${f0}mm → ${f1}mm`;
  const entry = [];
  lines.push(`## ${shot.name}`);
  lines.push('');
  lines.push(`- 时长：${seconds.toFixed(2)} 秒（第 ${shot.start}–${shot.end - 1} 帧 @ ${project.fps}fps）`);
  lines.push(`- 参考帧：\`frames/${shot.id}_start.png\`、\`frames/${shot.id}_end.png\``);
  lines.push(`- 运镜：${moveName[shot.camera.move]}｜${easeName[shot.camera.easing]}｜${lens}`);
  lines.push(`- 机位：距主体 ${dist(shot.camera.from).toFixed(1)}m → ${dist(shot.camera.to).toFixed(1)}m；水平 ${azim(shot.camera.from)}° → ${azim(shot.camera.to)}°；俯角 ${el(shot.camera.from)}° → ${el(shot.camera.to)}°`);
  lines.push(`- 画面动作：${actionText(shot)}`);
  lines.push('');
  lines.push('**提示词**');
  lines.push('');
  lines.push(
    `真实材质产品广告片：黑色金属机械臂（关节处橙色细节）夹持一台显示器，置于白色办公桌上，背景为干净的浅灰白色空间，柔和自然光。` +
    `摄影机${moveName[shot.camera.move]}，${lens}，${easeName[shot.camera.easing]}，${motionPhrase(shot)}，俯角约 ${el(shot.camera.from)} 度。` +
    `${actionText(shot)}。` +
    `产品结构清晰、比例准确，黑色磨砂金属与屏幕玻璃反光真实；画面干净，无文字叠加，无镜头抖动。`
  );
  lines.push('');
  lines.push('---');
  lines.push('');
}

await mkdir(OUT, {recursive: true});
await writeFile(join(OUT, 'SHOT_PROMPTS.md'), lines.join('\n'));
console.log('wrote SHOT_PROMPTS.md');
