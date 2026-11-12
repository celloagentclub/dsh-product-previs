import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Diamond, Pause, Play, Plus, Repeat2, Trash2 } from 'lucide-react';
import type { Easing, PrevisProject, Track } from '../core/types';
import { IconButton, NumberField } from './controls';
import type { CommandFactory } from './useProject';

const propertyLabels: Record<string, string> = { position: '位置', rotation: '旋转', scale: '缩放', pose: '姿态', gesture: '手势', explode: '爆炸 / 回装', visible: '显示', screen: '屏幕' };
export function timecode(frame: number, fps: number) {
  const seconds = Math.floor(frame / fps);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(frame % fps).padStart(2, '0')}`;
}
export function Timeline({ project, frame, playing, loop, selectedId, selectedShotId, busy, onSeek, onToggle, onLoop, onShot, onAddShot, onCommands, onRecord }: {
  project: PrevisProject; frame: number; playing: boolean; loop: boolean; selectedId?: string; selectedShotId?: string; busy: boolean;
  onSeek: (frame: number) => void; onToggle: () => void; onLoop: (loop: boolean) => void; onShot: (id: string) => void; onAddShot: () => void;
  onCommands: (label: string, factory: CommandFactory) => Promise<boolean>; onRecord: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<{ trackId: string; frame: number } | null>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const duration = Math.max(1, project.durationFrames);
  const tracks = project.tracks.filter(track => track.objectId === selectedId);
  const selectedObject = project.objects.find(object => object.id === selectedId);
  const keyTrack = project.tracks.find(track => track.id === selectedKey?.trackId);
  const key = keyTrack?.keys.find(item => item.frame === selectedKey?.frame);
  const tickStep = Math.max(project.fps, Math.ceil(duration / project.fps / 10) * project.fps);
  const ticks = Array.from({ length: Math.ceil(duration / tickStep) }, (_, index) => index * tickStep);
  const percent = (value: number) => `${value / duration * 100}%`;
  useEffect(() => { setSelectedKey(null); }, [selectedId, project.id]);
  const seekPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (rect) onSeek(Math.round((event.clientX - rect.left) / rect.width * (duration - 1)));
  };
  const changeEasing = (easing: Easing) => {
    if (!selectedKey) return;
    void onCommands('关键帧曲线', latest => {
      const track = latest.tracks.find(item => item.id === selectedKey.trackId);
      if (!track) return [];
      return [{ type: 'track.set', track: { ...track, keys: track.keys.map(item => item.frame === selectedKey.frame ? { ...item, easing } : item) } }];
    });
  };
  const deleteKey = () => {
    if (!selectedKey) return;
    void onCommands('删除关键帧', latest => {
      const track = latest.tracks.find(item => item.id === selectedKey.trackId);
      if (!track) return [];
      const keys = track.keys.filter(item => item.frame !== selectedKey.frame);
      return keys.length ? [{ type: 'track.set', track: { ...track, keys } }] : [{ type: 'track.remove', id: track.id }];
    }).then(ok => { if (ok) setSelectedKey(null); });
  };
  const labelFor = (track: Track) => track.property.startsWith('joint:') ? (selectedObject?.joints?.find(joint => `joint:${joint.id}` === track.property)?.label || '关节') : (propertyLabels[track.property] || track.property);
  return <section className="timeline" aria-label="镜头与动作时间线">
    <div className="timeline-toolbar">
      <div className="transport">
        <IconButton label="跳到第一帧" onClick={() => onSeek(0)}><ChevronFirst size={16} /></IconButton>
        <IconButton label="上一帧" onClick={() => onSeek(frame - 1)}><ChevronLeft size={16} /></IconButton>
        <IconButton label={playing ? '暂停（空格）' : '播放（空格）'} className={`play-button ${playing ? 'active' : ''}`} onClick={onToggle}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</IconButton>
        <IconButton label="下一帧" onClick={() => onSeek(frame + 1)}><ChevronRight size={16} /></IconButton>
        <IconButton label="跳到最后一帧" onClick={() => onSeek(duration - 1)}><ChevronLast size={16} /></IconButton>
        <IconButton label={loop ? '关闭循环播放' : '循环播放'} aria-pressed={loop} className={loop ? 'active' : ''} onClick={() => onLoop(!loop)}><Repeat2 size={15} /></IconButton>
      </div>
      <output className="timecode" aria-label="当前时间码">{timecode(frame, project.fps)}</output>
      <div className="frame-entry"><NumberField compact label="帧" value={frame} min={0} max={duration - 1} step={1} onCommit={onSeek} /><span>/ {duration - 1}</span></div>
      <span className="timeline-rate">{project.fps} fps</span>
      <div className="timeline-toolbar-end"><button disabled={busy || !selectedId} onClick={onRecord}><Diamond size={12} />记录当前帧</button><button disabled={busy} onClick={onAddShot}><Plus size={13} />添加镜头</button></div>
    </div>
    <div className="timeline-content">
      <div className="timeline-label-column"><div className="timeline-ruler-label">时间 / 秒</div><div className="timeline-shot-label">镜头</div><div className="timeline-object-label" title={selectedObject?.name}>{selectedObject?.name || '选择对象查看轨道'}</div></div>
      <div className="timeline-track-column">
        <div className="timeline-ruler" ref={rulerRef} role="slider" tabIndex={0} aria-label="时间线播放头" aria-valuemin={0} aria-valuemax={duration - 1} aria-valuenow={frame}
          onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); seekPointer(event); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekPointer(event); }}
          onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onSeek(frame + (event.key === 'ArrowLeft' ? -1 : 1)); } if (event.key === 'Home') onSeek(0); if (event.key === 'End') onSeek(duration - 1); }}>
          {ticks.map(tick => <span className="ruler-tick" key={tick} style={{ left: percent(tick) }}>{(tick / project.fps).toFixed(tick % project.fps ? 1 : 0)}</span>)}
        </div>
        <div className="shot-lane">{project.shots.map((shot, index) => <button key={shot.id} className={`shot-clip ${selectedShotId === shot.id ? 'selected' : ''}`} style={{ left: percent(shot.start), width: percent(shot.end - shot.start) }} onClick={() => onShot(shot.id)} title={`${shot.name} · ${shot.start}–${shot.end - 1} 帧`}><small>{String(index + 1).padStart(2, '0')}</small><span>{shot.name}</span><em>{shot.end - shot.start} f</em></button>)}
          {project.shots.length === 0 && <button className="empty-shot" disabled={busy} onClick={onAddShot}><Plus size={13} />添加第一个镜头</button>}
        </div>
        <div className="object-track-spacer" />
        <div className="timeline-playhead" style={{ left: percent(frame) }}><span /><i /></div>
      </div>
    </div>
    <div className="timeline-tracks-scroll">
      {tracks.map(track => <div className="track-row" key={track.id}><div className="track-name"><Diamond size={9} /><span>{labelFor(track)}</span><small>{track.keys.length}</small></div><div className="track-keys">
        <div className="track-line" />{track.keys.map(item => <button key={item.frame} className={`key-marker ${selectedKey?.trackId === track.id && selectedKey.frame === item.frame ? 'selected' : ''}`} style={{ left: percent(item.frame) }} aria-label={`${labelFor(track)}，第 ${item.frame} 帧`} title={`${labelFor(track)} · ${item.frame} 帧 · ${Array.isArray(item.value) ? item.value.map(value => Number(value.toFixed(2))).join(', ') : item.value}`} onClick={() => { setSelectedKey({ trackId: track.id, frame: item.frame }); onSeek(item.frame); }}><Diamond size={9} fill="currentColor" /></button>)}
        <div className="track-playhead" style={{ left: percent(frame) }} />
      </div></div>)}
      {tracks.length === 0 && <div className="track-empty"><span>{selectedId ? '此对象还没有动画关键帧。' : '在场景中选择产品或人偶，查看它的动作轨道。'}</span>{selectedId && <button className="text-button" disabled={busy} onClick={onRecord}>在当前帧记录初始状态</button>}</div>}
    </div>
    <div className="timeline-footer">{selectedKey && key ? <><span>{labelFor(keyTrack!)} · 第 {key.frame} 帧</span><label>插值<select aria-label="关键帧插值曲线" value={key.easing || 'linear'} disabled={busy} onChange={event => changeEasing(event.target.value as Easing)}><option value="linear">匀速</option><option value="smooth">平滑</option><option value="ease-in">加速</option><option value="ease-out">减速</option></select></label><IconButton label="删除选中关键帧" disabled={busy} onClick={deleteKey}><Trash2 size={12} /></IconButton></> : <><span>拖动刻度定位 · 单击菱形编辑关键帧</span><span>{project.shots.length} 镜头 · {(duration / project.fps).toFixed(2)} 秒</span></>}</div>
  </section>;
}
