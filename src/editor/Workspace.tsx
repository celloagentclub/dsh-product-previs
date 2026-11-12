import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Box, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, Diamond, Expand, FolderInput, Grid2X2, LoaderCircle, Maximize2, MessageSquareText, MousePointer2, Move, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Redo2, Rotate3D, Settings2, Undo2, X } from 'lucide-react';
import type { CameraPose, EvaluatedFrame, PrevisProject, Track, TrackValue, Transform, V3 } from '../core/types';
import { evaluateProject } from '../core/evaluate';
import StageViewport from '../stage/StageViewport';
import { assetUrl, request } from './api';
import { clonePose, cloneTransform, createObject, createShot, keyedCommands } from './commands';
import { AssistantHandoff } from './AssistantHandoff';
import { IconButton, NumberField, TextField } from './controls';
import { ObjectInspector } from './ObjectInspector';
import { RenderPanel } from './RenderPanel';
import { SceneTree } from './SceneTree';
import { ShotInspector } from './ShotInspector';
import { Timeline } from './Timeline';
import { usePlayback } from './usePlayback';
import { useProject } from './useProject';
import { ViewportBoundary } from './ViewportBoundary';

// Left blank on purpose: the operator chooses their own GLB at import time.
const DEFAULT_MODEL_PATH = '';
type Preview = { id: string; values: Partial<Record<Track['property'], TrackValue>> } | null;
type Utility = 'new' | 'import' | 'render' | 'settings' | null;
function isTyping(target: EventTarget | null) { return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, button, [contenteditable="true"], [role="slider"]')); }

export default function Workspace() {
  const store = useProject();
  const project = store.project;
  const playback = usePlayback(project?.durationFrames || 1, project?.fps || 24, store.activeId);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedPartId, setSelectedPartId] = useState<string>();
  const [selectedShotId, setSelectedShotId] = useState<string>();
  const [inspectorTab, setInspectorTab] = useState<'object' | 'shot'>('object');
  const [tool, setTool] = useState<'select' | 'translate' | 'rotate'>('select');
  const [showHelpers, setShowHelpers] = useState(true);
  const [viewPreset,setViewPreset]=useState<'perspective'|'front'|'side'|'top'>('perspective');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [monitorOpen, setMonitorOpen] = useState(true);
  const [autoKey, setAutoKey] = useState(false);
  const [utility, setUtility] = useState<Utility>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [modelPath, setModelPath] = useState(DEFAULT_MODEL_PATH);
  const [projectName, setProjectName] = useState('产品预演');
  const [observer, setObserver] = useState<CameraPose>();
  const [preview, setPreview] = useState<Preview>(null);
  const [localError, setLocalError] = useState('');
  const [monitorExpanded, setMonitorExpanded] = useState(false);
  const previousProject = useRef('');
  const importInput = useRef<HTMLInputElement>(null);
  const newInput = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project) return;
    if (previousProject.current !== project.id) {
      previousProject.current = project.id;
      const arm = project.objects.find(object => object.kind === 'model' && (/机械臂|robot|arm/i.test(object.name) || object.joints?.length)) || project.objects.find(object => object.kind === 'model') || project.objects[0];
      setSelectedId(arm?.id); setSelectedPartId(undefined); setSelectedShotId(project.shots[0]?.id); setInspectorTab('object'); setObserver(undefined); setPreview(null); setLocalError(''); setUtility(null);
    } else {
      if (!project.objects.some(object => object.id === selectedId)) setSelectedId(project.objects.find(object => object.kind === 'model')?.id || project.objects[0]?.id);
      if (!project.shots.some(shot => shot.id === selectedShotId)) setSelectedShotId(project.shots[0]?.id);
    }
  }, [project, selectedId, selectedShotId]);
  useEffect(() => { setPreview(null); }, [selectedId, playback.frame, store.activeId]);
  useEffect(() => { if (utility === 'import') importInput.current?.focus(); if (utility === 'new') newInput.current?.focus(); }, [utility]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setUtility(null); setAssistantOpen(false); setMonitorExpanded(false); }
      if (isTyping(event.target) || assistantOpen) return;
      if (event.code === 'Space') { event.preventDefault(); if (project?.shots.length) playback.toggle(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); if (!store.busy) void store.undoRedo(event.shiftKey ? 'redo' : 'undo');
      }
      if (!event.metaKey && !event.ctrlKey) {
        if (event.key.toLowerCase() === 'v') setTool('select');
        if (event.key.toLowerCase() === 'g') setTool('translate');
        if (event.key.toLowerCase() === 'r') setTool('rotate');
        if (event.key === 'ArrowLeft') { event.preventDefault(); playback.pause(); playback.seek(playback.frame - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); playback.pause(); playback.seek(playback.frame + 1); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project?.shots.length, playback.frame, playback.toggle, playback.seek, assistantOpen, store.busy, store.undoRedo]);

  const evaluation = useMemo<{ frame: EvaluatedFrame | null; error: string }>(() => {
    if (!project || !project.shots.length) return { frame: null, error: '' };
    try {
      let evaluatedProject = project;
      if (preview && project.objects.some(object => object.id === preview.id)) {
        const tracks = [...project.tracks];
        for (const command of keyedCommands(project, preview.id, playback.frame, preview.values)) {
          if (command.type !== 'track.set') continue;
          const index = tracks.findIndex(track => track.id === command.track.id);
          if (index < 0) tracks.push(command.track); else tracks[index] = command.track;
        }
        evaluatedProject = { ...project, tracks };
      }
      return { frame: evaluateProject(evaluatedProject, playback.frame), error: '' };
    } catch (cause) { return { frame: null, error: cause instanceof Error ? cause.message : String(cause) }; }
  }, [project, playback.frame, preview]);
  const selectedObject = project?.objects.find(object => object.id === selectedId);
  const selectedShot = project?.shots.find(shot => shot.id === selectedShotId) || project?.shots[0];
  const activeShot = project?.shots.find(shot => shot.id === evaluation.frame?.shotId);
  const selectedAsset = project?.assets.find(asset => asset.id === selectedObject?.assetId);
  const selectedPart = selectedAsset?.kind === 'model' ? selectedAsset.parts.find(part => part.id === selectedPartId && (!selectedObject?.partIds || selectedObject.partIds.includes(part.id))) : undefined;
  const bindSelectedPart = () => {
    if (!selectedId || !selectedPart || !selectedShot) return;
    void store.commands('部件注视目标', latest => {
      const shot = latest.shots.find(item => item.id === selectedShot.id);
      if (!shot) throw new Error('镜头已被移除。');
      return [{ type: 'shot.update', id: shot.id, patch: { camera: { ...shot.camera, targetBinding: { objectId: selectedId, partId: selectedPart.id, offset: [0, 0, 0], followPosition: false } } } }];
    }).then(ok => { if (ok) setInspectorTab('shot'); });
  };
  useEffect(() => {
    if (!project || playback.playing) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void request('/api/selection', { method: 'POST', signal: controller.signal, body: JSON.stringify({ id: project.id, objectId: selectedId || null, partId: selectedPartId || null, frame: playback.frame, shotId: selectedShotId || evaluation.frame?.shotId || null }) })
        .catch(cause => { if (!controller.signal.aborted) store.setNotice(`选中状态同步失败：${cause instanceof Error ? cause.message : String(cause)}`); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [project?.id, selectedId, selectedPartId, selectedShotId, playback.frame, playback.playing, evaluation.frame?.shotId, store.setNotice]);
  const getAsset = useCallback((file: string) => assetUrl(store.activeId, file), [store.activeId]);
  const observe = useCallback((pose: CameraPose) => {
    setObserver(previous => previous && JSON.stringify(previous) === JSON.stringify(pose) ? previous : clonePose(pose));
  }, []);
  const selectObject = useCallback((id: string) => { setSelectedId(id); setSelectedPartId(undefined); setInspectorTab('object'); }, []);
  const selectPart = useCallback((id: string, partId: string) => { setSelectedId(id); setSelectedPartId(partId); setInspectorTab('object'); }, []);
  const selectShot = (id: string) => {
    setSelectedShotId(id); setInspectorTab('shot');
    const shot = project?.shots.find(item => item.id === id);
    if (shot) { playback.pause(); playback.seek(shot.start); }
  };
  const commitTransform = (id: string, transform: Transform) => {
    if (store.busy || project?.objects.find(object => object.id === id)?.locked) return;
    playback.pause();
    const authored = cloneTransform(transform);
    void store.commands(autoKey ? '变换关键帧' : '初始变换', latest => autoKey ? keyedCommands(latest, id, playback.frame, { position: authored.position, rotation: authored.rotation, scale: authored.scale }) : [{ type: 'object.update', id, patch: { transform: authored } }]);
  };
  const changeTransform = (property: keyof Transform, axis: 0 | 1 | 2, value: number) => {
    if (!selectedId || selectedObject?.locked) return;
    playback.pause();
    void store.commands(autoKey ? '变换关键帧' : '初始变换', latest => {
      const object = latest.objects.find(item => item.id === selectedId);
      if (!object) throw new Error('对象已被移除。');
      const base = autoKey && latest.shots.length ? evaluateProject(latest, playback.frame).objects[object.id]?.transform || object.transform : object.transform;
      const transform = cloneTransform(base);
      transform[property][axis] = value;
      return autoKey ? keyedCommands(latest, object.id, playback.frame, { [property]: transform[property] }) : [{ type: 'object.update', id: object.id, patch: { transform } }];
    });
  };
  const previewValues = (id: string, values: NonNullable<Preview>['values']) => {
    playback.pause(); setPreview(previous => ({ id, values: { ...(previous?.id === id ? previous.values : {}), ...values } }));
  };
  const recordCurrent = () => {
    if (!selectedId || selectedObject?.locked) return;
    playback.pause();
    void store.commands('当前帧动作', latest => {
      const object = latest.objects.find(item => item.id === selectedId);
      if (!object) throw new Error('对象已被移除。');
      const actual = latest.shots.length ? evaluateProject(latest, playback.frame).objects[object.id] : undefined;
      const transform = actual?.transform || object.transform;
      const values: Partial<Record<Track['property'], TrackValue>> = { position: transform.position, rotation: transform.rotation, scale: transform.scale };
      for (const joint of object.joints || []) values[`joint:${joint.id}`] = actual?.jointAngles[joint.id] ?? joint.restAngle;
      if (object.kind === 'model') values.explode = actual?.explode || 0;
      if (object.actor) { values.pose = actual ? (actual.pose.mix < 0.5 ? actual.pose.from : actual.pose.to) : object.actor.pose; values.gesture = actual ? (actual.gesture.mix < 0.5 ? actual.gesture.from : actual.gesture.to) : object.actor.gesture; }
      return keyedCommands(latest, object.id, playback.frame, values);
    });
  };
  const addShot = () => {
    if (!project) return;
    let shotId = '';
    void store.commands('添加镜头', latest => {
      const shot = createShot(latest, observer); shotId = shot.id;
      return [{ type: 'shot.add', shot }, ...(shot.end > latest.durationFrames ? [{ type: 'project.update' as const, patch: { durationFrames: shot.end } }] : [])];
    }).then(ok => { if (ok) { setSelectedShotId(shotId); setInspectorTab('shot'); } });
  };
  const addObject = (kind: 'actor' | 'box' | 'screen' | 'light') => {
    const object = createObject(kind, project?.objects.filter(item => item.kind === kind).length || 0);
    void store.commands(`添加${object.name.replace(/ \d+$/, '')}`, () => [{ type: 'object.add', object }]).then(ok => { if (ok) selectObject(object.id); });
  };
  const error = store.error || localError || evaluation.error;
  const runningJobs = store.jobs.filter(job => job.status === 'queued' || job.status === 'rendering');
  const changeUtility = (next: Utility) => { playback.pause(); setUtility(previous => previous === next ? null : next); };
  const fullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await workspaceRef.current?.requestFullscreen(); }
    catch { store.setNotice('浏览器未允许全屏，可收起左右面板扩大工作区。'); }
  };

  return <div className={`director-workspace ${!leftOpen ? 'left-collapsed' : ''} ${!rightOpen ? 'right-collapsed' : ''}`} ref={workspaceRef}>
    <header className="app-toolbar"><div className="app-brand"><Box size={18} strokeWidth={1.4} /><span>产品预演</span></div><div className="toolbar-divider" />
      <label className="project-switcher"><span className="sr-only">当前项目</span><select aria-label="切换项目" value={store.activeId} disabled={store.busy || store.loading} onChange={event => store.switchProject(event.target.value)}>{!store.projects.length && <option value="">新建项目开始</option>}{store.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <IconButton label="新建项目" disabled={store.busy} onClick={() => changeUtility('new')} className={utility === 'new' ? 'active' : ''}><Plus size={15} /></IconButton>
      <div className="toolbar-divider" /><IconButton label="撤销（⌘Z）" disabled={store.busy || !store.history.canUndo} onClick={() => void store.undoRedo('undo')}><Undo2 size={16} /></IconButton><IconButton label="重做（⇧⌘Z）" disabled={store.busy || !store.history.canRedo} onClick={() => void store.undoRedo('redo')}><Redo2 size={16} /></IconButton>
      <div className="save-state" aria-live="polite">{store.busy ? <><LoaderCircle className="spin" size={12} />保存中</> : project ? <><Check size={12} />已保存<span>r{project.revision}</span></> : null}</div>
      <div className="toolbar-actions"><button className={utility === 'import' ? 'active' : ''} disabled={!project || store.busy} onClick={() => changeUtility('import')}><FolderInput size={14} /><span>导入模型</span></button><button disabled={!project} className={assistantOpen ? 'active' : ''} onClick={() => { playback.pause(); setAssistantOpen(true); }}><MessageSquareText size={14} /><span>DSH 编排</span></button><IconButton label="项目设置" disabled={!project || store.busy} onClick={() => changeUtility('settings')}><Settings2 size={15} /></IconButton><button className="primary-button" disabled={!project} onClick={() => changeUtility('render')}><ArrowDownToLine size={14} /><span>{runningJobs.length ? '导出中' : '导出视频'}</span>{runningJobs.length > 0 && <i className="export-dot" />}</button></div>
    </header>
    {(utility === 'new' || (!project && !store.loading && !store.projects.length)) && <form className="inline-workflow" onSubmit={event => { event.preventDefault(); if (projectName.trim()) void store.createProject(projectName.trim()).then(ok => { if (ok) setUtility(null); }); }}><label htmlFor="new-project-name">新建项目</label><input id="new-project-name" ref={newInput} value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="项目名称" disabled={store.busy} required /><button type="submit" className="primary-button" disabled={store.busy || !projectName.trim()}>{store.busy ? '创建中…' : '创建'}</button>{project && <IconButton label="取消新建" onClick={() => setUtility(null)}><X size={14} /></IconButton>}</form>}
    {utility === 'import' && project && <form className="inline-workflow import-workflow" onSubmit={event => { event.preventDefault(); if (modelPath.trim()) void store.importAsset(modelPath.trim()).then(ok => { if (ok) { setUtility(null); void store.refresh().then(next => { const model = next?.objects.filter(object => object.kind === 'model').at(-1); if (model) selectObject(model.id); }); } }); }}><label htmlFor="model-path">本地模型</label><input id="model-path" ref={importInput} value={modelPath} onChange={event => setModelPath(event.target.value)} placeholder="GLB 文件的绝对路径" disabled={store.busy} required /><button type="submit" className="primary-button" disabled={store.busy || !modelPath.trim()}>{store.busy ? <LoaderCircle size={13} className="spin" /> : <FolderInput size={13} />}{store.busy ? '正在导入' : '导入 GLB'}</button><IconButton label="关闭导入" onClick={() => setUtility(null)} disabled={store.busy}><X size={14} /></IconButton><small>点击导入后才读取文件，保留桌面与屏幕。</small></form>}
    {error && <div className="workspace-message error-message" role="alert"><span>{error}</span>{store.pending && <button disabled={store.busy} onClick={() => void store.retry()}>重试修改</button>}<IconButton label="关闭提示" onClick={() => { store.dismissError(); setLocalError(''); }}><X size={13} /></IconButton></div>}
    <main className="workspace-main">
      <aside className="left-panel" aria-label="场景管理">{leftOpen ? <><div className="panel-collapse-row"><span>场景管理</span><IconButton label="收起场景面板" onClick={() => setLeftOpen(false)}><PanelLeftClose size={14} /></IconButton></div>{project && <SceneTree project={project} selectedId={selectedId} selectedPartId={selectedPartId} busy={store.busy} onSelect={selectObject} onSelectPart={selectPart} onImport={() => changeUtility('import')} onAdd={addObject} onShot={selectShot} onToggle={(id, property) => { void store.commands(property === 'visible' ? '对象可见性' : '对象锁定', latest => { const object = latest.objects.find(item => item.id === id); return object ? [{ type: 'object.update', id, patch: { [property]: property === 'visible' ? !object.visible : !object.locked } }] : []; }); }} />}</> : <IconButton label="展开场景面板" onClick={() => setLeftOpen(true)}><PanelLeftOpen size={16} /></IconButton>}</aside>
      <section className="stage-panel" aria-label="三维观察视口"><div className="stage-toolbar"><div className="viewport-title"><span className="live-dot" />三维场景<select aria-label="观察视图" value={viewPreset} onChange={e=>setViewPreset(e.target.value as typeof viewPreset)}><option value="perspective">透视</option><option value="front">正视</option><option value="side">侧视</option><option value="top">俯视</option></select></div><div className="stage-tools" role="toolbar" aria-label="场景变换工具">
        <IconButton label="选择（V）" aria-pressed={tool === 'select'} className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')}><MousePointer2 size={14} /></IconButton><IconButton label="移动（G）" aria-pressed={tool === 'translate'} className={tool === 'translate' ? 'active' : ''} disabled={Boolean(selectedObject?.locked)} onClick={() => setTool('translate')}><Move size={15} /></IconButton><IconButton label="旋转（R）" aria-pressed={tool === 'rotate'} className={tool === 'rotate' ? 'active' : ''} disabled={Boolean(selectedObject?.locked)} onClick={() => setTool('rotate')}><Rotate3D size={15} /></IconButton><div className="toolbar-divider" /><IconButton label={showHelpers ? '隐藏场景辅助线' : '显示场景辅助线'} aria-pressed={showHelpers} className={showHelpers ? 'active' : ''} onClick={() => setShowHelpers(value => !value)}><Grid2X2 size={14} /></IconButton><IconButton label="全屏工作台" onClick={() => void fullscreen()}><Maximize2 size={14} /></IconButton>
      </div></div>
        <div className="stage-canvas">{store.loading ? <div className="workspace-loading"><div /><span>正在载入场景</span></div> : project && evaluation.frame ? <ViewportBoundary key={project.id}><StageViewport project={project} frame={evaluation.frame} mode="stage" viewPreset={viewPreset} assetUrl={getAsset} selectedId={selectedId} tool={store.busy || selectedObject?.locked ? 'select' : tool} showHelpers={showHelpers} onSelect={selectObject} onTransformCommit={commitTransform} onObserverPose={observe} /></ViewportBoundary> : <div className="stage-empty"><Camera size={28} strokeWidth={1.1} /><h1>{project ? '添加一个拍摄镜头' : '从产品与空间开始'}</h1><p>{project ? '建立机位后，在三维场景中摆放产品、人物与灯光。' : '创建或打开项目，导入真实产品，编排镜头与动作。'}</p>{project && <button className="primary-button" disabled={store.busy} onClick={addShot}><Plus size={14} />添加镜头</button>}</div>}
          {project && evaluation.frame && <><div className="viewport-overlay-top"><span>{selectedObject?.name || '未选择对象'}</span>{selectedObject?.locked && <span>已锁定</span>}</div><div className="viewport-overlay-bottom"><span>拖动旋转 · 滚轮缩放 · 右键平移</span><span>米 · Y 向上</span></div></>}
        </div>
      </section>
      <aside className="right-panel" aria-label="镜头监看与属性">{rightOpen ? <><div className="panel-collapse-row"><span>镜头与属性</span><IconButton label="收起属性面板" onClick={() => setRightOpen(false)}><PanelRightClose size={14} /></IconButton></div><section className={`camera-monitor ${monitorExpanded ? 'monitor-expanded' : ''}`} aria-label="摄影机监看"><div className="monitor-heading"><button className="monitor-toggle" aria-expanded={monitorOpen} onClick={() => setMonitorOpen(value => !value)}><ChevronDown size={12} className={!monitorOpen ? 'closed' : ''} /><Camera size={13} />摄影机监看</button><IconButton label={monitorExpanded ? '还原监看画面' : '放大监看画面'} onClick={() => { setMonitorOpen(true); setMonitorExpanded(value => !value); }}><Expand size={13} /></IconButton></div>{monitorOpen && <><div className="monitor-viewport" style={{ aspectRatio: `${project?.width || 16} / ${project?.height || 9}` }}>{project && evaluation.frame ? <ViewportBoundary key={project.id}><StageViewport project={project} frame={evaluation.frame} mode="camera" assetUrl={getAsset} selectedId={selectedId} showHelpers={false} /></ViewportBoundary> : <span>添加镜头后显示摄影机画面</span>}</div><div className="monitor-caption"><span>{activeShot?.name || '无拍摄镜头'}</span><span>{Math.round(evaluation.frame?.camera.focalLength || 45)} mm</span></div></>}</section>
        <div className="inspector-tabs" role="tablist" aria-label="属性类型"><button role="tab" aria-selected={inspectorTab === 'object'} className={inspectorTab === 'object' ? 'active' : ''} onClick={() => setInspectorTab('object')}>对象属性</button><button role="tab" aria-selected={inspectorTab === 'shot'} className={inspectorTab === 'shot' ? 'active' : ''} onClick={() => setInspectorTab('shot')}>镜头设置</button></div>
        <label className={`auto-key-toggle ${autoKey ? 'enabled' : ''}`}><input type="checkbox" checked={autoKey} onChange={event => setAutoKey(event.target.checked)} /><Diamond size={10} /><span>自动关键帧</span><small>{autoKey ? `第 ${playback.frame} 帧` : '编辑初始变换'}</small></label>
        <div className="inspector-scroll">{selectedPart && inspectorTab === 'object' && <div className="selected-part-summary"><span>选中源部件</span><strong>{selectedPart.label}</strong><small>{selectedPart.id}</small><button className="full-button" disabled={!selectedShot || store.busy} onClick={bindSelectedPart}><Camera size={12} />设为当前镜头注视目标</button><p>部件动作由关节控制；下方变换编辑所属对象。</p></div>}{project && inspectorTab === 'object' && (selectedObject ? <ObjectInspector key={selectedObject.id} project={project} object={selectedObject} evaluated={evaluation.frame} frame={playback.frame} autoKey={autoKey} busy={store.busy} onCommands={store.commands} onPreview={previewValues} onClearPreview={() => setPreview(null)} onTransform={changeTransform} /> : <p className="empty-copy">在左侧场景树或三维视口中选择一个对象。</p>)}{project && inspectorTab === 'shot' && (selectedShot ? <ShotInspector key={selectedShot.id} project={project} shot={selectedShot} selectedId={selectedId} observer={observer} busy={store.busy} onCommands={store.commands} onSeek={playback.seek} /> : <div className="empty-copy">还没有镜头。<button className="full-button" onClick={addShot}>添加第一个镜头</button></div>)}</div>
      </> : <IconButton label="展开属性面板" onClick={() => setRightOpen(true)}><PanelRightOpen size={16} /></IconButton>}</aside>
    </main>
    {project ? <Timeline project={project} frame={playback.frame} playing={playback.playing} loop={playback.loop} selectedId={selectedId} selectedShotId={selectedShotId} busy={store.busy} onSeek={next => { playback.pause(); playback.seek(next); }} onToggle={playback.toggle} onLoop={playback.setLoop} onShot={selectShot} onAddShot={addShot} onCommands={store.commands} onRecord={recordCurrent} /> : <div className="timeline timeline-loading"><span>{store.loading ? '正在载入项目时间线…' : '项目时间线'}</span></div>}
    <footer className="workspace-status"><span className="status-message" aria-live="polite">{store.notice || (project ? `${project.objects.length} 个场景对象 · ${project.assets.filter(asset => asset.kind === 'model').length} 个模型素材` : '连接本地项目服务')}</span><span>{project ? `${project.width} × ${project.height} · ${project.fps} fps` : 'Director Studio'}<i />{project ? `第 ${playback.frame} 帧` : ''}</span></footer>
    {project && utility === 'render' && <RenderPanel key={project.id} project={project} jobs={store.jobs} busy={store.busy} onRender={options => void store.render(options)} onCancel={id => void store.cancelRender(id)} onClose={() => setUtility(null)} />}
    {project && utility === 'settings' && <section className="utility-panel settings-panel" aria-labelledby="settings-title"><header><h2 id="settings-title"><Settings2 size={14} />项目设置</h2><IconButton label="关闭项目设置" onClick={() => setUtility(null)}><X size={14} /></IconButton></header><fieldset className="utility-body inspector-fields" disabled={store.busy}><TextField label="项目名称" value={project.name} onCommit={name => { if (name.trim()) void store.commands('项目名称', () => [{ type: 'project.update', patch: { name: name.trim() } }]); }} /><NumberField label="总时长" value={project.durationFrames} min={Math.max(1, ...project.shots.map(shot => shot.end))} step={1} suffix="帧" onCommit={durationFrames => { void store.commands('项目时长', latest => [{ type: 'project.update', patch: { durationFrames: Math.max(Math.round(durationFrames), 1, ...latest.shots.map(shot => shot.end)) } }]); }} /><div className="two-fields"><NumberField label="画面宽" value={project.width} min={160} max={3840} step={2} onCommit={width => { void store.commands('画面宽度', () => [{ type: 'project.update', patch: { width: Math.round(width / 2) * 2 } }]); }} /><NumberField label="画面高" value={project.height} min={160} max={3840} step={2} onCommit={height => { void store.commands('画面高度', () => [{ type: 'project.update', patch: { height: Math.round(height / 2) * 2 } }]); }} /></div><p className="field-hint">时间单位为帧，项目帧率 {project.fps} fps。缩短总时长前请先调整镜头结束帧。</p><p className="project-id">项目 ID<br />{project.id}</p></fieldset></section>}
    {project && assistantOpen && <AssistantHandoff project={project} selectedId={selectedId} selectedPartId={selectedPart?.id} frame={playback.frame} onClose={() => setAssistantOpen(false)} />}
  </div>;
}
