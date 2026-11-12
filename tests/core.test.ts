import {describe, expect, it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Box3, BoxGeometry, Euler, Group, MathUtils, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Vector3} from 'three';
import {applyCommands, validateProject} from '../src/core/commands';
import {evaluateProject} from '../src/core/evaluate';
import {screenMountMatrix, transformMatrix} from '../src/core/matrices';
import {identityTransform} from '../src/core/types';
import type {Command, ModelAsset, PrevisProject, Shot, Track, V3} from '../src/core/types';
import {evaluateActorSkeleton} from '../src/stage/actorRig';
import {applyPartMatrix, extractModelParts} from '../src/stage/modelParts';
import {applyCameraPose} from '../src/stage/camera';

const pose = (position: V3 = [0, 1, 4]) => ({position, target: [0, 1, 0] as V3, focalLength: 40, focusDistance: 4, aperture: 8});
const shot = (id = 'shot', start = 0, end = 101): Shot => ({id, name: id, start, end, description: '', camera: {from: pose(), to: pose([4, 1, 0]), move: 'linear', easing: 'linear'}});
const asset = (): ModelAsset => ({id: 'asset', name: 'unit fixture', kind: 'model', file: 'assets/fixture.glb', sourceName: 'fixture.glb', hash: 'fixture', originalBytes: 1000, previewBytes: 800, triangles: 12, bounds: {min: [10, 0, 0], max: [12, 1, 1]}, parts: [
  {id: 'base', label: 'base', nodeIndex: 0, bounds: {min: [10, 0, 0], max: [11, 1, 1]}, center: [10.5, 0.5, 0.5]},
  {id: 'tip', label: 'tip', nodeIndex: 1, bounds: {min: [11, 0, 0], max: [12, 1, 1]}, center: [11.5, 0.5, 0.5]},
]});
function project(): PrevisProject {
  return {schemaVersion: 2, id: 'project', name: 'test', revision: 3, fps: 25, durationFrames: 101, width: 1920, height: 1080, assets: [asset()], objects: [
    {id: 'product', name: 'product', kind: 'model', assetId: 'asset', partIds: ['base', 'tip'], sourceOrigin: [10, 0, 0], transform: {...identityTransform(), position: [10, 0, 0]}, visible: true, joints: [
      {id: 'child', label: 'child', parentId: 'parent', pivot: [1, 0, 0], axis: [0, 0, 1], minDeg: -90, maxDeg: 90, restAngle: 0, affects: ['tip']},
      {id: 'parent', label: 'parent', pivot: [0, 0, 0], axis: [0, 0, 1], minDeg: -90, maxDeg: 90, restAngle: 0, affects: ['base', 'tip']},
    ], explodeDirections: {tip: [0.5, 1, 0]}},
    {id: 'actor', name: 'actor', kind: 'actor', transform: identityTransform(), visible: true, actor: {height: 1.75, pose: 'standing', gesture: 'neutral'}},
  ], shots: [shot()], tracks: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'};
}
const track = (property: Track['property'], keys: Track['keys'], objectId = 'product', id = `track-${property}`): Track => ({id, objectId, property, keys});
const nearVector = (actual: ArrayLike<number>, expected: V3) => expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 7));
const transformed = (array: number[], point: V3): V3 => new Vector3(...point).applyMatrix4(new Matrix4().fromArray(array)).toArray() as V3;

// These tests target observable motion, ordering and invalid edits, rather than duplicating implementation details.
describe('absolute frame evaluation', () => {
  it('repeats exactly and supports backseeking without changing the input', () => {
    const p = project();
    p.tracks = [track('position', [{frame: 10, value: [1, 2, 3]}, {frame: 80, value: [8, 9, 10], easing: 'smooth'}])];
    const before = structuredClone(p), expected = evaluateProject(p, 36);
    for (const f of [100, 0, 59, 12, 36]) evaluateProject(p, f);
    expect(evaluateProject(p, 36)).toEqual(expected); expect(p).toEqual(before);
    nearVector(evaluateProject(p, 0).objects.product.transform.position, [1, 2, 3]);
    nearVector(evaluateProject(p, 100).objects.product.transform.position, [8, 9, 10]);
  });
  it('interpolates position and scale at absolute project frames', () => {
    const p = project();
    p.tracks = [track('position', [{frame: 20, value: [0, 0, 0]}, {frame: 60, value: [4, 8, 12]}]), track('scale', [{frame: 20, value: [1, 1, 1]}, {frame: 60, value: [3, 5, 7]}])];
    const object = evaluateProject(p, 40).objects.product;
    nearVector(object.transform.position, [2, 4, 6]); nearVector(object.transform.scale, [2, 3, 4]);
  });
  it('slerps authored Euler rotations through the short quaternion arc', () => {
    const p = project(); p.tracks = [track('rotation', [{frame: 0, value: [0, 0, 350]}, {frame: 100, value: [0, 0, 10]}])];
    const rotation = evaluateProject(p, 50).objects.product.transform.rotation;
    const orientation = new Quaternion().setFromEuler(new Euler(...rotation.map(MathUtils.degToRad) as V3));
    nearVector(new Vector3(1, 0, 0).applyQuaternion(orientation).toArray(), [1, 0, 0]);
  });
  it('uses left-closed/right-open shots and holds the last displayed camera endpoint', () => {
    const p = project(); p.shots = [shot('one', 0, 50), shot('two', 50, 101)]; p.shots[1].camera.from.position = [10, 1, 4];
    expect(evaluateProject(p, 49).shotId).toBe('one');
    nearVector(evaluateProject(p, 49).camera.position, p.shots[0].camera.to.position);
    expect(evaluateProject(p, 50).shotId).toBe('two');
    nearVector(evaluateProject(p, 50).camera.position, [10, 1, 4]);
    nearVector(evaluateProject(p, 999).camera.position, p.shots[1].camera.to.position);
  });
  it('holds a preceding camera across a shot gap', () => {
    const p = project(); p.shots = [shot('one', 10, 30), shot('two', 60, 101)];
    nearVector(evaluateProject(p, 0).camera.position, p.shots[0].camera.from.position);
    nearVector(evaluateProject(p, 45).camera.position, p.shots[0].camera.to.position);
  });
  it('requires a shot and rejects nonfinite frame input explicitly', () => {
    const p = project(); p.shots = [];
    expect(validateProject(p)).toEqual([]); expect(() => evaluateProject(p, 0)).toThrow('没有镜头');
    expect(() => evaluateProject(project(), NaN)).toThrow('有限');
  });
  it('holds visibility and text as discrete values, blends poses and gestures', () => {
    const p = project(); p.tracks = [track('pose', [{frame: 0, value: 'standing'}, {frame: 100, value: 'sitting'}], 'actor'), track('gesture', [{frame: 0, value: 'neutral'}, {frame: 100, value: 'reach'}], 'actor'), track('visible', [{frame: 0, value: 1}, {frame: 100, value: 0}])];
    const mid = evaluateProject(p, 50);
    expect(mid.objects.actor.pose).toEqual({from: 'standing', to: 'sitting', mix: 0.5});
    expect(mid.objects.actor.gesture.mix).toBe(0.5); expect(evaluateProject(p, 99).objects.product.visible).toBe(true); expect(evaluateProject(p, 100).objects.product.visible).toBe(false);
  });
});

describe('cameras', () => {
  it('interpolates physical lens, focus, aperture and targets, while static holds from', () => {
    const p = project(); const camera = p.shots[0].camera;
    camera.to = {...pose([4, 2, 0]), target: [2, 2, 0], focalLength: 80, focusDistance: 2, aperture: 4};
    const mid = evaluateProject(p, 50).camera;
    nearVector(mid.position, [2, 1.5, 2]); nearVector(mid.target, [1, 1.5, 0]);
    expect(mid.focalLength).toBe(60); expect(mid.focusDistance).toBe(3); expect(mid.aperture).toBe(6);
    camera.move = 'static'; nearVector(evaluateProject(p, 100).camera.position, camera.from.position);
  });
  it('orbits around the target in meters without changing radius', () => {
    const p = project(); p.shots[0].camera.move = 'orbit'; p.shots[0].camera.orbitDegrees = 90;
    nearVector(evaluateProject(p, 50).camera.position, [Math.sqrt(8), 1, Math.sqrt(8)]);
    nearVector(evaluateProject(p, 100).camera.position, [4, 1, 0]);
  });
  it('evaluates spline endpoints and a finite curved interior', () => {
    const p = project(); p.shots[0].camera.move = 'spline'; p.shots[0].camera.points = [[2, 3, 4], [4, 3, 2]];
    nearVector(evaluateProject(p, 0).camera.position, [0, 1, 4]); nearVector(evaluateProject(p, 100).camera.position, [4, 1, 0]);
    const interior = evaluateProject(p, 50).camera.position; expect(interior.every(Number.isFinite)).toBe(true); expect(interior[1]).toBeGreaterThan(3);
  });
  it('keeps looking at an animated part center and optionally translates with its world displacement', () => {
    const p = project(); const camera = p.shots[0].camera;
    camera.move = 'static'; camera.from = pose([10, 0, 4]); camera.targetBinding = {objectId: 'product', partId: 'tip'};
    p.tracks = [track('joint:parent', [{frame: 0, value: 0}, {frame: 100, value: 90}])];
    nearVector(evaluateProject(p, 0).camera.target, [11.5, 0.5, 0.5]);
    nearVector(evaluateProject(p, 100).camera.target, [9.5, 1.5, 0.5]);
    nearVector(evaluateProject(p, 100).camera.position, [10, 0, 4]);
    camera.targetBinding.followPosition = true;
    nearVector(evaluateProject(p, 100).camera.position, [8, 1, 4]);
    const forward = evaluateProject(p, 43); evaluateProject(p, 100); expect(evaluateProject(p, 43)).toEqual(forward);
  });
  it('uses target-local offsets and checks target object and part references', () => {
    const p = project(); p.shots[0].camera.targetBinding = {objectId: 'actor', offset: [0, 1, 0]};
    p.objects[1].transform.position = [3, 0, 0];
    nearVector(evaluateProject(p, 10).camera.target, [3, 1.875, 0]); expect(validateProject(p)).toEqual([]);
    p.shots[0].camera.targetBinding.partId = 'missing'; expect(validateProject(p).join()).toContain('注视部件');
    p.shots[0].camera.targetBinding.objectId = 'missing'; expect(validateProject(p).join()).toContain('注视对象');
  });
  it('applies a 36mm film gauge with exact focal length, target and roll', () => {
    const camera = new PerspectiveCamera(); const p = pose([2, 2, 3]);
    applyCameraPose(camera, {...p, roll: 10}, 16 / 9);
    expect(camera.filmGauge).toBe(36); expect(camera.getFocalLength()).toBeCloseTo(40); expect(camera.focus).toBe(4);
    const direction = camera.getWorldDirection(new Vector3());
    nearVector(direction.toArray(), new Vector3(...p.target).sub(new Vector3(...p.position)).normalize().toArray() as V3);
    const first = camera.quaternion.clone(); applyCameraPose(camera, {...p, roll: 10}, 16 / 9); expect(first.angleTo(camera.quaternion)).toBeCloseTo(0);
  });
});

describe('product joints, explosion and mount matrices', () => {
  it('orders parents before children regardless of authored array order, without double applying ancestors', () => {
    const p = project(); p.tracks = [track('joint:parent', [{frame: 0, value: 90}]), track('joint:child', [{frame: 0, value: 90}])];
    const state = evaluateProject(p, 0).objects.product;
    nearVector(transformed(state.partMatrices.tip, [2, 0, 0]), [-1, 1, 0]);
    nearVector(transformed(state.partMatrices.base, [1, 0, 0]), [0, 1, 0]);
  });
  it('clamps angles to joint limits and resets to exact rest on backseek', () => {
    const p = project(); p.tracks = [track('joint:parent', [{frame: 0, value: 0}, {frame: 50, value: 999}, {frame: 100, value: 0}])];
    expect(evaluateProject(p, 50).objects.product.jointAngles.parent).toBe(90);
    const rest = evaluateProject(p, 0).objects.product; evaluateProject(p, 50);
    expect(evaluateProject(p, 0).objects.product).toEqual(rest);
    expect(evaluateProject(p, 100).objects.product.partMatrices.tip).toEqual(new Matrix4().toArray());
  });
  it('subtracts rest angle because source geometry is already in rest pose', () => {
    const p = project(); p.objects[0].joints![1].restAngle = 30;
    nearVector(transformed(evaluateProject(p, 0).objects.product.partMatrices.tip, [2, 0, 0]), [2, 0, 0]);
    p.tracks = [track('joint:parent', [{frame: 0, value: 90}])];
    nearVector(transformed(evaluateProject(p, 0).objects.product.partMatrices.tip, [2, 0, 0]), [1, Math.sqrt(3), 0]);
  });
  it('adds explosion in object-local rest meters, then returns exactly on reassembly', () => {
    const p = project(); p.tracks = [track('joint:parent', [{frame: 0, value: 90}]), track('explode', [{frame: 0, value: 0}, {frame: 50, value: 2}, {frame: 100, value: 0}])];
    nearVector(transformed(evaluateProject(p, 50).objects.product.partMatrices.tip, [2, 0, 0]), [1, 4, 0]);
    expect(evaluateProject(p, 100).objects.product.partMatrices.tip).toEqual(evaluateProject(p, 0).objects.product.partMatrices.tip);
  });
  it('keeps a mounted screen at its authored world position at rest and follows the product delta', () => {
    const p = project(); p.objects.push({id: 'screen', name: 'screen', kind: 'screen', transform: {...identityTransform(), position: [12, 0, 0]}, visible: true, screen: {text: 'user text', mount: {objectId: 'product', partId: 'tip'}}});
    const screen = p.objects[2];
    expect(validateProject(p)).toEqual([]);
    nearVector(new Vector3(12, 0, 0).applyMatrix4(screenMountMatrix(p, evaluateProject(p, 0), screen)).toArray(), [12, 0, 0]);
    p.tracks = [track('joint:parent', [{frame: 0, value: 90}]), track('position', [{frame: 0, value: [13, 0, 0]}])];
    nearVector(new Vector3().applyMatrix4(screenMountMatrix(p, evaluateProject(p, 0), screen).multiply(transformMatrix(screen.transform))).toArray(), [13, 2, 0]);
  });
});

describe('rigged mannequin', () => {
  it('has independent moving arms/legs, deterministic walking, and lower seated hips', () => {
    const p = project(), actor = p.objects[1]; actor.actor!.pose = 'walking';
    const a = evaluateActorSkeleton(actor, evaluateProject(p, 5).objects.actor);
    const b = evaluateActorSkeleton(actor, evaluateProject(p, 12).objects.actor);
    expect(a.leftKnee).not.toEqual(a.rightKnee); expect(a.leftFoot).not.toEqual(b.leftFoot);
    expect(evaluateActorSkeleton(actor, evaluateProject(p, 5).objects.actor)).toEqual(a);
    actor.actor!.pose = 'sitting'; const seated = evaluateActorSkeleton(actor, evaluateProject(p, 5).objects.actor);
    expect(seated.pelvis[1]).toBeLessThan(a.pelvis[1]); expect(seated.leftKnee[2]).toBeGreaterThan(seated.leftHip[2]);
  });
  it('blends gestures continuously and reaches a target in object-local meters', () => {
    const p = project(), actor = p.objects[1]; actor.actor!.target = [0.3, 1.3, 0.35];
    p.tracks = [track('gesture', [{frame: 0, value: 'neutral'}, {frame: 100, value: 'reach'}], 'actor')];
    const start = evaluateActorSkeleton(actor, evaluateProject(p, 0).objects.actor), mid = evaluateActorSkeleton(actor, evaluateProject(p, 50).objects.actor), end = evaluateActorSkeleton(actor, evaluateProject(p, 100).objects.actor);
    nearVector(mid.rightHand, start.rightHand.map((n, i) => (n + end.rightHand[i]) / 2) as V3);
    nearVector(end.rightHand, actor.actor!.target!); expect(Object.values(end).flat().every(Number.isFinite)).toBe(true);
  });
});

describe('GLTF node extraction', () => {
  it('preserves original node world transforms, offsets source origin exactly once and shares resources', () => {
    const scene = new Group(); scene.scale.setScalar(0.001); scene.position.set(2, 0, 0);
    const parent = new Group(); parent.position.set(1000, 500, 0); parent.rotation.z = 0.3;
    const node = new Group(); node.userData._previsIndex = 0; node.position.set(200, 0, 0);
    const geometry = new BoxGeometry(100, 100, 100), material = new MeshStandardMaterial(); node.add(new Mesh(geometry, material)); parent.add(node); scene.add(parent); scene.updateMatrixWorld(true);
    const original = new Box3().setFromObject(node); const model = asset(); model.parts = [model.parts[0]];
    const parts = extractModelParts(scene, model, ['base'], [3, 0, 0]);
    const root = new Group(); root.position.set(3, 0, 0); root.add(parts[0].root); root.updateMatrixWorld(true);
    const actual = new Box3().setFromObject(root);
    nearVector(actual.min.toArray(), original.min.toArray() as V3); nearVector(actual.max.toArray(), original.max.toArray() as V3);
    const cloneMesh = parts[0].root.children[0].children[0] as Mesh;
    expect(cloneMesh.geometry).toBe(geometry); expect(cloneMesh.material).toBe(material);
    const second = extractModelParts(scene, model, ['base'], [3, 0, 0]);
    applyPartMatrix(parts[0].root, new Matrix4().makeTranslation(1, 0, 0).toArray());
    expect(second[0].root.matrix.equals(new Matrix4())).toBe(true); expect(node.parent).toBe(parent);
    geometry.dispose(); material.dispose();
  });
  it('reports missing source indices and does not duplicate nested semantic groups', () => {
    const scene = new Group(), parent = new Group(), child = new Group(); parent.userData._previsIndex = 0; child.userData._previsIndex = 1; parent.add(child); scene.add(parent);
    const extracted = extractModelParts(scene, asset(), undefined);
    expect(extracted[0].root.children[0].children).toHaveLength(0); expect(extracted).toHaveLength(2);
    expect(() => extractModelParts(new Group(), asset(), ['tip'])).toThrow('源节点');
  });
});

describe.skipIf(!process.env.PREVIS_FIXTURE)('real imported product fixture', () => {
  it('evaluates every absolute frame, restores rest and extracts source world meter geometry', async () => {
    const filename = process.env.PREVIS_FIXTURE!;
    const p = JSON.parse(await readFile(filename, 'utf8')) as PrevisProject;
    expect(validateProject(p)).toEqual([]);
    const first = evaluateProject(p, 0), last = evaluateProject(p, p.durationFrames - 1);
    for (let frame = 0; frame < p.durationFrames; frame++) {
      const evaluated = evaluateProject(p, frame);
      expect(evaluated.camera.position.every(Number.isFinite)).toBe(true);
      for (const object of Object.values(evaluated.objects)) expect(Object.values(object.partMatrices).flat().every(Number.isFinite)).toBe(true);
    }
    for (const object of p.objects.filter(o => o.kind === 'model')) expect(last.objects[object.id].partMatrices).toEqual(first.objects[object.id].partMatrices);
    const model = p.assets.find(a => a.kind === 'model') as ModelAsset;
    const bytes = await readFile(resolve(dirname(filename), model.file));
    const raw = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const gltf = await new GLTFLoader().parseAsync(raw, '');
    for (const object of p.objects.filter(o => o.kind === 'model')) {
      const parts = extractModelParts(gltf.scene, model, object.partIds, object.sourceOrigin);
      for (const extracted of parts) {
        const holder = new Group(); holder.matrixAutoUpdate = false; holder.matrix.copy(transformMatrix(object.transform)); holder.add(extracted.root); holder.updateMatrixWorld(true);
        const actual = new Box3().setFromObject(holder), source = model.parts.find(part => part.id === extracted.id)!;
        // Metadata and GLTFLoader must agree on original meter-space geometry at rest.
        nearVector(actual.min.toArray(), source.bounds.min); nearVector(actual.max.toArray(), source.bounds.max);
      }
    }
  }, 60000);
});

describe('commands and validation', () => {
  it('is atomic, clones input/commands and leaves revision and timestamps unchanged', () => {
    const p = project(), before = structuredClone(p);
    const commands: Command[] = [{type: 'object.update', id: 'actor', patch: {transform: {...identityTransform(), position: [2, 0, 0]}}}, {type: 'track.set', track: track('explode', [{frame: 20, value: 1}])}, {type: 'keyframe.set', trackId: 'track-explode', key: {frame: 0, value: 0}}];
    const result = applyCommands(p, commands); expect(p).toEqual(before); expect(result.revision).toBe(3); expect(result.updatedAt).toBe(p.updatedAt);
    result.objects[1].transform.position[0] = 9; expect(p.objects[1].transform.position[0]).toBe(0);
    expect(result.tracks[0].keys.map(k => k.frame)).toEqual([0, 20]); expect((commands[0] as Extract<Command, {type: 'object.update'}>).patch.transform!.position[0]).toBe(2);
    expect(() => applyCommands(p, [{type: 'object.remove', id: 'missing'}])).toThrow('不存在'); expect(p).toEqual(before);
  });
  it('replaces same-frame keys, removes associated tracks with an object and accepts all legal command kinds', () => {
    const p = project(); p.tracks = [track('pose', [{frame: 0, value: 'standing'}], 'actor')];
    const result = applyCommands(p, [{type: 'keyframe.set', trackId: 'track-pose', key: {frame: 0, value: 'walking'}}, {type: 'rig.set', objectId: 'product', joints: p.objects[0].joints!}, {type: 'project.update', patch: {name: 'edited'}}, {type: 'shot.update', id: 'shot', patch: {name: 'renamed'}}]);
    expect(result.tracks[0].keys).toHaveLength(1); expect(result.tracks[0].keys[0].value).toBe('walking');
    expect(applyCommands(result, [{type: 'object.remove', id: 'actor'}]).tracks).toHaveLength(0);
    expect(applyCommands(p, [{type: 'shot.remove', id: 'shot'}]).shots).toHaveLength(0);
  });
  it('rejects duplicate IDs, invalid time/value, unknown fields and protected revision edits', () => {
    const p = project(); expect(validateProject(p)).toEqual([]);
    const bad = structuredClone(p); bad.objects.push(structuredClone(bad.objects[0])); expect(validateProject(bad).join()).toContain('ID 重复');
    bad.objects.pop(); bad.shots[0].end = 200; expect(validateProject(bad).join()).toContain('shots[0].end');
    const nan = structuredClone(p); nan.objects[0].transform.position[0] = Infinity; expect(validateProject(nan).join()).toContain('有限');
    expect(() => applyCommands(p, [{type: 'object.update', id: 'actor', patch: {invented: true}} as unknown as Command])).toThrow('未知');
    expect(() => applyCommands(p, [{type: 'project.update', patch: {revision: 4}} as unknown as Command])).toThrow('禁止');
    expect(validateProject({...p, malicious: {x: 1}} as PrevisProject).join()).toContain('未知字段');
  });
  it('rejects joint cycles, unknown affects and invalid screen mounts', () => {
    const p = project(); p.objects[0].joints![1].parentId = 'child'; expect(validateProject(p).join()).toContain('成环');
    delete p.objects[0].joints![1].parentId; p.objects[0].joints![0].affects = ['missing']; expect(validateProject(p).join()).toContain('不属于');
    p.objects[0].joints![0].affects = ['tip']; p.objects[1].screen = {mount: {objectId: 'product', partId: 'missing'}}; expect(validateProject(p).join()).toContain('挂载部件');
    p.objects[1].screen.mount!.objectId = 'actor'; expect(validateProject(p).join()).toContain('自身');
    p.objects[0].screen = {mount: {objectId: 'actor', partId: 'tip'}}; expect(validateProject(p).join()).toContain('成环');
  });
  it('rejects malformed JSON structures without throwing from the validator', () => {
    for (const value of [null, [], {schemaVersion: 2}, {...project(), assets: [null]}, {...project(), objects: [null]}, {...project(), tracks: [{id: 'bad', property: 42}]}]) {
      expect(() => validateProject(value as PrevisProject)).not.toThrow(); expect(validateProject(value as PrevisProject).length).toBeGreaterThan(0);
    }
  });
});
