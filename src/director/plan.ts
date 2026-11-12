export type FilmStyle = 'brand' | 'creator';
export type ShotRole = 'product' | 'text' | 'action' | 'climax' | 'logo';

export interface Narrative {
  title: string;
  style: FilmStyle;
  look: 'studio-black' | 'desk';
  logline: string;
  bpm: number;
  durationSec: number;
  brief: string;
  vo: boolean;
}

export interface ShotDraft {
  id: string;
  name: string;
  description: string;
  sequence: string;
  sequenceName: string;
  summary: string;
  kind: '3d' | 'broll-code';
  role: ShotRole;
  beats: number;
  template?: 'kinetic' | 'spec' | 'ui' | 'diagram' | 'logo';
  lines?: string[];
  action?: string;
  move?: string;
  composition?: string;
  subject?: string;
  focal?: number;
  fill?: number;
  screenContent?: string;
  dialogue?: {speaker: string; line: string; vo?: boolean};
}

const numberIn = (brief: string, pattern: RegExp, fallback: number) => {
  const match = pattern.exec(brief);
  return match ? Number(match[1]) : fallback;
};

/** Writer: story, on-screen words, and whether anybody speaks. Brand films stay silent. */
export function writeNarrative(brief: string): Narrative {
  const style: FilmStyle = /博主|口播|手持|测评/.test(brief) ? 'creator' : 'brand';
  const durationSec = numberIn(brief, /(\d{2,3})\s*秒/, style === 'brand' ? 40 : 24);
  const bpm = numberIn(brief, /(\d{2,3})\s*(?:bpm|BPM|拍)/, style === 'brand' ? 178 : 96);
  return {
    title: style === 'brand' ? 'ZEESWAY A1' : 'ZEESWAY',
    style,
    look: style === 'brand' ? 'studio-black' : 'desk',
    logline: style === 'brand'
      ? 'The AI agent with a body. You focus. It handles the rest.'
      : '桌面上的口播：手持跟一下，俯拍看清走线，再让屏幕自己转到竖屏。',
    bpm, durationSec, brief,
    vo: style === 'creator',
  };
}

interface Row {
  sequence: string; sequenceName: string; summary: string;
  name: string; description: string; kind: ShotDraft['kind']; role: ShotRole; beats: number;
  template?: ShotDraft['template']; lines?: string[]; action?: string;
  move?: string; composition?: string; subject?: string; focal?: number; fill?: number; screenContent?: string;
  dialogue?: ShotDraft['dialogue'];
}

const BRAND: Row[] = [
  {sequence: 'task', sequenceName: '任务', summary: '底座小屏正在干活。', name: '底座屏', description: '微距推近底座状态屏，焦段从近处拉到屏幕上。手臂还收着。', kind: '3d', role: 'product', beats: 10, action: 'hold-folded', move: 'rack-focus', composition: 'macro', subject: 'base', focal: 80, fill: 0.7, screenContent: 'Working · Step 2 of 3'},
  {sequence: 'task', sequenceName: '任务', summary: '底座小屏正在干活。', name: '沿臂飞行', description: '镜头贴着收拢的手臂飞到肘部。产品不动。', kind: '3d', role: 'product', beats: 7, action: 'hold-folded', move: 'fly-along', composition: 'angle45', subject: 'arm', focal: 32, fill: 0.58, screenContent: 'Working · Step 2 of 3'},
  {sequence: 'lift', sequenceName: '升起', summary: '手臂把屏幕抬到眼睛的高度。', name: '甩镜', description: '短促甩镜，切到侧面。', kind: '3d', role: 'product', beats: 2, action: 'hold-folded', move: 'whip', composition: 'side', subject: 'arm', focal: 35, fill: 0.6},
  {sequence: 'lift', sequenceName: '升起', summary: '手臂把屏幕抬到眼睛的高度。', name: '展开到眼高', description: '侧面机位锁死。手臂从贴着底座展开，屏幕升到视线高度。', kind: '3d', role: 'action', beats: 18, action: 'unfold-eye', move: 'locked', composition: 'side', subject: 'motion', focal: 40, fill: 0.78, screenContent: 'Working · Step 2 of 3'},
  {sequence: 'lift', sequenceName: '升起', summary: '手臂把屏幕抬到眼睛的高度。', name: '关节环绕', description: '微距环绕肘关节。手臂停住。', kind: '3d', role: 'product', beats: 7, action: 'hold', move: 'macro-orbit', composition: 'macro', subject: 'elbow', focal: 90, fill: 0.68},
  {sequence: 'gesture', sequenceName: '手势', summary: '挥一下，屏幕自己靠近。', name: '挥手', description: '字卡，代替真人挥手。', kind: 'broll-code', role: 'text', beats: 2, template: 'kinetic', lines: ['WAVE']},
  {sequence: 'gesture', sequenceName: '手势', summary: '挥一下，屏幕自己靠近。', name: '拉近', description: '侧面机位锁死。屏幕朝使用者伸出一大段。', kind: '3d', role: 'action', beats: 14, action: 'pull-closer', move: 'locked', composition: 'side', subject: 'motion', focal: 45, fill: 0.76, screenContent: 'Working · Step 3 of 3'},
  {sequence: 'done', sequenceName: '完成', summary: '做完了，屏幕转向你。', name: '转向你', description: '正面机位锁死。整条手臂连屏幕一起转过来对着人。', kind: '3d', role: 'action', beats: 16, action: 'turn-toward', move: 'locked', composition: 'front', subject: 'motion', focal: 40, fill: 0.74, screenContent: 'Done · 6 min'},
  {sequence: 'done', sequenceName: '完成', summary: '做完了，屏幕转向你。', name: '转成竖屏', description: '正面机位仍然锁死。屏幕从横屏转到竖屏。', kind: '3d', role: 'action', beats: 10, action: 'portrait', move: 'locked', composition: 'front', subject: 'screen', focal: 55, fill: 0.7, screenContent: 'Done · 6 min'},
  {sequence: 'done', sequenceName: '完成', summary: '做完了，屏幕转向你。', name: '推近', description: '先快后慢地推到屏幕上，焦点落到 Done。', kind: '3d', role: 'product', beats: 7, action: 'hold-portrait', move: 'push-impact', composition: 'front', subject: 'screen', focal: 65, fill: 0.55, screenContent: 'Done · 6 min'},
  {sequence: 'end', sequenceName: '收尾', summary: '口号和名字。', name: '口号上', description: 'You focus.', kind: 'broll-code', role: 'text', beats: 8, template: 'kinetic', lines: ['You focus.']},
  {sequence: 'end', sequenceName: '收尾', summary: '口号和名字。', name: '口号下', description: 'It handles the rest.', kind: 'broll-code', role: 'text', beats: 6, template: 'kinetic', lines: ['It handles the rest.']},
  {sequence: 'end', sequenceName: '收尾', summary: '口号和名字。', name: '名字', description: '片名停住。', kind: 'broll-code', role: 'logo', beats: 12, template: 'logo', lines: ['ZEESWAY A1', 'THE AI AGENT WITH A BODY']},
];

const CREATOR: Row[] = [
  {sequence: 'open', sequenceName: '开场', summary: '先说话，再给桌子。', name: '标题', description: '口播标题卡。', kind: 'broll-code', role: 'text', beats: 4, template: 'kinetic', lines: ['这架子会自己动'], dialogue: {speaker: 'host', line: '这架子会自己动。', vo: true}},
  {sequence: 'open', sequenceName: '开场', summary: '先说话，再给桌子。', name: '手持中景', description: '手持中景，像坐在对面拍。', kind: '3d', role: 'product', beats: 8, action: 'hold', move: 'handheld', composition: 'centered', subject: 'arm', focal: 35, fill: 0.55},
  {sequence: 'desk', sequenceName: '桌面', summary: '俯拍看清底座和线。', name: '桌面俯拍', description: '从上往下看底座和走线。', kind: '3d', role: 'product', beats: 8, action: 'hold', move: 'locked', composition: 'top', subject: 'base', focal: 28, fill: 0.6},
  {sequence: 'desk', sequenceName: '桌面', summary: '俯拍看清底座和线。', name: '过肩', description: '过肩看屏幕，人在画外。', kind: '3d', role: 'action', beats: 8, action: 'portrait', move: 'over-shoulder', composition: 'over-shoulder', subject: 'screen', focal: 40, fill: 0.5},
  {sequence: 'end', sequenceName: '收尾', summary: '口播收在产品上。', name: '收束', description: '字卡收尾。', kind: 'broll-code', role: 'logo', beats: 6, template: 'logo', lines: ['CYBOPAL', '放在桌上就行']},
];

function stamp(rows: Row[]): ShotDraft[] {
  return rows.map((row, index) => ({...row, id: `s${String(index + 1).padStart(2, '0')}`}));
}

/** Director: which shots exist, how long they are in beats, and what the product does. */
export function directShots(narrative: Narrative): ShotDraft[] {
  return stamp(narrative.style === 'creator' ? CREATOR : BRAND);
}

/** DP: turn each shot into a named move and a composition. Creator coverage gets handheld. */
export function photograph(shots: ShotDraft[], narrative: Narrative): ShotDraft[] {
  return shots.map(shot => {
    if (shot.kind !== '3d') return shot;
    if (narrative.style === 'creator' && shot.move === 'slow-pull') return {...shot, move: 'handheld', composition: shot.composition ?? 'centered'};
    return shot;
  });
}

/** Editor: keep the accordion, and stretch or squeeze beat lengths so the film hits the asked duration. */
export function editRhythm(shots: ShotDraft[], narrative: Narrative): ShotDraft[] {
  const total = shots.reduce((sum, shot) => sum + shot.beats, 0);
  const seconds = total * 60 / narrative.bpm;
  const factor = narrative.durationSec / seconds;
  if (Math.abs(factor - 1) <= 0.08) return shots;
  return shots.map(shot => {
    const scaled = Math.max(shot.role === 'climax' ? 0.5 : 1, Math.round(shot.beats * factor * 2) / 2);
    return {...shot, beats: scaled};
  });
}

export function planFilm(narrative: Narrative): ShotDraft[] {
  return editRhythm(photograph(directShots(narrative), narrative), narrative);
}
