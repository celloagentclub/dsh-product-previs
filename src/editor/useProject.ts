import { useCallback, useEffect, useRef, useState } from 'react';
import type { Command, PrevisProject, ProjectSummary, RenderJob } from '../core/types';
import { ApiError, BASE, post, request, type ProjectResponse, type RenderResponse } from './api';

export type CommandFactory = (project: PrevisProject) => Command[];
type Operation = { projectId: string; label: string; run: (project: PrevisProject) => Promise<PrevisProject> };
export function useProject() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<PrevisProject | null>(null);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<Operation | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const projectRef = useRef(project);
  const activeRef = useRef(activeId);
  const busyRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const accept = useCallback((next: PrevisProject) => {
    if (!mounted.current || activeRef.current !== next.id) return;
    if (projectRef.current?.id === next.id && projectRef.current.revision > next.revision) return;
    projectRef.current = next;
    setProject(next);
    setProjects(list => list.map(item => item.id === next.id ? {
      ...item, name: next.name, revision: next.revision, durationFrames: next.durationFrames,
      width: next.width, height: next.height, objectCount: next.objects.length, shotCount: next.shots.length, updatedAt: next.updatedAt,
    } : item));
  }, []);
  const readProject = useCallback(async (id: string) => {
    const { project: next } = await request<ProjectResponse>(`/api/project?id=${encodeURIComponent(id)}`);
    accept(next);
    return next;
  }, [accept]);
  const refreshHistory = useCallback(async (id: string) => {
    try {
      const next = await request<{ canUndo: boolean; canRedo: boolean }>(`/api/history?id=${encodeURIComponent(id)}`);
      if (activeRef.current === id && mounted.current) setHistory(next);
    } catch (cause) { if (activeRef.current === id) setError(cause instanceof Error ? cause.message : String(cause)); }
  }, []);
  const refreshJobs = useCallback(async (id: string) => {
    try {
      const next = await request<{ jobs: RenderJob[] }>(`/api/renders?id=${encodeURIComponent(id)}`);
      if (activeRef.current === id && mounted.current) setJobs(next.jobs);
    } catch (cause) { if (activeRef.current === id) setError(cause instanceof Error ? cause.message : String(cause)); }
  }, []);
  const switchProject = useCallback((id: string) => {
    if (busyRef.current) { setNotice('正在保存，请稍后切换项目。'); return; }
    activeRef.current = id;
    projectRef.current = null;
    setProject(null);
    setActiveId(id);
    setError(''); setPending(null); setNotice(''); setLoading(Boolean(id)); setJobs([]);
    setHistory({ canUndo: false, canRedo: false });
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('project', id); else url.searchParams.delete('project');
    window.history.replaceState(null, '', url);
  }, []);

  useEffect(() => {
    let live = true;
    request<{ projects: ProjectSummary[] }>('/api/projects').then(({ projects: list }) => {
      if (!live) return;
      setProjects(list);
      const requested = new URLSearchParams(window.location.search).get('project');
      const initial = list.find(item => item.id === requested) || list[0];
      if (initial) switchProject(initial.id); else setLoading(false);
    }).catch(cause => { if (live) { setError(cause.message); setLoading(false); } });
    return () => { live = false; };
  }, [switchProject]);

  useEffect(() => {
    if (!activeId) return;
    let live = true;
    let fetching = false;
    let reread = false;
    const read = async () => {
      if (fetching) { reread = true; return; }
      fetching = true;
      try { await readProject(activeId); if (live) void refreshHistory(activeId); }
      catch (cause) { if (live) setError(cause instanceof Error ? cause.message : String(cause)); }
      finally {
        fetching = false;
        if (live) setLoading(false);
        if (reread && live) { reread = false; void read(); }
      }
    };
    void read(); void refreshJobs(activeId);
    const events = new EventSource(`${BASE}/api/events?id=${encodeURIComponent(activeId)}`);
    const onProject = (event: MessageEvent) => {
      try {
        const { revision } = JSON.parse(event.data);
        if (typeof revision !== 'number' || revision > (projectRef.current?.revision ?? -1)) void read();
      } catch { void read(); }
    };
    events.addEventListener('project', onProject as EventListener);
    return () => { live = false; events.close(); };
  }, [activeId, readProject, refreshHistory, refreshJobs]);

  const hasActiveJobs = jobs.some(job => job.status === 'queued' || job.status === 'rendering');
  useEffect(() => {
    if (!activeId || !hasActiveJobs) return;
    const timer = window.setInterval(() => { void refreshJobs(activeId); }, 2000);
    return () => window.clearInterval(timer);
  }, [activeId, hasActiveJobs, refreshJobs]);

  const execute = useCallback(async (operation: Operation) => {
    if (busyRef.current) { setNotice('正在保存上一项修改，请稍后再试。'); return false; }
    if (activeRef.current !== operation.projectId) return false;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const latest = await readProject(operation.projectId);
      const next = await operation.run(latest);
      accept(next);
      setPending(null);
      setNotice(`${operation.label}已保存`);
      void refreshHistory(operation.projectId);
      return true;
    } catch (cause) {
      setPending(operation);
      if (cause instanceof ApiError && cause.status === 409) {
        try { await readProject(operation.projectId); } catch { /* Keep the original conflict visible. */ }
        setError('项目刚被其他操作更新，已重新读取。你的修改已保留，点击「重试修改」提交到最新版本。');
      } else setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }, [accept, readProject, refreshHistory]);
  const commands = useCallback((label: string, factory: CommandFactory) => {
    const id = activeRef.current;
    if (!id) return Promise.resolve(false);
    return execute({ projectId: id, label, run: async latest => {
      const commands = factory(latest);
      if (!commands.length) return latest;
      return (await post<ProjectResponse>('/api/commands', { id, expectedRevision: latest.revision, commands })).project;
    } });
  }, [execute]);
  const undoRedo = useCallback((direction: 'undo' | 'redo') => {
    const id = activeRef.current;
    return execute({ projectId: id, label: direction === 'undo' ? '撤销' : '重做', run: async latest =>
      (await post<ProjectResponse>(`/api/${direction}`, { id, expectedRevision: latest.revision })).project,
    });
  }, [execute]);
  const importAsset = useCallback((path: string) => {
    const id = activeRef.current;
    return execute({ projectId: id, label: '模型导入', run: async latest =>
      (await post<ProjectResponse>('/api/assets/import', { id, path, expectedRevision: latest.revision })).project,
    });
  }, [execute]);
  const createProject = useCallback(async (name: string) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const { project: next } = await post<ProjectResponse>('/api/projects', { name });
      const list = await request<{ projects: ProjectSummary[] }>('/api/projects');
      setProjects(list.projects);
      busyRef.current = false;
      switchProject(next.id);
      accept(next);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }, [accept, switchProject]);
  const render = useCallback(async (options: { width: number; height: number; fps: number }) => {
    if (busyRef.current || !activeRef.current) return;
    const id = activeRef.current;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const latest = await readProject(id);
      const { job } = await post<RenderResponse>('/api/renders', { id, expectedRevision: latest.revision, ...options });
      if (activeRef.current === id) setJobs(list => [job, ...list.filter(item => item.id !== job.id)]);
      setNotice('已开始导出白模视频');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) { await readProject(id); setError('项目刚有更新，已读取最新版本。请重新开始导出。'); }
      else setError(cause instanceof Error ? cause.message : String(cause));
    } finally { busyRef.current = false; setBusy(false); }
  }, [readProject]);
  const cancelRender = useCallback(async (jobId: string) => {
    try {
      const { job } = await post<RenderResponse>('/api/renders/cancel', { jobId });
      setJobs(list => list.map(item => item.id === job.id ? job : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, []);

  return { projects, project, activeId, loading, busy, error, notice, pending, history, jobs,
    switchProject, createProject, commands, undoRedo, importAsset, render, cancelRender,
    retry: () => pending ? execute(pending) : Promise.resolve(false),
    dismissError: () => { setError(''); setPending(null); }, setNotice,
    refresh: () => activeRef.current ? readProject(activeRef.current) : Promise.resolve(null),
  };
}
