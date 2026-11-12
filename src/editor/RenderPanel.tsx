import { useState } from 'react';
import { ArrowDownToLine, ExternalLink, Film, Square, X } from 'lucide-react';
import type { PrevisProject, RenderJob } from '../core/types';
import { outputUrl } from './api';
import { IconButton, NumberField } from './controls';

export function RenderPanel({ project, jobs, busy, onRender, onCancel, onClose }: {
  project: PrevisProject; jobs: RenderJob[]; busy: boolean;
  onRender: (options: { width: number; height: number; fps: number }) => void;
  onCancel: (id: string) => void; onClose: () => void;
}) {
  const [width, setWidth] = useState(project.width);
  const [height, setHeight] = useState(project.height);
  const [fps, setFps] = useState(project.fps);
  const active = jobs.some(job => job.status === 'queued' || job.status === 'rendering');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const statuses = { queued: '等待渲染', rendering: '正在渲染', completed: '已完成', failed: '导出失败', cancelled: '已取消' };
  // The user cancelled on purpose: that is a result, not an error to explain.
  const detail = (job: RenderJob) => job.status === 'cancelled' ? '已按要求停止，未生成文件。' : job.error || job.message || `修订 ${job.revision}`;
  return <section className="utility-panel render-panel" aria-labelledby="render-title"><header><h2 id="render-title"><Film size={15} />导出白模视频</h2><IconButton label="关闭导出面板" onClick={onClose}><X size={15} /></IconButton></header>
    <div className="utility-body"><div className="render-format"><span>MP4 · H.264</span><span>{(project.durationFrames / project.fps).toFixed(2)} 秒</span></div>
      <fieldset disabled={busy || active} className="inspector-fields"><div className="two-fields"><NumberField label="宽度" value={width} min={160} max={3840} step={2} onCommit={value => setWidth(Math.round(value / 2) * 2)} /><NumberField label="高度" value={height} min={160} max={3840} step={2} onCommit={value => setHeight(Math.round(value / 2) * 2)} /></div><NumberField label="输出帧率" value={fps} min={1} max={60} step={1} suffix="fps" onCommit={value => setFps(Math.round(value))} />
        <button className="primary-button full-button" disabled={busy || active || !project.shots.length} onClick={() => onRender({ width, height, fps })}><ArrowDownToLine size={14} />{active ? '导出进行中' : '开始导出'}</button>
      </fieldset>
      <p className="field-hint">导出使用当前已保存的项目修订，包含产品、人物动作与摄影机运动。</p>
      <div className="render-jobs">{jobs.length === 0 && <p className="empty-copy">导出后可在这里查看进度与视频。</p>}{jobs.map(job => {
        const progress = Math.round(Math.min(1, Math.max(0, job.progress > 1 ? job.progress / 100 : job.progress)) * 100);
        const running = job.status === 'queued' || job.status === 'rendering';
        return <article className="render-job" key={job.id}><div className="render-job-heading"><strong>{statuses[job.status]}</strong><span>{running ? `${progress}%` : `${job.width} × ${job.height}`}</span></div>
          {running && <progress aria-label="视频导出进度" value={progress} max={100} />}
          <p>{detail(job)}</p><div className="render-job-footer"><span>修订 {job.revision} · {job.fps} fps</span>
            {running && <button className="text-button danger-text" disabled={cancelling === job.id} onClick={() => { setCancelling(job.id); onCancel(job.id); window.setTimeout(() => setCancelling(null), 1200); }}><Square size={11} />{cancelling === job.id ? '正在取消' : '取消导出'}</button>}
            {job.status === 'completed' && <a href={outputUrl(project.id, job.id)} target="_blank" rel="noreferrer"><ExternalLink size={12} />打开视频</a>}
          </div></article>;
      })}</div>
    </div>
  </section>;
}
