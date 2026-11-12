/**
 * Retime the film to a music tempo without breaking the choreography.
 *
 * Cut points move onto the beat grid, so every action keyframe that was pinned
 * to an old cut has to move with it. This module does that mapping in one place:
 * keyframes on a cut shift by that cut's delta, keyframes inside a shot remap
 * proportionally so their position within the shot is preserved.
 *
 * Both the shot boundaries and the action stay editable afterwards — this is a
 * one-shot retime, not a runtime constraint.
 */

import type {Shot, Track} from './types';

/**
 * @param shots     current shots (start inclusive, end exclusive)
 * @param cuts      new boundary frames, same length as shots+1, first 0
 * @param tracks    tracks whose keyframes must follow the retime
 * @returns new shots and tracks; objects/settings untouched
 */
export function retimeToCuts({shots, cuts, tracks}: {shots: Shot[]; cuts: number[]; tracks: Track[]}): {shots: Shot[]; tracks: Track[]} {
  if (cuts.length !== shots.length + 1) throw new Error('切点数量必须等于镜头数加一');
  if (cuts[0] !== 0) throw new Error('第一个切点必须是第 0 帧');
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i] <= cuts[i - 1]) throw new Error(`切点必须递增：${cuts[i - 1]} → ${cuts[i]}`);
  }

  const oldCuts = [shots[0].start, ...shots.map(s => s.end)];
  if (oldCuts[0] !== 0) throw new Error('当前镜头不是从第 0 帧开始');
  for (let i = 1; i < oldCuts.length; i++) {
    if (oldCuts[i] !== shots[i - 1].end) throw new Error('当前镜头之间存在空隙或重叠');
  }

  /** Map an old frame onto the new timeline. */
  const mapFrame = (frame: number): number => {
    // A frame exactly on a cut follows that cut.
    const cutIndex = oldCuts.indexOf(frame);
    if (cutIndex >= 0) return cuts[cutIndex];
    // Otherwise find its shot and keep its relative position inside it.
    for (let i = 0; i < shots.length; i++) {
      const a = oldCuts[i], b = oldCuts[i + 1];
      if (frame > a && frame < b) {
        const oldLen = b - a, newLen = cuts[i + 1] - cuts[i];
        const t = (frame - a) / oldLen;
        return Math.round(cuts[i] + t * newLen);
      }
    }
    // Frames outside the film (should not happen) keep their offset from the end.
    return frame + (cuts[cuts.length - 1] - oldCuts[oldCuts.length - 1]);
  };

  const newShots = shots.map((shot, i) => ({...shot, start: cuts[i], end: cuts[i + 1]}));

  const newTracks: Track[] = tracks.map(track => {
    const keys = track.keys.map(key => ({...key, frame: mapFrame(key.frame)}));
    // Two keys can land on the same frame after rounding; the later one wins so
    // the authored end state is preserved.
    const merged = new Map<number, Track['keys'][number]>();
    for (const key of keys) merged.set(key.frame, key);
    return {...track, keys: [...merged.values()].sort((a, b) => a.frame - b.frame)};
  });

  return {shots: newShots, tracks: newTracks};
}

/** Beat-aligned boundaries for a 30s 24fps film at a given tempo. */
export function beatCuts({bpm, fps, durationFrames, shots, subdivision = 2}: {bpm: number; fps: number; durationFrames: number; shots: Shot[]; subdivision?: number}): number[] {
  const beatFrames = (60 / bpm) * fps;
  const step = beatFrames / subdivision;
  const boundaries: number[] = [0];
  const oldCuts = [shots[0].start, ...shots.map(s => s.end)];
  for (let i = 1; i < oldCuts.length - 1; i++) {
    const target = oldCuts[i];
    const snapped = Math.round(Math.round(target / step) * step);
    boundaries.push(snapped);
  }
  boundaries.push(durationFrames);
  // Keep strictly increasing after snapping.
  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i] <= boundaries[i - 1]) boundaries[i] = boundaries[i - 1] + 1;
  }
  boundaries[boundaries.length - 1] = durationFrames;
  return boundaries;
}
