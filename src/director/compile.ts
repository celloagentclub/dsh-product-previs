import {placeRanges} from '../audio/beats';
import {applyCommands} from '../core/commands';
import {identityTransform, type Command, type PrevisProject, type Shot, type V3} from '../core/types';
import {ARM_JOINTS, armModelAsset} from '../product/arm';
import type {Narrative, ShotDraft} from './plan';
import {videoPrompt} from './prompts';

const STAMP = '2026-11-12T00:00:00.000Z';
const pose = (position: V3): Shot['camera']['from'] => ({position, target: [0.12, 0.4, 0], focalLength: 40, focusDistance: 2, aperture: 4});

export function seedProject(narrative: Narrative, durationFrames: number): PrevisProject {
  const asset = armModelAsset();
  return {
    schemaVersion: 2, id: 'cybopal-wow', name: narrative.title, revision: 1,
    fps: 24, durationFrames, width: 1920, height: 1080,
    assets: [asset, {id: 'bed', name: '178 BPM bed', kind: 'audio', file: 'assets/bed.wav', hash: 'bed'}],
    objects: [
      {id: 'arm', name: 'CyboPal', kind: 'model', assetId: asset.id, partIds: asset.parts.map(part => part.id), sourceOrigin: [0, 0, 0], transform: identityTransform(), visible: true, joints: ARM_JOINTS},
      {id: 'panel', name: '屏幕内容', kind: 'screen', transform: {position: [0.286, 0.515, 0], rotation: [0, 90, 0], scale: [0.56, 0.3, 1]}, visible: true, screen: {text: 'CYBOPAL', mount: {objectId: 'arm', partId: 'display'}}},
      {id: 'cable', name: '线缆', kind: 'box', color: '#141414', transform: {position: [0.18, 0.05, 0.09], rotation: [0, 20, 0], scale: [0.1, 0.012, 0.012]}, visible: true},
      {id: 'floor', name: '地面', kind: 'plane', color: '#070707', transform: {position: [0.12, -0.004, 0], rotation: [0, 0, 0], scale: [8, 1, 8]}, visible: true},
    ],
    shots: [shotOf({
      id: 'placeholder', name: 'placeholder', description: '会被命令替换', sequence: 'x', sequenceName: 'x', summary: 'x',
      kind: '3d', role: 'product', beats: 1,
    }, 0, Math.min(2, durationFrames))],
    tracks: [],
    film: {id: 'film-main', title: narrative.title, style: narrative.style, look: narrative.look, logline: narrative.logline, bpm: narrative.bpm, grade: narrative.look === 'studio-black'},
    audio: {assetId: 'bed', startFrame: 0, trimStart: 0, gain: 0.9},
    createdAt: STAMP, updatedAt: STAMP,
  };
}

function shotOf(draft: ShotDraft, start: number, end: number): Shot {
  const camera = {from: pose([1.1, 0.7, 1.4]), to: pose([1.2, 0.72, 1.5]), move: 'static' as const, easing: 'linear' as const};
  return {
    id: draft.id, name: draft.name, start, end, description: draft.description, camera,
    kind: draft.kind, sequenceId: draft.sequence,
    ...(draft.screenContent ? {screenContent: draft.screenContent} : {}),
    ...(draft.dialogue ? {dialogue: draft.dialogue} : {}),
    ...(draft.kind === 'broll-code' && draft.template && draft.lines ? {broll: {template: draft.template, lines: draft.lines}} : {}),
    intent: {
      role: draft.role, beats: draft.beats, move: draft.move, composition: draft.composition, subject: draft.subject,
      ...(draft.focal ? {focal: draft.focal} : {}), ...(draft.fill ? {fill: draft.fill} : {}),
    },
  };
}

export function commandsFor(narrative: Narrative, drafts: ShotDraft[]): {commands: Command[]; durationFrames: number} {
  const {ranges, durationFrames} = placeRanges(drafts.map(draft => ({id: draft.id, beats: draft.beats})), narrative.bpm, 24);
  const bySequence = new Map<string, {name: string; summary: string; start: number; end: number}>();
  drafts.forEach((draft, index) => {
    const range = ranges[index];
    const current = bySequence.get(draft.sequence);
    if (!current) bySequence.set(draft.sequence, {name: draft.sequenceName, summary: draft.summary, start: range.start, end: range.end});
    else { current.start = Math.min(current.start, range.start); current.end = Math.max(current.end, range.end); }
  });
  const commands: Command[] = [{type: 'shot.remove', id: 'placeholder'}];
  for (const [id, sequence] of bySequence) commands.push({type: 'sequence.add', sequence: {id, name: sequence.name, start: sequence.start, end: sequence.end, summary: sequence.summary, role: id}});
  drafts.forEach((draft, index) => {
    const range = ranges[index];
    commands.push({type: 'shot.add', shot: shotOf(draft, range.start, range.end)});
  });
  drafts.forEach((draft, index) => {
    if (draft.kind !== '3d' || !draft.action) return;
    const range = ranges[index];
    commands.push({type: 'arm.action', objectId: 'arm', action: draft.action, start: range.start, end: range.end});
  });
  const screenKeys: {frame: number; value: string}[] = [];
  drafts.forEach((draft, index) => {
    if (!draft.screenContent) return;
    const frame = ranges[index].start;
    if (!screenKeys.some(key => key.frame === frame)) screenKeys.push({frame, value: draft.screenContent});
  });
  if (!screenKeys.some(key => key.frame === 0)) screenKeys.unshift({frame: 0, value: drafts.find(draft => draft.screenContent)?.screenContent ?? 'Listening'});
  commands.push({type: 'track.set', track: {id: 'panel-screen', objectId: 'panel', property: 'screen', keys: screenKeys.sort((a, b) => a.frame - b.frame)}});
  drafts.forEach((draft, index) => {
    if (draft.kind !== '3d' || !draft.move || !draft.composition) return;
    const range = ranges[index];
    commands.push({
      type: 'camera.apply', shotId: draft.id, move: draft.move, composition: draft.composition,
      subject: draft.subject, focal: draft.focal, fill: draft.fill,
      pullSpeed: draft.move === 'slow-pull' || draft.move === 'slow-push' ? 0.1 : undefined,
    });
  });
  return {commands, durationFrames};
}

export function compileFilm(narrative: Narrative, drafts: ShotDraft[]): PrevisProject {
  const {commands, durationFrames} = commandsFor(narrative, drafts);
  const seeded = seedProject(narrative, durationFrames);
  // The placeholder shot keeps evaluate/camera.apply legal while the real shots are added in this same batch.
  // It is removed by the first command, before validation.
  const project = applyCommands(seeded, commands);
  return {
    ...project,
    shots: project.shots.map(shot => ({...shot, videoPrompt: videoPrompt(project, shot)})),
  };
}
