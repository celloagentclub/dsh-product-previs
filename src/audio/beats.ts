import type {Keyframe, PrevisProject, Shot, Track} from '../core/types';

export function framesPerBeat(bpm: number, fps: number): number {
  return (60 / bpm) * fps;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function onsetSeconds(onsets: number[] | undefined, index: number, period: number): number {
  if (!onsets || onsets.length < 2) return index * period;
  if (index < onsets.length) return onsets[index];
  return onsets[onsets.length - 1] + (index - (onsets.length - 1)) * period;
}

/** Frame of a musical position. Without measured onsets this is the ideal grid `round(beat * 60/bpm * fps)`. */
export function frameAtBeat(beat: number, bpm: number, fps: number, onsets?: number[]): number {
  const ideal = 60 / bpm;
  if (!onsets || onsets.length < 2) return Math.round(beat * ideal * fps);
  const period = median(onsets.slice(1).map((time, index) => time - onsets[index]).filter(gap => gap > 0.05)) || ideal;
  const i = Math.floor(beat);
  const fraction = beat - i;
  const time = onsetSeconds(onsets, i, period) + (onsetSeconds(onsets, i + 1, period) - onsetSeconds(onsets, i, period)) * fraction;
  return Math.round(time * fps);
}

export interface PlacedRange { id: string; start: number; end: number; beats: number }

export function placeRanges(items: {id: string; beats: number}[], bpm: number, fps: number, onsets?: number[]): {ranges: PlacedRange[]; durationFrames: number} {
  let cursor = 0;
  const ranges = items.map(item => {
    const beats = item.beats > 0 ? item.beats : 1;
    let start = frameAtBeat(cursor, bpm, fps, onsets);
    let end = frameAtBeat(cursor + beats, bpm, fps, onsets);
    if (end <= start) end = start + 1;
    cursor += beats;
    return {id: item.id, start, end, beats};
  });
  return {ranges, durationFrames: Math.max(1, frameAtBeat(cursor, bpm, fps, onsets))};
}

function localMap(frame: number, fromStart: number, fromEnd: number, toStart: number, toEnd: number): number {
  if (fromEnd <= fromStart) return toStart;
  const u = (frame - fromStart) / (fromEnd - fromStart);
  return Math.round(toStart + u * (toEnd - toStart));
}

/**
 * Put every shot on the beat grid and move keyframes with their shot.
 * Shots remember their length in `intent.beats`. A second pass on the same grid is a no-op
 * apart from integer rounding, which the placer and this function share.
 */
export function realignProject(project: PrevisProject, bpm: number, onsets?: number[]): PrevisProject {
  if (!(bpm > 0) || bpm > 400) throw new Error('BPM 必须在 0 到 400 之间');
  const shots = [...project.shots].sort((a, b) => a.start - b.start);
  const oldPeriod = framesPerBeat(project.film?.bpm || bpm, project.fps);
  const items = shots.map(shot => ({
    id: shot.id,
    beats: shot.intent?.beats && shot.intent.beats > 0 ? shot.intent.beats : Math.max(0.5, (shot.end - shot.start) / oldPeriod),
  }));
  const {ranges, durationFrames} = placeRanges(items, bpm, project.fps, onsets);
  const byId = new Map(ranges.map(range => [range.id, range]));
  const nextShots: Shot[] = shots.map(shot => {
    const range = byId.get(shot.id)!;
    return {...shot, start: range.start, end: range.end, intent: {...shot.intent, beats: range.beats}};
  });
  const limit = Math.max(0, durationFrames - 1);
  const nextTracks: Track[] = project.tracks.map(track => {
    const mapped = new Map<number, Keyframe>();
    for (const key of track.keys) {
      const owner = shots.find(shot => key.frame >= shot.start && key.frame < shot.end) ?? shots.find(shot => shot.start <= key.frame);
      const range = owner ? byId.get(owner.id) : undefined;
      let frame = range && owner ? localMap(key.frame, owner.start, owner.end, range.start, range.end) : key.frame;
      frame = Math.max(0, Math.min(limit, frame));
      mapped.set(frame, {...key, frame});
    }
    const keys = [...mapped.values()].sort((a, b) => a.frame - b.frame);
    return {...track, keys: keys.length ? keys : [{frame: 0, value: track.keys[0]?.value ?? 0}]};
  });
  return {
    ...project,
    durationFrames,
    shots: nextShots,
    tracks: nextTracks,
    film: project.film ? {...project.film, bpm} : project.film,
    audio: project.audio ? {...project.audio, startFrame: Math.min(project.audio.startFrame, limit)} : project.audio,
  };
}

export interface DetectedBeats { bpm: number; times: number[]; sampleRate: number }

/** Low-frequency onset pick. A kick on every quarter note is enough to recover BPM. */
export function detectBeats(samples: Float32Array, sampleRate: number): DetectedBeats {
  const hop = 512;
  const coefficient = Math.exp(-2 * Math.PI * 180 / sampleRate);
  let low = 0;
  const flux: number[] = [];
  let previous = 0;
  for (let offset = 0; offset + hop < samples.length; offset += hop) {
    let energy = 0;
    for (let i = 0; i < hop; i++) {
      low = low * coefficient + samples[offset + i] * (1 - coefficient);
      energy += low * low;
    }
    const value = energy / hop;
    flux.push(Math.max(0, value - previous));
    previous = value;
  }
  const times: number[] = [];
  let last = -1;
  for (let i = 2; i < flux.length - 2; i++) {
    const local = flux.slice(Math.max(0, i - 8), i + 8);
    const mean = local.reduce((sum, value) => sum + value, 0) / local.length;
    const time = i * hop / sampleRate;
    if (flux[i] > mean * 1.8 && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1] && time - last > 0.22) {
      times.push(time);
      last = time;
    }
  }
  const gaps = times.slice(1).map((time, index) => time - times[index]).filter(gap => gap > 0.2 && gap < 0.8);
  const period = median(gaps) || 60 / 120;
  const bpm = Math.round(60 / period);
  return {bpm, times, sampleRate};
}

export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function decodeWav(buffer: Buffer): {samples: Float32Array; sampleRate: number} {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('需要 WAV 文件');
  let offset = 12;
  let sampleRate = 44100;
  let data: Buffer | undefined;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') {
      sampleRate = buffer.readUInt32LE(start + 4);
    } else if (id === 'data') {
      data = buffer.subarray(start, start + size);
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!data) throw new Error('WAV 缺少 data 块');
  const samples = new Float32Array(Math.floor(data.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32767;
  return {samples, sampleRate};
}

/** 178 BPM placeholder: a kick on every quarter note plus hats and a backbeat. Not a commercial track. */
export function synthBed(options: {bpm: number; seconds: number; sampleRate?: number}): Float32Array {
  const sampleRate = options.sampleRate ?? 44100;
  const total = Math.floor(options.seconds * sampleRate);
  const samples = new Float32Array(total);
  const beat = 60 / options.bpm;
  const beats = Math.floor(options.seconds / beat);
  const add = (time: number, render: (t: number) => number, seconds: number, gain: number) => {
    const start = Math.floor(time * sampleRate);
    const length = Math.floor(seconds * sampleRate);
    for (let i = 0; i < length && start + i < total; i++) samples[start + i] += render(i / sampleRate) * gain;
  };
  for (let i = 0; i < beats; i++) {
    const time = i * beat;
    add(time, t => Math.sin(2 * Math.PI * (140 * Math.exp(-28 * t) + 42) * t) * Math.exp(-10 * t), 0.18, 0.95);
    add(time + beat / 2, t => (Math.random() * 2 - 1) * Math.exp(-80 * t), 0.03, 0.18);
    if (i % 2 === 1) add(time, t => (Math.random() * 2 - 1) * Math.exp(-22 * t), 0.12, 0.38);
    add(time, t => Math.sin(2 * Math.PI * 55 * t) * Math.exp(-4 * t), 0.2, 0.22);
  }
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] = samples[i] / peak * 0.9;
  return samples;
}
