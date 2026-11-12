import {boundsOf} from '../camera/solver';
import {PULL_SPEED, subjectPoints} from '../camera/moves';
import type {Command, PrevisProject, Shot, V3} from '../core/types';
import {evaluateProject} from '../core/evaluate';

export interface RubricScore {
  shotId: string;
  composition: number;
  subjectSize: number;
  rhythm: number;
  light: number;
  continuity: number;
  total: number;
  notes: string[];
}

const BANDS: Record<string, [number, number]> = {
  product: [1.15, 2.9],
  text: [0.3, 1.2],
  action: [1.2, 3.4],
  climax: [0.12, 0.5],
  logo: [2, 6],
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function rhythmScore(shot: Shot, fps: number): number {
  const seconds = (shot.end - shot.start) / fps;
  const band = BANDS[shot.intent?.role ?? (shot.kind === 'broll-code' ? 'text' : 'product')];
  if (!band) return 0.7;
  if (seconds >= band[0] && seconds <= band[1]) return 1;
  const gap = seconds < band[0] ? band[0] - seconds : seconds - band[1];
  return clamp01(1 - gap / band[1]);
}

export function scoreProject(project: PrevisProject): RubricScore[] {
  const shots = [...project.shots].sort((a, b) => a.start - b.start);
  const aspect = project.width / project.height;
  let previousSpeed: number | undefined;
  return shots.map(shot => {
    const notes: string[] = [];
    const seconds = (shot.end - shot.start) / project.fps;
    const rhythm = rhythmScore(shot, project.fps);
    const lightBase = project.film?.look === 'studio-black' || project.film?.look === 'desk' ? 0.65 : 0.35;
    if (shot.kind === 'broll-code') {
      return finish(shot.id, {composition: 1, subjectSize: 1, rhythm, light: lightBase + 0.35, continuity: 1, notes});
    }
    const frame = shot.start;
    const endFrame = Math.max(shot.start, shot.end - 1);
    const state = evaluateProject(project, frame);
    const subject = shot.intent?.subject === 'motion' ? 'arm' : (shot.intent?.subject ?? 'arm');
    const union = shot.intent?.subject === 'motion' || shot.intent?.move === 'locked';
    let points: V3[] = [];
    try {
      points = subjectPoints(project, 'arm', frame, subject);
      if (union) points = [...points, ...subjectPoints(project, 'arm', endFrame, 'arm')];
    }
    catch { notes.push('主体点取失败'); }
    const bounds = points.length ? boundsOf(state.camera.position, state.camera.target, state.camera.focalLength, aspect, points) : null;
    const targetFill = shot.intent?.fill ?? 0.58;
    const measured = bounds ? bounds.height / 2 : 0;
    const subjectSize = bounds ? clamp01(1 - Math.abs(measured - targetFill) / Math.max(0.2, targetFill)) : 0.2;
    if (!bounds) notes.push('投影失败');
    else if (measured < targetFill * 0.75) notes.push(`主体偏小 ${measured.toFixed(2)} / ${targetFill}`);
    const wantX = shot.intent?.wantX ?? 0;
    const wantY = shot.intent?.wantY ?? 0;
    const placed = bounds ? Math.hypot((bounds.cx - wantX), (bounds.cy - wantY)) : 1;
    let composition = bounds ? clamp01(1 - placed / 0.45) : 0.2;
    if (bounds && (Math.abs(bounds.x0) > 1.05 || Math.abs(bounds.x1) > 1.05 || Math.abs(bounds.y0) > 1.05 || Math.abs(bounds.y1) > 1.05)) {
      composition *= 0.55;
      notes.push('主体出画');
    }
    const macro = (shot.intent?.focal ?? state.camera.focalLength) >= 70;
    const apertureOk = macro ? state.camera.aperture <= 4 : state.camera.aperture >= 2;
    const light = lightBase + (apertureOk ? 0.35 : 0.1);
    let continuity = 1;
    const move = shot.intent?.move;
    if (move === 'slow-pull' || move === 'slow-push') {
      const start = evaluateProject(project, shot.start).camera;
      const end = evaluateProject(project, Math.max(shot.start, shot.end - 1)).camera;
      const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const speed = Math.abs(distance(end.position, end.target) - distance(start.position, start.target)) / Math.max(0.05, seconds);
      const reference = previousSpeed ?? PULL_SPEED;
      continuity = clamp01(1 - Math.abs(speed - reference) / Math.max(0.04, reference));
      if (continuity < 0.75) notes.push(`后拉速度 ${speed.toFixed(3)} m/s，参照 ${reference.toFixed(3)}`);
      previousSpeed = speed;
    } else if (move === 'locked' || move === 'over-shoulder') {
      const start = evaluateProject(project, shot.start).camera.position;
      const end = evaluateProject(project, Math.max(shot.start, shot.end - 1)).camera.position;
      const drift = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
      continuity = drift < 0.002 ? 1 : clamp01(1 - drift);
      if (drift >= 0.002) notes.push('固定机位发生了位移');
    }
    return finish(shot.id, {composition, subjectSize, rhythm, light, continuity, notes});
  });
}

function finish(shotId: string, score: Omit<RubricScore, 'shotId' | 'total'>): RubricScore {
  const total = score.composition * 0.25 + score.subjectSize * 0.25 + score.rhythm * 0.2 + score.light * 0.15 + score.continuity * 0.15;
  return {shotId, ...score, total};
}

export function meanScore(scores: RubricScore[]): number {
  if (!scores.length) return 0;
  return scores.reduce((sum, score) => sum + score.total, 0) / scores.length;
}

/** One correction pass. Geometry is the measurement; a vision model can replace scoreProject later. */
export function fixCommands(project: PrevisProject, scores: RubricScore[]): Command[] {
  const byId = new Map(scores.map(score => [score.shotId, score]));
  const commands: Command[] = [];
  for (const shot of project.shots) {
    if ((shot.kind ?? '3d') !== '3d' || !shot.intent?.move || !shot.intent.composition) continue;
    const score = byId.get(shot.id);
    if (!score || score.total >= 0.78) continue;
    const notes = score.notes.join(' ');
    let fill = shot.intent.fill;
    if (notes.includes('偏小') && fill) fill = Math.min(0.9, fill + 0.08);
    if (notes.includes('出画') && fill) fill = Math.max(0.28, fill - 0.08);
    const pull = notes.includes('后拉速度') ? PULL_SPEED : shot.intent.pullSpeed;
    if (fill === shot.intent.fill && pull === shot.intent.pullSpeed) continue;
    commands.push({
      type: 'camera.apply', shotId: shot.id, move: shot.intent.move, composition: shot.intent.composition,
      subject: shot.intent.subject, focal: shot.intent.focal, fill, aperture: shot.intent.aperture, pullSpeed: pull,
      azimuth: shot.intent.azimuth, elevation: shot.intent.elevation,
    });
  }
  return commands;
}

export interface VisionRequest { shotId: string; image?: string; geometric: RubricScore }

/** Plug a vision model in with PREVIS_VISION_URL. Without it, the geometric rubric stands. */
export async function refineWithVision(scores: RubricScore[], project: PrevisProject): Promise<{scores: RubricScore[]; mode: 'geometric' | 'vision'}> {
  const url = process.env.PREVIS_VISION_URL;
  if (!url) return {scores, mode: 'geometric'};
  const body = {project: project.id, shots: scores.map(score => ({shotId: score.shotId, geometric: score})) satisfies VisionRequest[]};
  const response = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  if (!response.ok) return {scores, mode: 'geometric'};
  const parsed = await response.json() as {scores?: RubricScore[]};
  return {scores: parsed.scores?.length ? parsed.scores : scores, mode: 'vision'};
}
