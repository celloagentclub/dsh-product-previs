import { Diamond, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { ActorGesture, ActorPose, EvaluatedFrame, JointBinding, ModelAsset, PrevisProject, SceneObject, Track, TrackValue, Transform, V3 } from '../core/types';
import { evaluateProject } from '../core/evaluate';
import { keyedCommands, uid } from './commands';
import { IconButton, NumberField, RangeField, Section, SelectField, TextField, VectorField } from './controls';
import type { CommandFactory } from './useProject';

type Values = Partial<Record<Track['property'], TrackValue>>;
export function ObjectInspector({ project, object, evaluated, frame, autoKey, busy, onCommands, onPreview, onClearPreview, onTransform }: {
  project: PrevisProject; object: SceneObject; evaluated: EvaluatedFrame | null; frame: number; autoKey: boolean; busy: boolean;
  onCommands: (label: string, factory: CommandFactory) => Promise<boolean>;
  onPreview: (id: string, values: Values) => void; onClearPreview: () => void;
  onTransform: (property: keyof Transform, axis: 0 | 1 | 2, value: number) => void;
}) {
  const current = evaluated?.objects[object.id];
  const shownTransform = autoKey && current ? current.transform : object.transform;
  const modelAsset = project.assets.find(asset => asset.id === object.assetId && asset.kind === 'model') as ModelAsset | undefined;
  const parts = modelAsset?.parts.filter(part => !object.partIds || object.partIds.includes(part.id)) || [];
  const patch = (label: string, update: (latest: SceneObject) => Partial<SceneObject>) => onCommands(label, latest => {
    const selected = latest.objects.find(item => item.id === object.id);
    if (!selected) throw new Error('对象已被移除。');
    return [{ type: 'object.update', id: selected.id, patch: update(selected) }];
  });
  const record = (label: string, values: Values) => onCommands(label, latest => keyedCommands(latest, object.id, frame, values)).then(ok => { if (ok) onClearPreview(); return ok; });
  const updateRig = (jointId: string, update: (joint: JointBinding) => JointBinding) => onCommands('关节绑定', latest => {
    const selected = latest.objects.find(item => item.id === object.id);
    if (!selected) throw new Error('对象已被移除。');
    return [{ type: 'rig.set', objectId: selected.id, joints: (selected.joints || []).map(joint => joint.id === jointId ? update(joint) : joint) }];
  });
  const removeJoint = (jointId: string) => onCommands('删除关节', latest => {
    const selected = latest.objects.find(item => item.id === object.id);
    if (!selected) return [];
    const removed = selected.joints?.find(joint => joint.id === jointId);
    const joints = (selected.joints || []).filter(joint => joint.id !== jointId).map(joint => {
      if (joint.parentId !== jointId) return joint;
      const { parentId: _parentId, ...rest } = joint;
      return removed?.parentId ? { ...rest, parentId: removed.parentId } : rest;
    });
    return [{ type: 'rig.set', objectId: selected.id, joints }, ...latest.tracks.filter(track => track.objectId === selected.id && track.property === `joint:${jointId}`).map(track => ({ type: 'track.remove' as const, id: track.id }))];
  });
  const addJoint = () => {
    const id = uid('joint');
    void onCommands('添加关节', latest => {
      const selected = latest.objects.find(item => item.id === object.id);
      if (!selected) throw new Error('对象已被移除。');
      const asset = latest.assets.find(item => item.id === selected.assetId);
      const available = asset?.kind === 'model' ? asset.parts.filter(part => !selected.partIds || selected.partIds.includes(part.id)) : [];
      const part = available.find(item => item.role === 'product') || available[0];
      if (!part) throw new Error('模型中没有可绑定部件。');
      const pivot = part.center.map((value, axis) => value - (selected.sourceOrigin?.[axis] || 0)) as V3;
      return [{ type: 'rig.set', objectId: selected.id, joints: [...(selected.joints || []), { id, label: `关节 ${(selected.joints || []).length + 1}`, pivot, axis: [0, 1, 0], minDeg: -90, maxDeg: 90, restAngle: 0, affects: [part.id] }] }];
    });
  };
  const removeObject = () => {
    const hasMounted = project.objects.some(item => item.screen?.mount?.objectId === object.id);
    if (!window.confirm(`删除“${object.name}”及其动画轨道？${hasMounted ? '挂载到它的屏幕将解除绑定。' : ''}此操作可撤销。`)) return;
    void onCommands('删除对象', latest => [
      ...latest.objects.filter(item => item.screen?.mount?.objectId === object.id).map(item => {
        const { mount: _mount, ...screen } = item.screen!;
        return { type: 'object.update' as const, id: item.id, patch: { screen } };
      }),
      ...latest.shots.filter(shot => shot.camera.targetBinding?.objectId === object.id).map(shot => {
        const { targetBinding: _binding, ...camera } = shot.camera;
        return { type: 'shot.update' as const, id: shot.id, patch: { camera } };
      }),
      { type: 'object.remove', id: object.id },
    ]);
  };
  const eligibleParent = (jointId: string, candidateId: string) => {
    let candidate = object.joints?.find(joint => joint.id === candidateId);
    const seen = new Set<string>();
    while (candidate) {
      if (candidate.id === jointId || seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      candidate = object.joints?.find(joint => joint.id === candidate?.parentId);
    }
    return true;
  };
  const recordCurrent = () => {
    void onCommands('当前帧动作', latest => {
      const selected = latest.objects.find(item => item.id === object.id);
      if (!selected) throw new Error('对象已被移除。');
      const actual = latest.shots.length ? evaluateProject(latest, frame).objects[object.id] : undefined;
      const transform = actual?.transform || selected.transform;
      const values: Values = { position: transform.position, rotation: transform.rotation, scale: transform.scale };
      for (const joint of selected.joints || []) values[`joint:${joint.id}`] = actual?.jointAngles[joint.id] ?? joint.restAngle;
      if (selected.kind === 'model') values.explode = actual?.explode || 0;
      if (selected.actor) { values.pose = actual ? (actual.pose.mix < 0.5 ? actual.pose.from : actual.pose.to) : selected.actor.pose; values.gesture = actual ? (actual.gesture.mix < 0.5 ? actual.gesture.from : actual.gesture.to) : selected.actor.gesture; }
      return keyedCommands(latest, selected.id, frame, values);
    });
  };
  return <fieldset className="inspector-fields" disabled={busy || Boolean(object.locked)}>
    <Section title="对象属性">
      <TextField label="名称" value={object.name} onCommit={name => { if (name.trim()) void patch('对象名称', () => ({ name: name.trim() })); }} />
      <div className="property-info"><span>{({ model: '产品模型', actor: '人偶', box: '方块', plane: '地面', screen: '屏幕', light: '灯光' })[object.kind]}</span><span>{object.locked ? '已锁定' : '可编辑'}</span></div>
    </Section>
    <Section title={autoKey ? `变换 · 第 ${frame} 帧` : '初始变换'}>
      <VectorField label="位置" value={shownTransform.position} suffix="米" onCommit={(axis, value) => onTransform('position', axis, value)} />
      <VectorField label="旋转" value={shownTransform.rotation} suffix="度" step={1} onCommit={(axis, value) => onTransform('rotation', axis, value)} />
      <VectorField label="缩放" value={shownTransform.scale} min={0.001} step={0.05} onCommit={(axis, value) => onTransform('scale', axis, value)} />
      <p className="field-hint">{autoKey ? '修改写入当前帧，保留其他关键帧。' : '修改初始位置。已有动画轨道仍按关键帧播放。'}</p>
      <button className="full-button record-button" onClick={recordCurrent}><Diamond size={13} />当前帧记录<span>{frame} f</span></button>
    </Section>
    {object.kind === 'model' && <>
      <Section title="产品动作">
        {(object.joints || []).map(joint => <RangeField key={joint.id} label={joint.label} value={current?.jointAngles[joint.id] ?? joint.restAngle} min={joint.minDeg} max={joint.maxDeg} step={0.5} suffix="°"
          onPreview={value => onPreview(object.id, { [`joint:${joint.id}`]: value })} onCommit={value => { void record('关节动作', { [`joint:${joint.id}`]: value }); }} />)}
        {!(object.joints || []).length && <p className="field-hint">在高级关节绑定中选择部件，设置旋转轴心。</p>}
        <RangeField label="爆炸距离" value={current?.explode || 0} min={0} max={2} step={0.01} suffix=" m" onPreview={value => onPreview(object.id, { explode: value })} onCommit={value => { void record('爆炸动作', { explode: value }); }} />
        <button className="full-button" onClick={() => { onPreview(object.id, { explode: 0 }); void record('产品回装', { explode: 0 }); }}><RotateCcw size={13} />当前帧回装</button>
        <p className="field-hint">拖动立即预览；松开记录当前帧。爆炸 0 为完整回装。</p>
      </Section>
      <Section title="高级 · 关节绑定" defaultOpen={false}>
        <p className="field-hint">轴心与轴向使用产品局部坐标，角度单位为度。</p>
        {(object.joints || []).map(joint => <details className="joint-binding" key={joint.id}><summary>{joint.label}<span>{joint.affects.length} 个部件</span></summary>
          <TextField label="关节名" value={joint.label} onCommit={label => { void updateRig(joint.id, prior => ({ ...prior, label })); }} />
          <SelectField label="父关节" value={joint.parentId || ''} onChange={parentId => { void updateRig(joint.id, prior => { if (parentId) return { ...prior, parentId }; const { parentId: _parentId, ...rest } = prior; return rest; }); }}><option value="">无</option>{(object.joints || []).filter(item => item.id !== joint.id && eligibleParent(joint.id, item.id)).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</SelectField>
          <VectorField label="轴心" value={joint.pivot} onCommit={(axis, value) => { void updateRig(joint.id, prior => { const pivot: V3 = [...prior.pivot]; pivot[axis] = value; return { ...prior, pivot }; }); }} />
          <VectorField label="轴向" value={joint.axis} onCommit={(axis, value) => { void updateRig(joint.id, prior => { const next: V3 = [...prior.axis]; next[axis] = value; if (next.every(item => item === 0)) throw new Error('旋转轴不能为零向量。'); return { ...prior, axis: next }; }); }} />
          <div className="two-fields"><NumberField label="最小角" value={joint.minDeg} max={joint.maxDeg} step={1} onCommit={minDeg => { void updateRig(joint.id, prior => ({ ...prior, minDeg, restAngle: Math.max(minDeg, prior.restAngle) })); }} /><NumberField label="最大角" value={joint.maxDeg} min={joint.minDeg} step={1} onCommit={maxDeg => { void updateRig(joint.id, prior => ({ ...prior, maxDeg, restAngle: Math.min(maxDeg, prior.restAngle) })); }} /></div>
          <NumberField label="初始角" value={joint.restAngle} min={joint.minDeg} max={joint.maxDeg} step={1} onCommit={restAngle => { void updateRig(joint.id, prior => ({ ...prior, restAngle })); }} />
          <div className="part-bindings"><span className="subtle-label">受影响部件</span>{parts.map(part => <label key={part.id}><input type="checkbox" checked={joint.affects.includes(part.id)} disabled={joint.affects.length === 1 && joint.affects.includes(part.id)} onChange={event => { const checked = event.target.checked; void updateRig(joint.id, prior => ({ ...prior, affects: checked ? [...new Set([...prior.affects, part.id])] : prior.affects.filter(id => id !== part.id) })); }} /><span>{part.label}</span></label>)}</div>
          <button className="text-button danger-text" onClick={() => { void removeJoint(joint.id); }}><Trash2 size={12} />删除绑定与对应轨道</button>
        </details>)}
        <button className="full-button" onClick={addJoint} disabled={!parts.length}><Plus size={13} />添加关节</button>
      </Section>
    </>}
    {object.actor && <Section title="人物动作">
      <SelectField label="姿态" value={current ? (current.pose.mix < 0.5 ? current.pose.from : current.pose.to) : object.actor.pose} onChange={value => { void record('人物姿态', { pose: value as ActorPose }); }}><option value="standing">站立</option><option value="sitting">坐姿</option><option value="walking">行走</option></SelectField>
      <SelectField label="手势" value={current ? (current.gesture.mix < 0.5 ? current.gesture.from : current.gesture.to) : object.actor.gesture} onChange={value => { void record('人物手势', { gesture: value as ActorGesture }); }}><option value="neutral">自然</option><option value="raise">抬手</option><option value="reach">伸手</option><option value="type">操作屏幕</option></SelectField>
      <NumberField label="身高" value={object.actor.height} min={0.6} max={2.5} step={0.01} suffix="m" onCommit={height => { void patch('人物身高', prior => ({ actor: { ...prior.actor!, height } })); }} />
      <VectorField label="伸手目标" value={object.actor.target || [0, 1.1, 0.7]} onCommit={(axis, value) => { void patch('伸手目标', prior => { const target: V3 = [...(prior.actor?.target || [0, 1.1, 0.7])]; target[axis] = value; return { actor: { ...prior.actor!, target } }; }); }} />
      <p className="field-hint">姿态与手势记录在当前帧。开启自动关键帧后，改变位置可编排行走路线。</p>
    </Section>}
    {object.screen && <Section title="屏幕内容">
      <TextField multiline label="初始文字" value={object.screen.text || ''} onCommit={text => { void patch('屏幕文字', prior => ({ screen: { ...prior.screen, text } })); }} />
      <button className="full-button" onClick={() => { void record('屏幕文字关键帧', { screen: object.screen?.text || '' }); }}><Diamond size={12} />当前帧记录文字</button>
      <SelectField label="媒体素材" value={object.screen.assetId || ''} onChange={assetId => { void patch('屏幕素材', prior => { const { assetId: _assetId, ...rest } = prior.screen!; return { screen: assetId ? { ...rest, assetId } : rest }; }); }}><option value="">使用文字</option>{project.assets.filter(asset => asset.kind === 'image' || asset.kind === 'video').map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</SelectField>
      <SelectField label="挂载部件" value={object.screen.mount ? JSON.stringify([object.screen.mount.objectId, object.screen.mount.partId]) : ''} onChange={value => { void patch('屏幕挂载', prior => { const { mount: _mount, ...rest } = prior.screen!; if (!value) return { screen: rest }; const [objectId, partId] = JSON.parse(value) as [string, string]; return { screen: { ...rest, mount: { objectId, partId } } }; }); }}>
        <option value="">无挂载 · 独立屏幕</option>{project.objects.filter(item => item.kind === 'model' && item.id !== object.id).map(model => { const asset = project.assets.find(item => item.id === model.assetId); return asset?.kind === 'model' ? <optgroup key={model.id} label={model.name}>{asset.parts.filter(part => !model.partIds || model.partIds.includes(part.id)).map(part => <option key={part.id} value={JSON.stringify([model.id, part.id])}>{part.label}</option>)}</optgroup> : null; })}
      </SelectField><p className="field-hint">挂载后跟随部件运动；变换数值用于调整相对部件的偏移。</p>
    </Section>}
    {object.light && <Section title="灯光"><SelectField label="类型" value={object.light.type} onChange={type => { void patch('灯光类型', prior => ({ light: { ...prior.light!, type: type as 'directional' | 'point' } })); }}><option value="directional">平行光</option><option value="point">点光源</option></SelectField><NumberField label="强度" value={object.light.intensity} min={0} step={0.1} onCommit={intensity => { void patch('灯光强度', prior => ({ light: { ...prior.light!, intensity } })); }} /><VectorField label="照射目标" value={object.light.target} onCommit={(axis, value) => { void patch('灯光目标', prior => { const target: V3 = [...prior.light!.target]; target[axis] = value; return { light: { ...prior.light!, target } }; }); }} /></Section>}
    <Section title="管理" defaultOpen={false}><button className="full-button danger-text" onClick={removeObject}><Trash2 size={13} />删除对象</button></Section>
  </fieldset>;
}
