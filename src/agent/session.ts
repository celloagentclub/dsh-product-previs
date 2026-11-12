import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {applyCommands} from '../core/commands';
import type {Command, PrevisProject} from '../core/types';

interface History { undo: PrevisProject[]; redo: PrevisProject[] }

const historyPath = (projectPath: string) => `${projectPath}.history.json`;

async function readHistory(projectPath: string): Promise<History> {
  try { return JSON.parse(await readFile(historyPath(projectPath), 'utf8')) as History; }
  catch { return {undo: [], redo: []}; }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), {recursive: true});
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, path);
}

export async function loadProject(projectPath: string): Promise<PrevisProject> {
  return JSON.parse(await readFile(projectPath, 'utf8')) as PrevisProject;
}

export async function saveProject(projectPath: string, project: PrevisProject): Promise<void> {
  await writeJson(projectPath, project);
}

/** One command batch is one undo step. Revision belongs to this host, not to applyCommands. */
export async function commitCommands(projectPath: string, commands: Command[]): Promise<PrevisProject> {
  const current = await loadProject(projectPath);
  const history = await readHistory(projectPath);
  const next = applyCommands(current, commands);
  next.revision = current.revision + 1;
  next.updatedAt = new Date().toISOString();
  history.undo.push(current);
  history.undo = history.undo.slice(-50);
  history.redo = [];
  await writeJson(historyPath(projectPath), history);
  await saveProject(projectPath, next);
  return next;
}

export async function undoProject(projectPath: string): Promise<PrevisProject> {
  return step(projectPath, 'undo');
}

export async function redoProject(projectPath: string): Promise<PrevisProject> {
  return step(projectPath, 'redo');
}

async function step(projectPath: string, action: 'undo' | 'redo'): Promise<PrevisProject> {
  const current = await loadProject(projectPath);
  const history = await readHistory(projectPath);
  const from = action === 'undo' ? history.undo : history.redo;
  const to = action === 'undo' ? history.redo : history.undo;
  const previous = from.pop();
  if (!previous) throw new Error(action === 'undo' ? '没有可撤销的修改' : '没有可重做的修改');
  to.push(current);
  const next = structuredClone(previous);
  next.revision = current.revision + 1;
  next.updatedAt = new Date().toISOString();
  await writeJson(historyPath(projectPath), history);
  await saveProject(projectPath, next);
  return next;
}
