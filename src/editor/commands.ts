import type { CameraPose, Command, PrevisProject, SceneObject, Shot, Track, TrackValue, Transform, V3 } from '../core/types';

export const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 10)}`;
export const cloneTransform = (value: Transform): Transform => ({ position: [...value.position], rotation: [...value.rotation], scale: [...value.scale] });
export const clampFrame = (frame: number, duration: number) => Math.max(0, Math.min(Math.max(0, duration - 1), Math.round(frame)));
export const initialCamera = (): CameraPose => ({ position: [4, 3, 5], target: [0, 1, 0], focalLength: 45, focusDistance: 6, aperture: 5.6 });
export const clonePose = (pose: CameraPose): CameraPose => ({ ...pose, position: [...pose.position], target: [...pose.target] });
export function keyedCommands(project: PrevisProject, objectId: string, frame: number, values: Partial<Record<Track['property'], TrackValue>>): Command[] {
  if (!project.objects.some(object => object.id === objectId)) throw new Error('对象已被移除，未提交修改。');
  return Object.entries(values).map(([property, value]) => {
    const prior = project.tracks.find(track => track.objectId === objectId && track.property === property);
    const track: Track = prior ? { ...prior, keys: [...prior.keys.filter(key => key.frame !== frame), { frame, value: value!, easing: 'smooth' as const }].sort((a, b) => a.frame - b.frame) }
      : { id: uid('track'), objectId, property: property as Track['property'], keys: [{ frame, value: value!, easing: 'smooth' }] };
    return { type: 'track.set', track };
  });
}
export function objectPatch(project: PrevisProject, id: string, patch: Partial<SceneObject>): Command[] {
  if (!project.objects.some(object => object.id === id)) throw new Error('对象已被移除，未提交修改。');
  return [{ type: 'object.update', id, patch }];
}
export function createObject(kind: 'actor' | 'box' | 'screen' | 'light', count: number): SceneObject {
  const labels = { actor: '人偶', box: '方块', screen: '屏幕', light: '灯光' };
  const object: SceneObject = {
    id: uid(kind), name: `${labels[kind]} ${count + 1}`, kind, visible: true,
    transform: { position: [kind === 'actor' ? -1.3 : 0, kind === 'box' ? 0.5 : kind === 'light' ? 4 : kind === 'screen' ? 1.2 : 0, 0], rotation: [0, 0, 0], scale: kind === 'screen' ? [1.1, 0.65, 1] : [1, 1, 1] },
    color: kind === 'actor' ? '#b7c0cc' : '#c8c9c5',
  };
  if (kind === 'actor') object.actor = { height: 1.72, pose: 'standing', gesture: 'neutral' };
  if (kind === 'screen') object.screen = { text: '产品预演' };
  if (kind === 'light') object.light = { type: 'directional', intensity: 2.5, target: [0, 0, 0], color: '#f5f1e9' };
  return object;
}
export function createShot(project: PrevisProject, observer?: CameraPose): Shot {
  const lastEnd = Math.max(0, ...project.shots.map(shot => shot.end));
  const start = lastEnd < project.durationFrames ? lastEnd : project.durationFrames;
  const duration = Math.max(1, Math.round(project.fps * 3));
  const camera = observer || project.shots.at(-1)?.camera.to || initialCamera();
  return { id: uid('shot'), name: `镜头 ${project.shots.length + 1}`, start, end: start + duration, description: '', camera: { from: clonePose(camera), to: clonePose(camera), move: 'static', easing: 'smooth', orbitDegrees: 45 } };
}
export const round = (value: number, digits = 3) => Number(value.toFixed(digits));
export function centerOfObject(object: SceneObject): V3 { return [...object.transform.position]; }
