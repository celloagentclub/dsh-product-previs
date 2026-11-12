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
    title: 'CYBOPAL',
    style,
    look: style === 'brand' ? 'studio-black' : 'desk',
    logline: style === 'brand'
      ? '没有旁白，没有人。黑场里一条会自己动的显示器臂，用匀速后拉和大字把六轴讲完。'
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
  {sequence: 'teaser', sequenceName: '吊胃口', summary: '只给关节和字，不给整条手臂。', name: '字标', description: '黑场大字 CYBOPAL，字几乎不动，像镜头还在慢慢后退。', kind: 'broll-code', role: 'text', beats: 4, template: 'kinetic', lines: ['CYBOPAL']},
  {sequence: 'teaser', sequenceName: '吊胃口', summary: '只给关节和字，不给整条手臂。', name: '肩关节微距', description: '肩轴微距，匀速后拉，轮廓光勾出转轴。', kind: '3d', role: 'product', beats: 8, action: 'hold', move: 'slow-pull', composition: 'macro', subject: 'shoulder', focal: 85, fill: 0.7},
  {sequence: 'teaser', sequenceName: '吊胃口', summary: '只给关节和字，不给整条手臂。', name: '六轴', description: '半拍不到的字卡。', kind: 'broll-code', role: 'text', beats: 2, template: 'kinetic', lines: ['SIX AXIS']},
  {sequence: 'teaser', sequenceName: '吊胃口', summary: '只给关节和字，不给整条手臂。', name: '肘关节微距', description: '肘轴微距，后拉速度与上一镜相同。', kind: '3d', role: 'product', beats: 8, action: 'hold', move: 'slow-pull', composition: 'macro', subject: 'elbow', focal: 85, fill: 0.68},
  {sequence: 'teaser', sequenceName: '吊胃口', summary: '只给关节和字，不给整条手臂。', name: '它会动', description: '短字卡，把动作承诺出去。', kind: 'broll-code', role: 'text', beats: 2, template: 'kinetic', lines: ['IT MOVES']},
  {sequence: 'tech', sequenceName: '技术', summary: '底座、结构和一句语音指令。', name: 'AI 底座', description: '两行参数字。', kind: 'broll-code', role: 'text', beats: 3, template: 'spec', lines: ['AI', 'BASE']},
  {sequence: 'tech', sequenceName: '技术', summary: '底座、结构和一句语音指令。', name: '底座微距', description: '底座微距后拉，金属边缘吃到轮廓光。', kind: '3d', role: 'product', beats: 8, action: 'hold', move: 'slow-pull', composition: 'macro', subject: 'base', focal: 70, fill: 0.62},
  {sequence: 'tech', sequenceName: '技术', summary: '底座、结构和一句语音指令。', name: '结构', description: '六段铰链的结构示意。', kind: 'broll-code', role: 'text', beats: 2, template: 'diagram', lines: ['YAW', 'PITCH', 'ELBOW', 'WRIST', 'ROLL']},
  {sequence: 'tech', sequenceName: '技术', summary: '底座、结构和一句语音指令。', name: '语音指令', description: '界面示意：一句话让屏幕转竖。', kind: 'broll-code', role: 'text', beats: 2, template: 'ui', lines: ['转到竖屏', 'VOICE · GESTURE']},
  {sequence: 'reveal', sequenceName: '亮相', summary: '第一次看见整条手臂。', name: '整臂后拉', description: '产品居中，四周留黑，匀速后拉，姿态不动。', kind: '3d', role: 'product', beats: 10, action: 'hold', move: 'slow-pull', composition: 'centered', subject: 'arm', focal: 50, fill: 0.58, screenContent: 'CYBOPAL'},
  {sequence: 'reveal', sequenceName: '亮相', summary: '第一次看见整条手臂。', name: '手臂', description: '大字 THE ARM。', kind: 'broll-code', role: 'text', beats: 2, template: 'kinetic', lines: ['THE ARM']},
  {sequence: 'motion', sequenceName: '动作', summary: '产品在动的时候，机位锁死。', name: '展开', description: '正侧面固定机位，手臂从收拢滑到展开，底座和转轴都在画里。', kind: '3d', role: 'action', beats: 10, action: 'unfold', move: 'locked', composition: 'side', subject: 'motion', focal: 40, fill: 0.48},
  {sequence: 'motion', sequenceName: '动作', summary: '产品在动的时候，机位锁死。', name: '展开字卡', description: '动作之后的一个短字。', kind: 'broll-code', role: 'text', beats: 2, template: 'kinetic', lines: ['UNFOLD']},
  {sequence: 'motion', sequenceName: '动作', summary: '产品在动的时候，机位锁死。', name: '转竖屏', description: '正面固定机位，屏幕自己转到竖屏。', kind: '3d', role: 'action', beats: 8, action: 'portrait', move: 'locked', composition: 'front', subject: 'motion', focal: 45, fill: 0.55, screenContent: 'PORTRAIT'},
  {sequence: 'motion', sequenceName: '动作', summary: '产品在动的时候，机位锁死。', name: '竖屏字卡', description: '短字 PORTRAIT。', kind: 'broll-code', role: 'text', beats: 2, template: 'kinetic', lines: ['PORTRAIT']},
  {sequence: 'motion', sequenceName: '动作', summary: '产品在动的时候，机位锁死。', name: '线缆入槽', description: '45 度固定机位，线缆滑进走线槽。', kind: '3d', role: 'action', beats: 8, action: 'cable-tuck', move: 'locked', composition: 'angle45', subject: 'motion', focal: 40, fill: 0.5},
  {sequence: 'motion', sequenceName: '动作', summary: '产品在动的时候，机位锁死。', name: '一根线', description: '参数字 ONE CABLE。', kind: 'broll-code', role: 'text', beats: 2, template: 'spec', lines: ['ONE', 'CABLE']},
  {sequence: 'motion', sequenceName: '动作', summary: '产品在动的时候，机位锁死。', name: '点头', description: '侧面固定机位，屏幕轻轻点一下。', kind: '3d', role: 'action', beats: 6, action: 'nod', move: 'locked', composition: 'side', subject: 'screen', focal: 50, fill: 0.5},
  {sequence: 'climax', sequenceName: '高潮', summary: '半拍一刀。', name: '近', description: '高潮字卡。', kind: 'broll-code', role: 'climax', beats: 0.5, template: 'kinetic', lines: ['NEAR']},
  {sequence: 'climax', sequenceName: '高潮', summary: '半拍一刀。', name: '斜侧闪切', description: '固定斜侧，半拍。', kind: '3d', role: 'climax', beats: 0.5, action: 'hold', move: 'locked', composition: 'angle45', subject: 'arm', focal: 35, fill: 0.7},
  {sequence: 'climax', sequenceName: '高潮', summary: '半拍一刀。', name: '转', description: '高潮字卡。', kind: 'broll-code', role: 'climax', beats: 0.5, template: 'kinetic', lines: ['TURN']},
  {sequence: 'climax', sequenceName: '高潮', summary: '半拍一刀。', name: '正面闪切', description: '固定正面，半拍。', kind: '3d', role: 'climax', beats: 0.5, action: 'hold', move: 'locked', composition: 'front', subject: 'screen', focal: 50, fill: 0.72},
  {sequence: 'climax', sequenceName: '高潮', summary: '半拍一刀。', name: '升', description: '高潮字卡。', kind: 'broll-code', role: 'climax', beats: 0.5, template: 'kinetic', lines: ['RISE']},
  {sequence: 'climax', sequenceName: '高潮', summary: '半拍一刀。', name: '侧面闪切', description: '固定侧面，半拍。', kind: '3d', role: 'climax', beats: 0.5, action: 'hold', move: 'locked', composition: 'side', subject: 'arm', focal: 35, fill: 0.66},
  {sequence: 'climax', sequenceName: '高潮', summary: '半拍一刀。', name: '现在', description: '高潮最后一个字。', kind: 'broll-code', role: 'climax', beats: 0.5, template: 'kinetic', lines: ['NOW']},
  {sequence: 'climax', sequenceName: '高潮', summary: '半拍一刀。', name: '低机位闪切', description: '低机位固定，半拍。', kind: '3d', role: 'climax', beats: 0.5, action: 'hold', move: 'locked', composition: 'low', subject: 'arm', focal: 28, fill: 0.68},
  {sequence: 'end', sequenceName: '收尾', summary: '长一点的英雄镜头，然后把 logo 停住。', name: '英雄后拉', description: '整臂居中，再次匀速后拉，速度和前面的产品镜一样。', kind: '3d', role: 'product', beats: 14, action: 'hold', move: 'slow-pull', composition: 'centered', subject: 'arm', focal: 55, fill: 0.56, screenContent: 'CYBOPAL'},
  {sequence: 'end', sequenceName: '收尾', summary: '长一点的英雄镜头，然后把 logo 停住。', name: '标志', description: 'logo 长停，让观众喘口气。', kind: 'broll-code', role: 'logo', beats: 12, template: 'logo', lines: ['CYBOPAL', 'THE SCREEN THAT MOVES']},
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
