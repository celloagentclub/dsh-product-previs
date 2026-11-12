import { useState } from 'react';
import { Armchair, Box, Camera, ChevronDown, ChevronRight, Eye, EyeOff, FolderInput, Lightbulb, LockKeyhole, Monitor, UnlockKeyhole, UserRound } from 'lucide-react';
import type { PrevisProject, SceneObject } from '../core/types';
import { IconButton } from './controls';

export function ObjectIcon({ kind }: { kind: SceneObject['kind'] }) {
  if (kind === 'actor') return <UserRound size={15} />;
  if (kind === 'screen') return <Monitor size={15} />;
  if (kind === 'light') return <Lightbulb size={15} />;
  return <Box size={15} />;
}
export function SceneTree({ project, selectedId, selectedPartId, busy, onSelect, onSelectPart, onToggle, onAdd, onImport, onShot }: {
  project: PrevisProject; selectedId?: string; selectedPartId?: string; busy: boolean; onSelect: (id: string) => void; onSelectPart: (id: string, partId: string) => void;
  onToggle: (id: string, property: 'visible' | 'locked') => void;
  onAdd: (kind: 'actor' | 'box' | 'screen' | 'light') => void; onImport: () => void; onShot: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return <div className="scene-tree-content">
    <div className="panel-heading"><h2>场景</h2><span className="panel-count">{project.objects.length} 个对象</span><IconButton label="导入产品模型" onClick={onImport}><FolderInput size={15} /></IconButton></div>
    <div className="tree-list" role="tree" aria-label="场景对象">
      {project.objects.length === 0 && <p className="empty-copy">先导入产品模型，或在下方添加人偶与布景。</p>}
      {project.objects.map(object => {
        const asset = project.assets.find(item => item.id === object.assetId);
        const parts = asset?.kind === 'model' ? asset.parts.filter(part => !object.partIds || object.partIds.includes(part.id)) : [];
        return <div className="tree-object-group" key={object.id}><div className={`tree-row ${selectedId === object.id ? 'selected' : ''} ${!object.visible ? 'is-hidden' : ''}`}>
          {parts.length > 0 ? <IconButton className="tree-expand" label={`${expanded[object.id] ? '收起' : '展开'}${object.name}部件`} aria-expanded={Boolean(expanded[object.id])} onClick={() => setExpanded(prior => ({ ...prior, [object.id]: !prior[object.id] }))}>{expanded[object.id] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</IconButton> : <span className="tree-expand-spacer" />}
          <button className={`tree-select kind-${object.kind}`} type="button" role="treeitem" aria-selected={selectedId === object.id && !selectedPartId} onClick={() => onSelect(object.id)}>
            <ObjectIcon kind={object.kind} /><span>{object.name}</span>
          </button>
          <IconButton label={`${object.visible ? '隐藏' : '显示'}${object.name}`} disabled={busy} onClick={() => onToggle(object.id, 'visible')} className={!object.visible ? 'is-set' : ''}>{object.visible ? <Eye size={13} /> : <EyeOff size={13} />}</IconButton>
          <IconButton label={`${object.locked ? '解锁' : '锁定'}${object.name}`} disabled={busy} onClick={() => onToggle(object.id, 'locked')} className={object.locked ? 'is-set' : ''}>{object.locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}</IconButton>
        </div>{expanded[object.id] && parts.length > 0 && <div className="tree-parts" role="group" aria-label={`${object.name}源部件`}>{parts.map(part => <button type="button" key={part.id} role="treeitem" aria-selected={selectedId === object.id && selectedPartId === part.id} className={selectedId === object.id && selectedPartId === part.id ? 'selected' : ''} title={`${part.label} · ${part.id}`} onClick={() => onSelectPart(object.id, part.id)}><span className={`part-role role-${part.role || 'product'}`} /><span>{part.label}</span></button>)}</div>}</div>;
      })}
    </div>
    <div className="add-object-group"><span className="subtle-label">添加对象</span><div className="add-object-buttons">
      <button disabled={busy} onClick={() => onAdd('actor')}><UserRound size={14} />人偶</button>
      <button disabled={busy} onClick={() => onAdd('box')}><Box size={14} />方块</button>
      <button disabled={busy} onClick={() => onAdd('screen')}><Monitor size={14} />屏幕</button>
      <button disabled={busy} onClick={() => onAdd('light')}><Lightbulb size={14} />灯光</button>
    </div></div>
    <details className="tree-shots" open><summary><ChevronDown size={13} />拍摄机位<span>{project.shots.length}</span></summary>
      {project.shots.map((shot, index) => <button key={shot.id} className="tree-shot" onClick={() => onShot(shot.id)}><Camera size={14} /><span>{shot.name}</span><small>{String(index + 1).padStart(2, '0')}</small></button>)}
      {project.shots.length === 0 && <p className="empty-copy">在时间线添加第一个镜头。</p>}
    </details>
    <div className="scene-tree-footnote"><Armchair size={13} /><span>观察场景不改变拍摄机位</span></div>
  </div>;
}
