import {applyCommands} from '../core/commands';
import type {PrevisProject} from '../core/types';
import type {LanguageModel} from '../agent/models';
import {scriptedModel} from '../agent/models';
import {compileFilm} from './compile';
import {editRhythm, photograph, planFilm, writeNarrative, type Narrative, type ShotDraft} from './plan';
import {videoPrompt} from './prompts';
import {fixCommands, meanScore, refineWithVision, scoreProject, type RubricScore} from './rubric';

export interface Outline {
  narrative: Narrative;
  shots: ShotDraft[];
  roles: {writer: string; director: string; dp: string; editor: string};
}

export interface DirectResult {
  project: PrevisProject;
  outline: Outline;
  scores: RubricScore[];
  mean: number;
  passes: number;
  vision: 'geometric' | 'vision';
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(raw);
}

async function ask(model: LanguageModel, system: string, user: string, fallback: () => unknown): Promise<unknown> {
  if (model.id === 'scripted') return fallback();
  try { return extractJson(await model.complete(system, user)); }
  catch { return fallback(); }
}

function asShots(value: unknown, fallback: ShotDraft[]): ShotDraft[] {
  if (!Array.isArray(value) || !value.length) return fallback;
  const shots = value.filter((item): item is ShotDraft => !!item && typeof item === 'object' && typeof (item as ShotDraft).id === 'string' && typeof (item as ShotDraft).beats === 'number');
  return shots.length >= 4 ? shots : fallback;
}

export async function directFromBrief(brief: string, model: LanguageModel = scriptedModel()): Promise<DirectResult> {
  const narrative = writeNarrative(brief);
  const written = await ask(model, '你是广告编剧。只返回 JSON。品牌片禁止旁白和真人。', brief, () => narrative) as Narrative;
  const story: Narrative = written && written.style && written.bpm ? {...narrative, ...written, brief} : narrative;
  const directed = directFallback(story);
  const directedRaw = await ask(model, '你是广告导演。按编剧大纲返回 shots JSON 数组，每镜含 id、kind、beats、role。', JSON.stringify(story), () => directed);
  const directedShots = asShots(directedRaw, directed);
  const photographed = photograph(directedShots, story);
  const photographedRaw = await ask(model, '你是摄影指导。为每个 3d 镜头填写 move 和 composition，不要改 beats。返回 shots JSON 数组。', JSON.stringify(photographed), () => photographed);
  const shotPlan = editRhythm(asShots(photographedRaw, photographed), story);
  let project: PrevisProject;
  try { project = compileFilm(story, shotPlan); }
  catch { project = compileFilm(story, planFilm(story)); }
  let scores = scoreProject(project);
  let passes = 0;
  for (; passes < 2 && meanScore(scores) < 0.78; passes++) {
    const commands = fixCommands(project, scores);
    if (!commands.length) break;
    project = applyCommands(project, commands);
    project = {...project, shots: project.shots.map(shot => ({...shot, videoPrompt: videoPrompt(project, shot)}))};
    scores = scoreProject(project);
  }
  const vision = await refineWithVision(scores, project);
  return {
    project,
    outline: {
      narrative: story,
      shots: shotPlan,
      roles: {
        writer: '故事、字幕和有没有旁白。品牌片保持沉默。',
        director: '段落、镜头种类、拍数、产品动作。',
        dp: '命名运镜和构图预设，不拖机位。',
        editor: '按 BPM 把切点放上节拍，并检查手风琴节奏。',
      },
    },
    scores: vision.scores,
    mean: meanScore(vision.scores),
    passes,
    vision: vision.mode,
  };
}

function directFallback(narrative: Narrative): ShotDraft[] {
  return planFilm(narrative).map(shot => ({...shot}));
}
