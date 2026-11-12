import {Group, Matrix4, Mesh, Object3D, Vector3} from 'three';
import type {AssetPart, Mat4, ModelAsset, V3} from '../core/types';

/** Loader userData comes from glTF extras; no second GLB/JSON parser is involved. */
export function sourceNodeIndex(node: Object3D): number | undefined {
  const value: unknown = node.userData._previsIndex;
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

export interface ExtractedPart {id: string; root: Group; source: Object3D}

/**
 * A part root is T(-origin) * originalWorld. Shared geometry/materials stay owned by useGLTF.
 * Per-frame product deltas are added outside this root, so units are never scaled twice.
 */
export function extractModelParts(scene: Object3D, asset: ModelAsset, partIds: string[] | undefined, sourceOrigin: V3 = [0, 0, 0]): ExtractedPart[] {
  scene.updateMatrixWorld(true);
  const indexed = new Map<number, Object3D>();
  scene.traverse(node => {
    const index = sourceNodeIndex(node);
    if (index !== undefined) indexed.set(index, node);
  });
  const parts = new Map(asset.parts.map(p => [p.id, p]));
  const selectedIds = partIds ?? asset.parts.map(p => p.id);
  const semanticIndices = new Set(selectedIds.map(id => parts.get(id)?.nodeIndex));
  return selectedIds.map(id => {
    const part = parts.get(id);
    if (!part) throw new Error(`模型部件不存在：${id}`);
    const source = indexed.get(part.nodeIndex);
    if (!source) throw new Error(`模型 ${asset.name} 缺少源节点 ${part.nodeIndex}（${part.label}）；请重新导入白模`);
    const copy = source.clone(true);
    // Nested semantic groups are separate parts. Never draw their meshes twice.
    const prune = (node: Object3D) => {
      for (const child of [...node.children]) {
        const index = sourceNodeIndex(child);
        if (index !== undefined && semanticIndices.has(index)) node.remove(child);
        else prune(child);
      }
    };
    prune(copy);
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(new Matrix4().makeTranslation(-sourceOrigin[0], -sourceOrigin[1], -sourceOrigin[2]).multiply(source.matrixWorld));
    copy.traverse(node => {if (node instanceof Mesh) {node.castShadow = true; node.receiveShadow = true;}});
    const root = new Group();
    root.name = `part:${id}`;
    root.add(copy);
    return {id, root, source};
  });
}

export function applyPartMatrix(root: Object3D, matrix: ArrayLike<number> | undefined): void {
  root.matrixAutoUpdate = false;
  root.matrix.copy(matrix ? new Matrix4().fromArray(matrix) : new Matrix4());
  root.matrixWorldNeedsUpdate = true;
}

/** Useful for framing and tests: metadata is in original world meters. */
export function partLocalCenter(part: AssetPart, sourceOrigin: V3): V3 {
  return new Vector3(...part.center).sub(new Vector3(...sourceOrigin)).toArray() as V3;
}
