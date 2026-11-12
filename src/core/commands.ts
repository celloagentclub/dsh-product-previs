import type {Command, PrevisProject} from './types';

type Row = Record<string, unknown>;
const fields = {
  project: ['schemaVersion', 'id', 'name', 'revision', 'fps', 'durationFrames', 'width', 'height', 'assets', 'objects', 'shots', 'tracks', 'audio', 'createdAt', 'updatedAt'],
  object: ['id', 'name', 'kind', 'transform', 'visible', 'locked', 'color', 'assetId', 'partIds', 'sourceOrigin', 'joints', 'explodeDirections', 'actor', 'screen', 'light'],
  shot: ['id', 'name', 'start', 'end', 'description', 'camera'],
  track: ['id', 'objectId', 'property', 'keys'],
  joint: ['id', 'label', 'parentId', 'pivot', 'axis', 'minDeg', 'maxDeg', 'restAngle', 'affects'],
  pose: ['position', 'target', 'focalLength', 'focusDistance', 'aperture', 'roll'],
};
const poses = ['standing', 'sitting', 'walking'];
const gestures = ['neutral', 'reach', 'raise', 'type'];
const easings = ['linear', 'smooth', 'ease-in', 'ease-out'];
const kinds = ['model', 'actor', 'box', 'plane', 'screen', 'light'];
const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const validId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,127}$/.test(v) && !['__proto__', 'prototype', 'constructor'].includes(v);

/** Strict document validation. Empty shot lists are allowed while authoring, never by evaluate/export. */
export function validateProject(project: PrevisProject): string[] {
  try {return validateDocument(project);}
  catch (error) {return [`project: 项目结构无效（${error instanceof Error ? error.message : String(error)}）`];}
}

function validateDocument(project: PrevisProject): string[] {
  const errors: string[] = [];
  const err = (path: string, message: string) => errors.push(`${path}: ${message}`);
  const row = (v: unknown, path: string, allowed: string[]): v is Row => {
    if (!isRow(v)) { err(path, '必须是普通对象'); return false; }
    for (const key of Object.keys(v)) if (!allowed.includes(key)) err(`${path}.${key}`, '未知字段');
    return true;
  };
  const number = (v: unknown, path: string, min = -1e9, max = 1e9, integer = false): v is number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) { err(path, `必须是${integer ? '整数' : '有限数值'}（${min}…${max}）`); return false; }
    return true;
  };
  const text = (v: unknown, path: string, max = 10000): v is string => {
    if (typeof v !== 'string' || v.length > max || v.includes('\0')) { err(path, `必须是长度不超过 ${max} 的文字`); return false; } return true;
  };
  const choice = (v: unknown, path: string, values: string[]) => { if (typeof v !== 'string' || !values.includes(v)) err(path, `仅支持 ${values.join(' / ')}`); };
  const vector = (v: unknown, path: string, positive = false): v is number[] => {
    if (!Array.isArray(v) || v.length !== 3) {err(path, '必须是三元向量'); return false;}
    return v.map((n, i) => number(n, `${path}[${i}]`, positive ? 1e-6 : -1e9, 1e9)).every(Boolean);
  };
  const boolean = (v: unknown, path: string) => {if (typeof v !== 'boolean') err(path, '必须是布尔值');};
  const list = (v: unknown, path: string): v is unknown[] => {if (!Array.isArray(v)) {err(path, '必须是数组'); return false;} return true;};
  const id = (v: unknown, path: string) => {if (!validId(v)) err(path, 'ID 无效（仅字母、数字、下划线、点、冒号和短横线）');};
  const globalIds = new Set<string>();
  const register = (v: unknown, path: string, seen = globalIds) => {
    id(v, path);
    if (typeof v === 'string') {if (seen.has(v)) err(path, `ID 重复：${v}`); seen.add(v);}
  };
  const bounds = (v: unknown, path: string) => {
    if (!row(v, path, ['min', 'max'])) return;
    if (vector(v.min, `${path}.min`) && vector(v.max, `${path}.max`) && v.min.some((n, i) => n > (v.max as number[])[i])) err(path, 'min 不能大于 max');
  };
  const file = (v: unknown, path: string) => {
    if (!text(v, path, 1024)) return;
    if (!v || v.startsWith('/') || /^[A-Za-z]:/.test(v) || v.includes('\\') || v.split('/').some(s => s === '..' || s === '.') || /^[a-z]+:/i.test(v)) err(path, '必须是项目内的相对资源路径');
  };
  const cameraPose = (v: unknown, path: string) => {
    if (!row(v, path, fields.pose)) return;
    vector(v.position, `${path}.position`); vector(v.target, `${path}.target`);
    if (Array.isArray(v.position) && Array.isArray(v.target) && v.position.length === 3 && v.target.length === 3 && v.position.every((n, i) => n === (v.target as unknown[])[i])) err(path, '相机位置不能与注视目标重合');
    number(v.focalLength, `${path}.focalLength`, 1, 2000); number(v.focusDistance, `${path}.focusDistance`, 0.0001, 1e9); number(v.aperture, `${path}.aperture`, 0.1, 256);
    if (v.roll !== undefined) number(v.roll, `${path}.roll`, -36000, 36000);
  };
  if (!row(project, 'project', fields.project)) return errors;
  if (project.schemaVersion !== 2) err('schemaVersion', '仅支持版本 2');
  id(project.id, 'id'); text(project.name, 'name', 500);
  number(project.revision, 'revision', 0, Number.MAX_SAFE_INTEGER, true);
  number(project.fps, 'fps', 1, 240, true); number(project.durationFrames, 'durationFrames', 1, 10_000_000, true);
  number(project.width, 'width', 16, 8192, true); number(project.height, 'height', 16, 8192, true);
  for (const field of ['createdAt', 'updatedAt'] as const) if (!text(project[field], field, 100) || !Number.isFinite(Date.parse(project[field]))) err(field, '必须是有效日期文字');
  const endFrame = Math.max(0, project.durationFrames - 1);
  const assets = Array.isArray(project.assets) ? project.assets : [];
  if (list(project.assets, 'assets')) project.assets.forEach((asset, i) => {
    const p = `assets[${i}]`;
    if (!isRow(asset)) {err(p, '必须是普通对象'); return;}
    if (asset.kind === 'model') {
      if (!row(asset, p, ['id', 'name', 'kind', 'file', 'sourceName', 'hash', 'originalBytes', 'previewBytes', 'triangles', 'bounds', 'parts'])) return;
      text(asset.sourceName, `${p}.sourceName`, 1024); text(asset.hash, `${p}.hash`, 200);
      for (const key of ['originalBytes', 'previewBytes', 'triangles']) number(asset[key], `${p}.${key}`, 0, Number.MAX_SAFE_INTEGER, true);
      bounds(asset.bounds, `${p}.bounds`);
      const partIds = new Set<string>(), indices = new Set<number>();
      if (list(asset.parts, `${p}.parts`)) asset.parts.forEach((part, k) => {
        const q = `${p}.parts[${k}]`;
        if (!row(part, q, ['id', 'label', 'nodeIndex', 'bounds', 'center', 'role'])) return;
        register(part.id, `${q}.id`, partIds); text(part.label, `${q}.label`, 500);
        if (number(part.nodeIndex, `${q}.nodeIndex`, 0, 10_000_000, true)) {if (indices.has(part.nodeIndex)) err(`${q}.nodeIndex`, '同一节点不能声明两次'); indices.add(part.nodeIndex);}
        bounds(part.bounds, `${q}.bounds`); vector(part.center, `${q}.center`);
        if (part.role !== undefined) choice(part.role, `${q}.role`, ['product', 'set', 'screen', 'computer']);
      });
    } else {
      row(asset, p, ['id', 'name', 'kind', 'file', 'hash']);
      choice(asset.kind, `${p}.kind`, ['image', 'video', 'audio']);
      if (asset.hash !== undefined) text(asset.hash, `${p}.hash`, 200);
    }
    register(asset.id, `${p}.id`); text(asset.name, `${p}.name`, 500); file(asset.file, `${p}.file`);
  });
  const objects = Array.isArray(project.objects) ? project.objects : [];
  if (list(project.objects, 'objects')) project.objects.forEach((object, i) => {
    const p = `objects[${i}]`;
    if (!row(object, p, fields.object)) return;
    register(object.id, `${p}.id`); text(object.name, `${p}.name`, 500); choice(object.kind, `${p}.kind`, kinds); boolean(object.visible, `${p}.visible`);
    if (object.locked !== undefined) boolean(object.locked, `${p}.locked`);
    if (object.color !== undefined && (typeof object.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(object.color))) err(`${p}.color`, '必须是 #RRGGBB 色值');
    if (row(object.transform, `${p}.transform`, ['position', 'rotation', 'scale'])) {vector(object.transform.position, `${p}.transform.position`); vector(object.transform.rotation, `${p}.transform.rotation`); vector(object.transform.scale, `${p}.transform.scale`, true);}
    const asset = assets.find(a => a.id === object.assetId);
    if (object.assetId !== undefined) {id(object.assetId, `${p}.assetId`); if (!asset) err(`${p}.assetId`, '资源不存在');}
    if (object.kind === 'model' && asset?.kind !== 'model') err(`${p}.assetId`, '模型对象必须引用模型资源');
    const available = new Set(asset?.kind === 'model' ? asset.parts?.map(part => part.id) : []);
    if (object.partIds !== undefined && list(object.partIds, `${p}.partIds`)) {
      const selected = new Set<string>();
      for (const partId of object.partIds) {register(partId, `${p}.partIds`, selected); if (!available.has(partId)) err(`${p}.partIds`, `源部件不存在：${partId}`);}
      if (object.partIds.length === 0 && object.kind === 'model') err(`${p}.partIds`, '模型对象至少选择一个部件');
    }
    if (object.sourceOrigin !== undefined) vector(object.sourceOrigin, `${p}.sourceOrigin`);
    const selected = new Set(object.partIds ?? available);
    if (object.explodeDirections !== undefined) {
      if (!isRow(object.explodeDirections)) err(`${p}.explodeDirections`, '必须是部件 ID 到向量的对象');
      else for (const [partId, direction] of Object.entries(object.explodeDirections)) {if (!selected.has(partId)) err(`${p}.explodeDirections.${partId}`, '不是本对象的部件'); vector(direction, `${p}.explodeDirections.${partId}`);}
    }
    if (object.joints !== undefined && list(object.joints, `${p}.joints`)) {
      const jointIds = new Set<string>();
      object.joints.forEach((joint, j) => {
        const q = `${p}.joints[${j}]`;
        if (!row(joint, q, fields.joint)) return;
        register(joint.id, `${q}.id`, jointIds); text(joint.label, `${q}.label`, 500); vector(joint.pivot, `${q}.pivot`);
        if (vector(joint.axis, `${q}.axis`) && Math.hypot(...joint.axis) < 1e-8) err(`${q}.axis`, '旋转轴不能为零');
        number(joint.minDeg, `${q}.minDeg`, -36000, 36000); number(joint.maxDeg, `${q}.maxDeg`, -36000, 36000); number(joint.restAngle, `${q}.restAngle`, -36000, 36000);
        if (joint.minDeg > joint.maxDeg || joint.restAngle < joint.minDeg || joint.restAngle > joint.maxDeg) err(q, '关节限位或初始角度无效');
        if (joint.parentId !== undefined) id(joint.parentId, `${q}.parentId`);
        if (list(joint.affects, `${q}.affects`)) {
          const unique = new Set<string>();
          for (const partId of joint.affects) {register(partId, `${q}.affects`, unique); if (!selected.has(partId)) err(`${q}.affects`, `影响的部件不属于本对象：${partId}`);}
          if (!joint.affects.length) err(`${q}.affects`, '至少指定一个受影响部件');
        }
      });
      const byId = new Map(object.joints.filter(isRow).map(j => [j.id, j]));
      for (const joint of object.joints.filter(isRow)) {
        if (joint.parentId && !byId.has(joint.parentId)) err(`${p}.joints.${joint.id}.parentId`, '父关节不存在');
        const chain = new Set<string>();
        let current = joint;
        while (current) {
          if (chain.has(current.id)) {err(`${p}.joints`, `父级成环：${current.id}`); break;}
          chain.add(current.id);
          current = byId.get(current.parentId!)!;
        }
      }
    }
    if (object.actor !== undefined && row(object.actor, `${p}.actor`, ['height', 'pose', 'gesture', 'target'])) {
      number(object.actor.height, `${p}.actor.height`, 0.2, 10); choice(object.actor.pose, `${p}.actor.pose`, poses); choice(object.actor.gesture, `${p}.actor.gesture`, gestures);
      if (object.actor.target !== undefined) vector(object.actor.target, `${p}.actor.target`);
    }
    if (object.kind === 'actor' && !object.actor) err(`${p}.actor`, '人物需要身高、姿态和手势');
    if (object.screen !== undefined && row(object.screen, `${p}.screen`, ['assetId', 'text', 'mount'])) {
      if (object.screen.text !== undefined) text(object.screen.text, `${p}.screen.text`);
      if (object.screen.assetId !== undefined) {const media = assets.find(a => a.id === object.screen!.assetId); if (!media || !['image', 'video'].includes(media.kind)) err(`${p}.screen.assetId`, '屏幕需要图片或视频资源');}
      if (object.screen.mount !== undefined && row(object.screen.mount, `${p}.screen.mount`, ['objectId', 'partId'])) {
        id(object.screen.mount.objectId, `${p}.screen.mount.objectId`);
        id(object.screen.mount.partId, `${p}.screen.mount.partId`);
        if (object.screen.mount.objectId === object.id) err(`${p}.screen.mount`, '屏幕不能挂载到自身');
        const parent = objects.find(item => item.id === object.screen!.mount!.objectId);
        const parentAsset = assets.find(item => item.id === parent?.assetId);
        if (!parent) err(`${p}.screen.mount.objectId`, '挂载对象不存在');
        else if (parent.kind !== 'model' || parentAsset?.kind !== 'model') err(`${p}.screen.mount.objectId`, '挂载目标必须是模型对象');
        else if (!(parent.partIds ?? parentAsset.parts.map(part => part.id)).includes(object.screen.mount.partId)) err(`${p}.screen.mount.partId`, '挂载部件不属于目标模型对象');
      }
    }
    if (object.light !== undefined && row(object.light, `${p}.light`, ['type', 'intensity', 'target', 'color'])) {
      choice(object.light.type, `${p}.light.type`, ['directional', 'point']); number(object.light.intensity, `${p}.light.intensity`, 0, 100000); vector(object.light.target, `${p}.light.target`);
      if (typeof object.light.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(object.light.color)) err(`${p}.light.color`, '必须是 #RRGGBB 色值');
    }
    if (object.kind === 'light' && !object.light) err(`${p}.light`, '灯光配置缺失');
  });
  // A model may itself carry a mounted screen, so validate mount graph cycles globally.
  const mountState = new Map<string, 0 | 1 | 2>();
  const mountPath: string[] = [];
  const visitMount = (object: typeof objects[number]) => {
    const state = mountState.get(object.id) ?? 0;
    if (state === 2) return;
    if (state === 1) {err(`objects.${object.id}.screen.mount`, `挂载关系成环：${[...mountPath, object.id].join(' → ')}`); return;}
    mountState.set(object.id, 1); mountPath.push(object.id);
    const next = object.screen?.mount?.objectId ? objects.find(candidate => candidate.id === object.screen!.mount!.objectId) : undefined;
    if (next) visitMount(next);
    mountPath.pop(); mountState.set(object.id, 2);
  };
  objects.forEach(visitMount);
  if (list(project.shots, 'shots')) {
    project.shots.forEach((shot, i) => {
      const p = `shots[${i}]`;
      if (!row(shot, p, fields.shot)) return;
      register(shot.id, `${p}.id`); text(shot.name, `${p}.name`, 500); text(shot.description, `${p}.description`);
      number(shot.start, `${p}.start`, 0, endFrame, true); number(shot.end, `${p}.end`, 1, project.durationFrames, true);
      if (shot.start >= shot.end) err(p, '镜头必须满足 start < end（左闭右开）');
      if (row(shot.camera, `${p}.camera`, ['from', 'to', 'move', 'easing', 'orbitDegrees', 'points', 'targetBinding'])) {
        cameraPose(shot.camera.from, `${p}.camera.from`); cameraPose(shot.camera.to, `${p}.camera.to`);
        choice(shot.camera.move, `${p}.camera.move`, ['static', 'linear', 'orbit', 'spline']); choice(shot.camera.easing, `${p}.camera.easing`, easings);
        if (shot.camera.orbitDegrees !== undefined) number(shot.camera.orbitDegrees, `${p}.camera.orbitDegrees`, -36000, 36000);
        if (shot.camera.points !== undefined && list(shot.camera.points, `${p}.camera.points`)) {if (shot.camera.points.length > 1000) err(`${p}.camera.points`, '路径点过多'); shot.camera.points.forEach((v, j) => vector(v, `${p}.camera.points[${j}]`));}
        const binding = shot.camera.targetBinding;
        if (binding !== undefined && row(binding, `${p}.camera.targetBinding`, ['objectId', 'partId', 'offset', 'followPosition'])) {
          id(binding.objectId, `${p}.camera.targetBinding.objectId`);
          const target = objects.find(object => object.id === binding.objectId);
          if (!target) err(`${p}.camera.targetBinding.objectId`, '注视对象不存在');
          if (binding.partId !== undefined) {
            id(binding.partId, `${p}.camera.targetBinding.partId`);
            const targetAsset = assets.find(asset => asset.id === target?.assetId);
            if (target?.kind !== 'model' || targetAsset?.kind !== 'model' || !(target.partIds ?? targetAsset.parts.map(part => part.id)).includes(binding.partId)) err(`${p}.camera.targetBinding.partId`, '注视部件不属于目标对象');
          }
          if (binding.offset !== undefined) vector(binding.offset, `${p}.camera.targetBinding.offset`);
          if (binding.followPosition !== undefined) boolean(binding.followPosition, `${p}.camera.targetBinding.followPosition`);
        }
      }
    });
    const sorted = [...project.shots].filter(isRow).sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) err('shots', `镜头时间重叠：${sorted[i - 1].id} / ${sorted[i].id}`);
  }
  if (list(project.tracks, 'tracks')) {
    const properties = new Set<string>();
    project.tracks.forEach((track, i) => {
      const p = `tracks[${i}]`;
      if (!row(track, p, fields.track)) return;
      register(track.id, `${p}.id`); id(track.objectId, `${p}.objectId`);
      const object = objects.find(o => o.id === track.objectId);
      if (!object) err(`${p}.objectId`, '对象不存在');
      const property = track.property;
      if (typeof property !== 'string' || (!['position', 'rotation', 'scale', 'pose', 'gesture', 'explode', 'visible', 'screen'].includes(property) && !property.startsWith('joint:'))) err(`${p}.property`, '未知轨道属性');
      if (property?.startsWith('joint:') && !object?.joints?.some(j => j.id === property.slice(6))) err(`${p}.property`, '关节不存在');
      if (['pose', 'gesture'].includes(property) && object?.kind !== 'actor') err(`${p}.property`, '姿态轨道只能作用于人物');
      if (property === 'screen' && object?.kind !== 'screen') err(`${p}.property`, '屏幕轨道只能作用于屏幕');
      const propertyId = `${track.objectId}/${property}`;
      if (properties.has(propertyId)) err(p, '同一对象的同一属性只能有一条轨道'); properties.add(propertyId);
      if (list(track.keys, `${p}.keys`)) {
        const keyFrames = new Set<number>();
        if (!track.keys.length) err(`${p}.keys`, '轨道至少需要一个关键帧');
        track.keys.forEach((key, j) => {
          const q = `${p}.keys[${j}]`;
          if (!row(key, q, ['frame', 'value', 'easing'])) return;
          number(key.frame, `${q}.frame`, 0, endFrame, true);
          if (keyFrames.has(key.frame)) err(`${q}.frame`, '关键帧重复'); keyFrames.add(key.frame);
          if (key.easing !== undefined) choice(key.easing, `${q}.easing`, easings);
          if (['position', 'rotation', 'scale'].includes(property)) vector(key.value, `${q}.value`, property === 'scale');
          else if (property === 'pose') choice(key.value, `${q}.value`, poses);
          else if (property === 'gesture') choice(key.value, `${q}.value`, gestures);
          else if (property === 'screen') text(key.value, `${q}.value`);
          else if (property === 'visible') {if (![0, 1, 'true', 'false'].includes(key.value as string | number)) err(`${q}.value`, '可见性使用 0 / 1 或 true / false 文字');}
          else number(key.value, `${q}.value`, property === 'explode' ? 0 : -36000, property === 'explode' ? 10000 : 36000);
        });
      }
    });
  }
  if (project.audio !== undefined && row(project.audio, 'audio', ['assetId', 'startFrame', 'trimStart', 'gain', 'fadeIn', 'fadeOut'])) {
    if (!assets.some(a => a.id === project.audio!.assetId && a.kind === 'audio')) err('audio.assetId', '音频资源不存在');
    number(project.audio.startFrame, 'audio.startFrame', 0, endFrame, true); number(project.audio.trimStart, 'audio.trimStart', 0, 86400); number(project.audio.gain, 'audio.gain', 0, 10);
    // Fades are seconds of the finished edit; they may not overlap past the film.
    if (project.audio.fadeIn !== undefined) number(project.audio.fadeIn, 'audio.fadeIn', 0, 60);
    if (project.audio.fadeOut !== undefined) number(project.audio.fadeOut, 'audio.fadeOut', 0, 60);
    const fadeIn = project.audio.fadeIn ?? 0, fadeOut = project.audio.fadeOut ?? 0;
    if (fadeIn + fadeOut > project.durationFrames / project.fps) err('audio', '淡入淡出总时长超过影片时长');
  }
  return errors;
}

function assertFields(value: unknown, allowed: string[], context: string): asserts value is Row {
  if (!isRow(value)) throw new Error(`${context}: 必须是普通对象`);
  const unknown = Object.keys(value).filter(k => !allowed.includes(k));
  if (unknown.length) throw new Error(`${context}: 未知或禁止的字段 ${unknown.join(', ')}`);
}

/** Atomic, clone-first edit application. Revision and timestamps are owned by the persistence host. */
export function applyCommands(project: PrevisProject, commands: Command[]): PrevisProject {
  if (!Array.isArray(commands) || commands.length > 10000) throw new Error('commands 必须是数组，且不超过 10000 条');
  const result = structuredClone(project);
  const existing = <T extends {id: string}>(items: T[], id: string, kind: string) => {
    const item = items.find(x => x.id === id);
    if (!item) throw new Error(`${kind}不存在：${id}`);
    return item;
  };
  for (const command of commands) {
    if (!isRow(command)) throw new Error('命令必须是普通对象');
    const clone = <T>(v: T): T => structuredClone(v);
    switch (command.type) {
      case 'project.update':
        assertFields(command, ['type', 'patch'], command.type);
        assertFields(command.patch, ['name', 'durationFrames', 'width', 'height'], command.type);
        Object.assign(result, clone(command.patch)); break;
      case 'object.add':
        assertFields(command, ['type', 'object'], command.type);
        result.objects.push(clone(command.object)); break;
      case 'object.update': {
        assertFields(command, ['type', 'id', 'patch'], command.type);
        assertFields(command.patch, fields.object.filter(k => k !== 'id' && k !== 'kind'), command.type);
        Object.assign(existing(result.objects, command.id, '对象'), clone(command.patch)); break;
      }
      case 'object.remove':
        assertFields(command, ['type', 'id'], command.type);
        existing(result.objects, command.id, '对象');
        result.objects = result.objects.filter(o => o.id !== command.id);
        result.tracks = result.tracks.filter(t => t.objectId !== command.id); break;
      case 'shot.add':
        assertFields(command, ['type', 'shot'], command.type);
        result.shots.push(clone(command.shot)); break;
      case 'shot.update':
        assertFields(command, ['type', 'id', 'patch'], command.type);
        assertFields(command.patch, fields.shot.filter(k => k !== 'id'), command.type);
        Object.assign(existing(result.shots, command.id, '镜头'), clone(command.patch)); break;
      case 'shot.remove':
        assertFields(command, ['type', 'id'], command.type);
        existing(result.shots, command.id, '镜头'); result.shots = result.shots.filter(s => s.id !== command.id); break;
      case 'track.set': {
        assertFields(command, ['type', 'track'], command.type);
        const index = result.tracks.findIndex(t => t.id === command.track.id);
        if (index < 0) result.tracks.push(clone(command.track)); else result.tracks[index] = clone(command.track);
        break;
      }
      case 'track.remove':
        assertFields(command, ['type', 'id'], command.type);
        existing(result.tracks, command.id, '轨道'); result.tracks = result.tracks.filter(t => t.id !== command.id); break;
      case 'keyframe.set': {
        assertFields(command, ['type', 'trackId', 'key'], command.type);
        const track = existing(result.tracks, command.trackId, '轨道');
        const index = track.keys.findIndex(k => k.frame === command.key.frame);
        if (index < 0) track.keys.push(clone(command.key)); else track.keys[index] = clone(command.key);
        track.keys.sort((a, b) => a.frame - b.frame); break;
      }
      case 'rig.set':
        assertFields(command, ['type', 'objectId', 'joints'], command.type);
        existing(result.objects, command.objectId, '对象').joints = clone(command.joints); break;
      case 'asset.add':
        assertFields(command, ['type', 'asset'], command.type);
        result.assets.push(clone(command.asset)); break;
      default: throw new Error(`未知命令：${String((command as Row).type)}`);
    }
  }
  const errors = validateProject(result);
  if (errors.length) throw new Error(`项目修改无效：\n${errors.join('\n')}`);
  return result;
}
