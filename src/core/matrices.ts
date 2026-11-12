import {Euler, MathUtils, Matrix4, Quaternion, Vector3} from 'three';
import type {EvaluatedFrame, PrevisProject, SceneObject, Transform} from './types';

export function transformMatrix(transform: Transform): Matrix4 {
  return new Matrix4().compose(new Vector3(...transform.position), new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(transform.rotation[0]), MathUtils.degToRad(transform.rotation[1]), MathUtils.degToRad(transform.rotation[2]), 'XYZ')), new Vector3(...transform.scale));
}

/**
 * A screen is placed in world coordinates at authoring time. Mounting applies only its parent's
 * delta: parentWorld(now) * partDelta(rest-local) * inverse(parentWorld(authored)).
 * Its own transform remains editable, and the content follows the exact same part matrix as the GLB.
 */
export function screenMountMatrix(project: PrevisProject, frame: EvaluatedFrame, object: SceneObject, visiting = new Set<string>()): Matrix4 {
  const mount = object.screen?.mount;
  if (!mount) return new Matrix4();
  if (visiting.has(object.id)) throw new Error(`屏幕挂载关系成环：${object.id}`);
  visiting.add(object.id);
  const parent = project.objects.find(candidate => candidate.id === mount.objectId);
  const parentState = frame.objects[mount.objectId];
  if (!parent || !parentState) throw new Error(`屏幕挂载对象不存在：${mount.objectId}`);
  const part = parentState.partMatrices[mount.partId];
  if (!part) throw new Error(`屏幕挂载部件不存在：${mount.partId}`);
  const matrix = screenMountMatrix(project, frame, parent, visiting)
    .multiply(transformMatrix(parentState.transform))
    .multiply(new Matrix4().fromArray(part))
    .multiply(transformMatrix(parent.transform).invert());
  visiting.delete(object.id);
  return matrix;
}
