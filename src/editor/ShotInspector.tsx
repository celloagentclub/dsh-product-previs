import { Camera, Crosshair, MoveRight, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CameraPose, Easing, PrevisProject, Shot, V3 } from '../core/types';
import { evaluateProject } from '../core/evaluate';
import { clonePose } from './commands';
import { NumberField, Section, SelectField, TextField, VectorField } from './controls';
import type { CommandFactory } from './useProject';

export function ShotInspector({ project, shot, selectedId, observer, busy, onCommands, onSeek }: {
  project: PrevisProject; shot: Shot; selectedId?: string; observer?: CameraPose; busy: boolean;
  onCommands: (label: string, factory: CommandFactory) => Promise<boolean>; onSeek: (frame: number) => void;
}) {
  const [endpoint, setEndpoint] = useState<'from' | 'to'>('from');
  const [targetId, setTargetId] = useState(shot.camera.targetBinding?.objectId || selectedId || '');
  const [targetPartId, setTargetPartId] = useState(shot.camera.targetBinding?.partId || '');
  const targetObject = project.objects.find(object => object.id === targetId);
  const targetAsset = project.assets.find(asset => asset.id === targetObject?.assetId);
  const targetParts = targetAsset?.kind === 'model' ? targetAsset.parts.filter(part => !targetObject?.partIds || targetObject.partIds.includes(part.id)) : [];
  useEffect(() => {
    if (shot.camera.targetBinding) { setTargetId(shot.camera.targetBinding.objectId); setTargetPartId(shot.camera.targetBinding.partId || ''); }
  }, [shot.camera.targetBinding?.objectId, shot.camera.targetBinding?.partId]);
  const pose = shot.camera[endpoint];
  const patch = (label: string, update: (latest: Shot) => Partial<Shot>) => onCommands(label, latest => {
    const current = latest.shots.find(item => item.id === shot.id);
    if (!current) throw new Error('镜头已被移除。');
    const next = update(current);
    const end = next.end ?? current.end;
    const commands: ReturnType<CommandFactory> = [{ type: 'shot.update', id: current.id, patch: next }];
    if (end > latest.durationFrames) commands.push({ type: 'project.update', patch: { durationFrames: end } });
    return commands;
  });
  const patchPose = (update: (latest: CameraPose) => CameraPose) => {
    void patch('拍摄机位', current => ({ camera: { ...current.camera, [endpoint]: update(current.camera[endpoint]) } }));
  };
  const capture = (point: 'from' | 'to') => {
    if (!observer) return;
    const captured = clonePose(observer);
    void patch(`镜头${point === 'from' ? '起点' : '终点'}`, current => ({ camera: { ...current.camera, [point]: captured } }));
  };
  const followTarget = (follow: boolean) => {
    if (!targetId) return;
    void onCommands(follow ? '生成跟随机位' : '设置注视目标', latest => {
      const current = latest.shots.find(item => item.id === shot.id);
      const object = latest.objects.find(item => item.id === targetId);
      if (!current || !object) throw new Error('镜头或目标对象已被移除。');
      const targetBinding: NonNullable<Shot['camera']['targetBinding']> = {
        objectId: object.id, ...(targetPartId ? { partId: targetPartId } : {}),
        offset: current.camera.targetBinding?.objectId === object.id ? current.camera.targetBinding.offset || [0, 0, 0] : [0, 0, 0],
        followPosition: follow,
      };
      return [{ type: 'shot.update', id: current.id, patch: { camera: { ...current.camera, targetBinding } } }];
    });
  };
  return <fieldset className="inspector-fields" disabled={busy}>
    <Section title="镜头编排">
      <TextField label="镜头名" value={shot.name} onCommit={name => { if (name.trim()) void patch('镜头名称', () => ({ name: name.trim() })); }} />
      <div className="two-fields"><NumberField label="起始帧" value={shot.start} min={0} max={shot.end - 1} step={1} onCommit={start => { void patch('镜头起始帧', current => ({ start: Math.min(Math.round(start), current.end - 1) })); }} /><NumberField label="结束帧" value={shot.end} min={shot.start + 1} step={1} onCommit={end => { void patch('镜头结束帧', current => ({ end: Math.max(Math.round(end), current.start + 1) })); }} /></div>
      <NumberField label="时长" value={shot.end - shot.start} min={1} step={1} suffix="帧" onCommit={length => { void patch('镜头时长', current => ({ end: current.start + Math.max(1, Math.round(length)) })); }} />
      <div className="shot-time-info"><button className="text-button" onClick={() => onSeek(shot.start)}>跳到起点</button><span>{((shot.end - shot.start) / project.fps).toFixed(2)} 秒 · 结束帧不含</span></div>
      <TextField label="画面说明" value={shot.description} multiline onCommit={description => { void patch('画面说明', () => ({ description })); }} />
    </Section>
    <Section title="摄影机运动">
      <SelectField label="运镜" value={shot.camera.move} onChange={move => { void patch('运镜方式', current => ({ camera: { ...current.camera, move: move as Shot['camera']['move'] } })); }}><option value="static">固定</option><option value="linear">推拉 / 平移</option><option value="orbit">环绕</option><option value="spline">路径</option></SelectField>
      <SelectField label="速度曲线" value={shot.camera.easing} onChange={easing => { void patch('运镜曲线', current => ({ camera: { ...current.camera, easing: easing as Easing } })); }}><option value="smooth">平滑</option><option value="linear">匀速</option><option value="ease-in">逐渐加速</option><option value="ease-out">逐渐减速</option></SelectField>
      {shot.camera.move === 'orbit' && <><NumberField label="环绕角度" value={shot.camera.orbitDegrees ?? (Math.atan2(shot.camera.to.position[0]-shot.camera.to.target[0],shot.camera.to.position[2]-shot.camera.to.target[2])-Math.atan2(shot.camera.from.position[0]-shot.camera.from.target[0],shot.camera.from.position[2]-shot.camera.from.target[2]))*180/Math.PI} step={5} suffix="°" onCommit={orbitDegrees => { void patch('环绕角度', current => ({ camera: { ...current.camera, orbitDegrees } })); }} /><p className="field-hint">填写角度后按此总转角环绕；终点位置只用于距离与高度插值。</p><button className="text-button" onClick={()=>{void patch('按起终点环绕',current=>{const {orbitDegrees:_degrees,...camera}=current.camera;return{camera};});}}>按起终点自动取最短弧</button></>}
      <div className="endpoint-tabs" role="tablist" aria-label="编辑镜头端点"><button role="tab" aria-selected={endpoint === 'from'} className={endpoint === 'from' ? 'active' : ''} onClick={() => setEndpoint('from')}>起点</button><MoveRight size={13} /><button role="tab" aria-selected={endpoint === 'to'} className={endpoint === 'to' ? 'active' : ''} onClick={() => setEndpoint('to')}>终点</button></div>
      <button className="full-button" disabled={!observer || busy} onClick={() => capture(endpoint)}><Camera size={13} />用观察视角设{endpoint === 'from' ? '起点' : '终点'}</button>
      <VectorField label="机位" value={pose.position} suffix="米" onCommit={(axis, value) => patchPose(prior => { const position: V3 = [...prior.position]; position[axis] = value; return { ...prior, position }; })} />
      <VectorField label="注视" value={pose.target} suffix="米" onCommit={(axis, value) => patchPose(prior => { const target: V3 = [...prior.target]; target[axis] = value; return { ...prior, target }; })} />
      <NumberField label="焦段" value={pose.focalLength} min={8} max={300} step={1} suffix="mm" onCommit={focalLength => patchPose(prior => ({ ...prior, focalLength }))} />
    </Section>
    <Section title="目标与跟随" defaultOpen={Boolean(shot.camera.targetBinding)}>
      <SelectField label="目标对象" value={project.objects.some(object => object.id === targetId) ? targetId : ''} onChange={value => { setTargetId(value); setTargetPartId(''); }}><option value="">选择场景对象</option>{project.objects.filter(object => object.kind !== 'light').map(object => <option key={object.id} value={object.id}>{object.name}</option>)}</SelectField>
      {targetParts.length > 0 && <SelectField label="目标部件" value={targetPartId} onChange={setTargetPartId}><option value="">对象整体中心</option>{targetParts.map(part => <option key={part.id} value={part.id}>{part.label}</option>)}</SelectField>}
      <div className="stack-actions"><button disabled={!targetId || busy} onClick={() => followTarget(false)}><Crosshair size={13} />注视对象</button><button disabled={!targetId || busy} onClick={() => followTarget(true)}><Camera size={13} />生成跟随机位</button></div>
      {shot.camera.targetBinding && <><div className="binding-state"><span>{shot.camera.targetBinding.followPosition ? '持续跟随机位与注视' : '持续注视目标'}</span><button className="text-button" onClick={() => { void patch('解除目标跟随', current => { const { targetBinding: _binding, ...camera } = current.camera; return { camera }; }); }}>解除跟随</button></div><VectorField label="目标偏移" value={shot.camera.targetBinding.offset || [0, 0, 0]} suffix="米" onCommit={(axis, value) => { void patch('目标偏移', current => { if (!current.camera.targetBinding) return {}; const offset: V3 = [...(current.camera.targetBinding.offset || [0, 0, 0])]; offset[axis] = value; return { camera: { ...current.camera, targetBinding: { ...current.camera.targetBinding, offset } } }; }); }} /></>}
      <p className="field-hint">逐帧跟踪对象或部件的真实位置，包含关节与爆炸动作。跟随机位会随目标移动，仍保留本镜运镜。</p>
    </Section>
    <Section title="高级摄影参数" defaultOpen={false}>
      <p className="field-hint">白模预演保持全画面清晰；焦点与光圈作为镜头参数记录，当前不模拟景深模糊。</p>
      <NumberField label="焦点距离" value={pose.focusDistance} min={0.01} step={0.1} suffix="m" onCommit={focusDistance => patchPose(prior => ({ ...prior, focusDistance }))} />
      <NumberField label="光圈" value={pose.aperture} min={0.1} max={64} step={0.1} suffix="f" onCommit={aperture => patchPose(prior => ({ ...prior, aperture }))} />
      <NumberField label="横滚" value={pose.roll || 0} min={-180} max={180} step={1} suffix="°" onCommit={roll => patchPose(prior => ({ ...prior, roll }))} />
      {shot.camera.move === 'spline' && <div className="path-points"><span className="subtle-label">路径控制点</span>{(shot.camera.points || []).map((point, index) => <div key={index}><VectorField label={`点 ${index + 1}`} value={point} onCommit={(axis, value) => { void patch('路径控制点', current => { const points = (current.camera.points || []).map(item => [...item] as V3); if (points[index]) points[index][axis] = value; return { camera: { ...current.camera, points } }; }); }} /><button className="text-button" onClick={() => { void patch('移除路径点', current => ({ camera: { ...current.camera, points: (current.camera.points || []).filter((_, pointIndex) => pointIndex !== index) } })); }}>移除点</button></div>)}<button className="full-button" onClick={() => { void patch('添加路径点', current => ({ camera: { ...current.camera, points: [...(current.camera.points || []), [...(observer?.position || current.camera.to.position)]] } })); }}>添加观察位置到路径</button></div>}
    </Section>
    <Section title="管理" defaultOpen={false}><button className="full-button danger-text" onClick={() => { if (window.confirm(`删除镜头“${shot.name}”？此操作可撤销。`)) void onCommands('删除镜头', () => [{ type: 'shot.remove', id: shot.id }]); }}><Trash2 size={13} />删除镜头</button></Section>
  </fieldset>;
}
