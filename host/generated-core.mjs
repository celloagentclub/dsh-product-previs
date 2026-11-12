// src/core/evaluate.ts
import { Box3, CatmullRomCurve3, Euler as Euler2, MathUtils as MathUtils2, Matrix4 as Matrix42, Quaternion as Quaternion2, Vector3 as Vector32 } from "three";

// src/core/matrices.ts
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
function transformMatrix(transform) {
  return new Matrix4().compose(new Vector3(...transform.position), new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(transform.rotation[0]), MathUtils.degToRad(transform.rotation[1]), MathUtils.degToRad(transform.rotation[2]), "XYZ")), new Vector3(...transform.scale));
}
function screenMountMatrix(project, frame, object, visiting = /* @__PURE__ */ new Set()) {
  const mount = object.screen?.mount;
  if (!mount) return new Matrix4();
  if (visiting.has(object.id)) throw new Error(`\u5C4F\u5E55\u6302\u8F7D\u5173\u7CFB\u6210\u73AF\uFF1A${object.id}`);
  visiting.add(object.id);
  const parent = project.objects.find((candidate) => candidate.id === mount.objectId);
  const parentState = frame.objects[mount.objectId];
  if (!parent || !parentState) throw new Error(`\u5C4F\u5E55\u6302\u8F7D\u5BF9\u8C61\u4E0D\u5B58\u5728\uFF1A${mount.objectId}`);
  const part = parentState.partMatrices[mount.partId];
  if (!part) throw new Error(`\u5C4F\u5E55\u6302\u8F7D\u90E8\u4EF6\u4E0D\u5B58\u5728\uFF1A${mount.partId}`);
  const matrix = screenMountMatrix(project, frame, parent, visiting).multiply(transformMatrix(parentState.transform)).multiply(new Matrix4().fromArray(part)).multiply(transformMatrix(parent.transform).invert());
  visiting.delete(object.id);
  return matrix;
}

// src/core/evaluate.ts
var rad = MathUtils2.degToRad;
var deg = MathUtils2.radToDeg;
var clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
var lerp = (a, b, t) => a + (b - a) * t;
var vec = (a) => new Vector32(...a);
var tuple = (v) => [v.x, v.y, v.z];
var mixV = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function ease(t, easing = "linear") {
  t = clamp(t);
  if (easing === "smooth") return t * t * (3 - 2 * t);
  if (easing === "ease-in") return t * t;
  if (easing === "ease-out") return 1 - (1 - t) * (1 - t);
  return t;
}
function keyInterval(keys, frame) {
  if (!keys.length) return null;
  const ordered2 = [...keys].sort((a, b) => a.frame - b.frame);
  const first = ordered2[0];
  if (frame <= first.frame) return { a: first, b: first, t: 0 };
  for (let i = 1; i < ordered2.length; i++) {
    const a = ordered2[i - 1], b = ordered2[i];
    if (frame < b.frame) return { a, b, t: ease((frame - a.frame) / (b.frame - a.frame), a.easing) };
  }
  const last = ordered2[ordered2.length - 1];
  return { a: last, b: last, t: 0 };
}
function rotationAt(a, b, t) {
  const from = new Quaternion2().setFromEuler(new Euler2(rad(a[0]), rad(a[1]), rad(a[2]), "XYZ"));
  const to = new Quaternion2().setFromEuler(new Euler2(rad(b[0]), rad(b[1]), rad(b[2]), "XYZ"));
  const result = new Euler2().setFromQuaternion(from.slerp(to, t), "XYZ");
  return [deg(result.x), deg(result.y), deg(result.z)];
}
function trackValue(track, frame) {
  const segment = track && keyInterval(track.keys, frame);
  if (!segment) return void 0;
  const { a, b, t } = segment;
  if (track?.property === "visible" || track?.property === "screen") return a.value;
  if (typeof a.value === "number" && typeof b.value === "number") return lerp(a.value, b.value, t);
  if (Array.isArray(a.value) && Array.isArray(b.value)) {
    return track?.property === "rotation" ? rotationAt(a.value, b.value, t) : mixV(a.value, b.value, t);
  }
  return a.value;
}
function blendAt(track, frame, fallback) {
  const segment = track && keyInterval(track.keys, frame);
  if (!segment) return { from: fallback, to: fallback, mix: 0 };
  return { from: segment.a.value, to: segment.b.value, mix: segment.t };
}
function orderedJoints(joints) {
  const byId = new Map(joints.map((j) => [j.id, j]));
  const done = /* @__PURE__ */ new Set(), visiting = /* @__PURE__ */ new Set(), result = [];
  const visit = (joint) => {
    if (done.has(joint.id)) return;
    if (visiting.has(joint.id)) throw new Error(`\u5173\u8282\u7236\u7EA7\u6210\u73AF\uFF1A${joint.id}`);
    visiting.add(joint.id);
    if (joint.parentId) {
      const parent = byId.get(joint.parentId);
      if (!parent) throw new Error(`\u5173\u8282 ${joint.id} \u7684\u7236\u7EA7\u4E0D\u5B58\u5728\uFF1A${joint.parentId}`);
      visit(parent);
    }
    visiting.delete(joint.id);
    done.add(joint.id);
    result.push(joint);
  };
  joints.forEach(visit);
  return result;
}
function partMatrices(project, object, angles, explode) {
  const asset = project.assets.find((a) => a.id === object.assetId);
  const parts = object.partIds ?? (asset?.kind === "model" ? asset.parts.map((p) => p.id) : []);
  const joints = orderedJoints(object.joints ?? []);
  const byId = new Map(joints.map((j) => [j.id, j]));
  const deltas = /* @__PURE__ */ new Map();
  for (const j of joints) {
    const axis = vec(j.axis);
    if (axis.lengthSq() === 0) throw new Error(`\u5173\u8282\u8F74\u4E0D\u80FD\u4E3A\u96F6\uFF1A${j.id}`);
    const local = new Matrix42().makeTranslation(...j.pivot).multiply(new Matrix42().makeRotationAxis(axis.normalize(), rad(angles[j.id] - j.restAngle))).multiply(new Matrix42().makeTranslation(-j.pivot[0], -j.pivot[1], -j.pivot[2]));
    deltas.set(j.id, local);
  }
  const result = /* @__PURE__ */ Object.create(null);
  for (const id of parts) {
    const influencing = /* @__PURE__ */ new Set();
    for (const j of joints) if (j.affects.includes(id)) {
      let ancestor = j;
      while (ancestor) {
        influencing.add(ancestor.id);
        ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : void 0;
      }
    }
    const direction = object.explodeDirections?.[id] ?? [0, 0, 0];
    const matrix = new Matrix42().makeTranslation(direction[0] * explode, direction[1] * explode, direction[2] * explode);
    for (const j of joints) if (influencing.has(j.id)) matrix.multiply(deltas.get(j.id));
    result[id] = matrix.toArray();
  }
  return result;
}
function evaluateCamera(shot, frame) {
  const { from, to, move, easing } = shot.camera;
  const t = move === "static" ? 0 : ease((frame - shot.start) / Math.max(1, shot.end - shot.start - 1), easing);
  const target = mixV(from.target, to.target, t);
  let position = mixV(from.position, to.position, t);
  if (move === "orbit") {
    const a = vec(from.position).sub(vec(from.target));
    const b = vec(to.position).sub(vec(to.target));
    const ra = a.length(), rb = b.length();
    const thetaA = Math.atan2(a.x, a.z), thetaB = Math.atan2(b.x, b.z);
    const shortest = Math.atan2(Math.sin(thetaB - thetaA), Math.cos(thetaB - thetaA));
    const sweep = shot.camera.orbitDegrees === void 0 ? shortest : rad(shot.camera.orbitDegrees);
    const theta = thetaA + sweep * t;
    const phiA = ra ? Math.acos(clamp(a.y / ra, -1, 1)) : Math.PI / 2;
    const phiB = rb ? Math.acos(clamp(b.y / rb, -1, 1)) : Math.PI / 2;
    const radius = lerp(ra, rb, t), phi = lerp(phiA, phiB, t);
    position = tuple(new Vector32(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.cos(theta)).add(vec(target)));
  } else if (move === "spline") {
    const points = [from.position, ...shot.camera.points ?? [], to.position];
    position = tuple(new CatmullRomCurve3(points.map(vec), false, "centripetal").getPoint(t));
  }
  const rollA = from.roll ?? 0, rollB = to.roll ?? 0;
  const rollDelta = (rollB - rollA + 540) % 360 - 180;
  return { position, target, focalLength: lerp(from.focalLength, to.focalLength, t), focusDistance: lerp(from.focusDistance, to.focusDistance, t), aperture: lerp(from.aperture, to.aperture, t), roll: rollA + rollDelta * t };
}
function finiteResult(value, path = "frame") {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`\u6C42\u503C\u4EA7\u751F\u4E86\u975E\u6709\u9650\u6570\u503C\uFF1A${path}`);
  if (Array.isArray(value)) value.forEach((v, i) => finiteResult(v, `${path}[${i}]`));
  else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => finiteResult(v, `${path}.${k}`));
}
function activeShot(project, frame) {
  if (!project.shots.length) throw new Error("\u9879\u76EE\u6CA1\u6709\u955C\u5934\uFF1B\u8BF7\u5148\u6DFB\u52A0\u62CD\u6444\u955C\u5934\u518D\u9884\u89C8\u6216\u5BFC\u51FA");
  if (!Number.isFinite(frame)) throw new Error("\u5E27\u53F7\u5FC5\u987B\u662F\u6709\u9650\u6570\u503C");
  frame = clamp(frame, 0, Math.max(0, project.durationFrames - 1));
  const shots = [...project.shots].sort((a, b) => a.start - b.start);
  return shots.find((s) => s.start <= frame && frame < s.end) ?? [...shots].reverse().find((s) => s.start <= frame) ?? shots[0];
}
function evaluateProject(project, frame) {
  return evaluateProjectInternal(project, frame, true);
}
function bindingPoint(project, frame, binding) {
  const object = project.objects.find((o) => o.id === binding.objectId);
  const state = frame.objects[binding.objectId];
  if (!object || !state) throw new Error(`\u955C\u5934\u6CE8\u89C6\u5BF9\u8C61\u4E0D\u5B58\u5728\uFF1A${binding.objectId}`);
  const local = new Vector32(...binding.offset ?? [0, 0, 0]);
  if (binding.partId) {
    const asset = project.assets.find((a) => a.id === object.assetId);
    const part = asset?.kind === "model" ? asset.parts.find((p) => p.id === binding.partId) : void 0;
    const delta = state.partMatrices[binding.partId];
    if (!part || !delta) throw new Error(`\u955C\u5934\u6CE8\u89C6\u90E8\u4EF6\u4E0D\u5B58\u5728\uFF1A${binding.partId}`);
    local.add(vec(part.center).sub(vec(object.sourceOrigin ?? [0, 0, 0]))).applyMatrix4(new Matrix42().fromArray(delta));
  } else if (object.kind === "model") {
    const asset = project.assets.find((a) => a.id === object.assetId);
    if (asset?.kind === "model") {
      const bounds = new Box3(), origin = vec(object.sourceOrigin ?? [0, 0, 0]);
      for (const part of asset.parts) {
        const delta = state.partMatrices[part.id];
        if (!delta) continue;
        bounds.union(new Box3(vec(part.bounds.min).sub(origin), vec(part.bounds.max).sub(origin)).applyMatrix4(new Matrix42().fromArray(delta)));
      }
      if (!bounds.isEmpty()) local.add(bounds.getCenter(new Vector32()));
    }
  } else if (object.kind === "actor") local.y += (object.actor?.height ?? 1.75) * 0.5;
  return tuple(local.applyMatrix4(transformMatrix(state.transform)).applyMatrix4(screenMountMatrix(project, frame, object)));
}
function evaluateProjectInternal(project, frame, applyBinding) {
  if (!Number.isFinite(frame)) throw new Error("\u5E27\u53F7\u5FC5\u987B\u662F\u6709\u9650\u6570\u503C");
  if (!project.shots.length) throw new Error("\u9879\u76EE\u6CA1\u6709\u955C\u5934\uFF1B\u8BF7\u5148\u6DFB\u52A0\u62CD\u6444\u955C\u5934\u518D\u9884\u89C8\u6216\u5BFC\u51FA");
  if (!Number.isFinite(project.durationFrames) || project.durationFrames < 1 || !Number.isFinite(project.fps) || project.fps <= 0) throw new Error("\u9879\u76EE\u65F6\u957F\u6216\u5E27\u7387\u65E0\u6548");
  frame = clamp(frame, 0, project.durationFrames - 1);
  const shot = activeShot(project, frame);
  const objects = /* @__PURE__ */ Object.create(null);
  const trackMap = /* @__PURE__ */ new Map();
  for (const track of project.tracks) {
    if (!trackMap.has(track.objectId)) trackMap.set(track.objectId, /* @__PURE__ */ new Map());
    trackMap.get(track.objectId).set(track.property, track);
  }
  for (const object of project.objects) {
    const tracks = trackMap.get(object.id);
    const get = (property) => trackValue(tracks?.get(property), frame);
    const transform = {
      position: [...get("position") ?? object.transform.position],
      rotation: [...get("rotation") ?? object.transform.rotation],
      scale: [...get("scale") ?? object.transform.scale]
    };
    const jointAngles = /* @__PURE__ */ Object.create(null);
    for (const joint of object.joints ?? []) jointAngles[joint.id] = clamp(get(`joint:${joint.id}`) ?? joint.restAngle, joint.minDeg, joint.maxDeg);
    const explode = Math.max(0, get("explode") ?? 0);
    const visibility = get("visible");
    const visible = visibility === void 0 ? object.visible : typeof visibility === "number" ? visibility >= 0.5 : visibility === "true";
    objects[object.id] = {
      id: object.id,
      transform,
      visible,
      jointAngles,
      partMatrices: partMatrices(project, object, jointAngles, explode),
      explode,
      pose: blendAt(tracks?.get("pose"), frame, object.actor?.pose ?? "standing"),
      gesture: blendAt(tracks?.get("gesture"), frame, object.actor?.gesture ?? "neutral"),
      screen: get("screen"),
      walkPhase: frame / project.fps * Math.PI * 2 * 1.25 % (Math.PI * 2)
    };
  }
  const result = { frame, shotId: shot.id, camera: evaluateCamera(shot, frame), objects };
  const binding = applyBinding ? shot.camera.targetBinding : void 0;
  if (binding) {
    const point = bindingPoint(project, result, binding);
    result.camera.target = point;
    if (binding.followPosition) {
      const start = evaluateProjectInternal(project, shot.start, false);
      const delta = vec(point).sub(vec(bindingPoint(project, start, binding)));
      result.camera.position = tuple(vec(result.camera.position).add(delta));
    }
  }
  finiteResult(result);
  return result;
}

// src/audio/beats.ts
function framesPerBeat(bpm, fps) {
  return 60 / bpm * fps;
}
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function onsetSeconds(onsets, index, period) {
  if (!onsets || onsets.length < 2) return index * period;
  if (index < onsets.length) return onsets[index];
  return onsets[onsets.length - 1] + (index - (onsets.length - 1)) * period;
}
function frameAtBeat(beat, bpm, fps, onsets) {
  const ideal = 60 / bpm;
  if (!onsets || onsets.length < 2) return Math.round(beat * ideal * fps);
  const period = median(onsets.slice(1).map((time2, index) => time2 - onsets[index]).filter((gap) => gap > 0.05)) || ideal;
  const i = Math.floor(beat);
  const fraction = beat - i;
  const time = onsetSeconds(onsets, i, period) + (onsetSeconds(onsets, i + 1, period) - onsetSeconds(onsets, i, period)) * fraction;
  return Math.round(time * fps);
}
function placeRanges(items, bpm, fps, onsets) {
  let cursor = 0;
  const ranges = items.map((item) => {
    const beats = item.beats > 0 ? item.beats : 1;
    let start = frameAtBeat(cursor, bpm, fps, onsets);
    let end = frameAtBeat(cursor + beats, bpm, fps, onsets);
    if (end <= start) end = start + 1;
    cursor += beats;
    return { id: item.id, start, end, beats };
  });
  return { ranges, durationFrames: Math.max(1, frameAtBeat(cursor, bpm, fps, onsets)) };
}
function localMap(frame, fromStart, fromEnd, toStart, toEnd) {
  if (fromEnd <= fromStart) return toStart;
  const u = (frame - fromStart) / (fromEnd - fromStart);
  return Math.round(toStart + u * (toEnd - toStart));
}
function realignProject(project, bpm, onsets) {
  if (!(bpm > 0) || bpm > 400) throw new Error("BPM \u5FC5\u987B\u5728 0 \u5230 400 \u4E4B\u95F4");
  const shots = [...project.shots].sort((a, b) => a.start - b.start);
  const oldPeriod = framesPerBeat(project.film?.bpm || bpm, project.fps);
  const items = shots.map((shot) => ({
    id: shot.id,
    beats: shot.intent?.beats && shot.intent.beats > 0 ? shot.intent.beats : Math.max(0.5, (shot.end - shot.start) / oldPeriod)
  }));
  const { ranges, durationFrames } = placeRanges(items, bpm, project.fps, onsets);
  const byId = new Map(ranges.map((range) => [range.id, range]));
  const nextShots = shots.map((shot) => {
    const range = byId.get(shot.id);
    return { ...shot, start: range.start, end: range.end, intent: { ...shot.intent, beats: range.beats } };
  });
  const limit = Math.max(0, durationFrames - 1);
  const nextTracks = project.tracks.map((track) => {
    const mapped = /* @__PURE__ */ new Map();
    for (const key of track.keys) {
      const owner = shots.find((shot) => key.frame >= shot.start && key.frame < shot.end) ?? shots.find((shot) => shot.start <= key.frame);
      const range = owner ? byId.get(owner.id) : void 0;
      let frame = range && owner ? localMap(key.frame, owner.start, owner.end, range.start, range.end) : key.frame;
      frame = Math.max(0, Math.min(limit, frame));
      mapped.set(frame, { ...key, frame });
    }
    const keys = [...mapped.values()].sort((a, b) => a.frame - b.frame);
    return { ...track, keys: keys.length ? keys : [{ frame: 0, value: track.keys[0]?.value ?? 0 }] };
  });
  return {
    ...project,
    durationFrames,
    shots: nextShots,
    tracks: nextTracks,
    film: project.film ? { ...project.film, bpm } : project.film,
    audio: project.audio ? { ...project.audio, startFrame: Math.min(project.audio.startFrame, limit) } : project.audio
  };
}

// src/camera/moves.ts
import { Euler as Euler3, Matrix4 as Matrix44, Quaternion as Quaternion3, Vector3 as Vector34 } from "three";

// src/product/arm.ts
import { Matrix4 as Matrix43, Vector3 as Vector33 } from "three";

// src/product/arm.calibration.json
var arm_calibration_default = {
  source: "KeyShot GLB https://drive.google.com/file/d/1laS08lVB8YCPYdybRQYlttEvu5Xx3F7b/view",
  measured: "2026-11-12",
  notes: "Product-local meters. The file's lux_root scales millimetres by 0.001. armOriginWorld is the \u79FB\u52A8\u673A\u68B0\u81C2 node origin. local = world - armOriginWorld. Segment nodes are siblings, not a parent chain; pivots below are those node origins (they sit on the hinge axes). Axes: segments 1-4 spin about local Z (the arm sweeps in XY). Screen normal is +X, so portrait is a roll about X. Limits are previs defaults, not certified mechanical stops \u2014 edit this file to calibrate.",
  armOriginWorld: [-0.2918, 0.8, 0],
  screenCenter: [0.27, 0.515, 0],
  parts: [
    { id: "base", label: "\u5E95\u5EA7", role: "product", shape: "box", center: [1e-3, 0.03, 0], size: [0.152, 0.06, 0.2] },
    { id: "seg1", label: "\u7B2C\u4E00\u6BB5\u65CB\u8F6C\u673A\u68B0\u81C2", role: "product", shape: "cylinder", from: [0, 0.06, 0], to: [-0.035, 0.111, 0], radius: 0.028 },
    { id: "seg2", label: "\u7B2C\u4E8C\u6BB5\u65CB\u8F6C\u673A\u68B0\u81C2", role: "product", shape: "cylinder", from: [-0.035, 0.111, 0], to: [0.0655, 0.5155, 0], radius: 0.032 },
    { id: "seg3", label: "\u7B2C\u4E09\u6BB5\u65CB\u8F6C\u673A\u68B0\u81C2", role: "product", shape: "cylinder", from: [0.0655, 0.5155, 0], to: [0.1655, 0.5155, 0], radius: 0.026 },
    { id: "seg4", label: "\u7B2C\u56DB\u6BB5\u65CB\u8F6C\u673A\u68B0\u81C2", role: "product", shape: "cylinder", from: [0.1655, 0.5155, 0], to: [0.242, 0.515, 0], radius: 0.024 },
    { id: "seg5", label: "\u7B2C\u4E94\u6BB5\u65CB\u8F6C\u673A\u68B0\u81C2", role: "product", shape: "cylinder", from: [0.242, 0.515, 0], to: [0.27, 0.515, 0], radius: 0.02 },
    { id: "bracket", label: "\u663E\u793A\u5668\u56FA\u5B9A\u652F\u67B6", role: "product", shape: "box", center: [0.248, 0.515, 0], size: [0.036, 0.11, 0.11] },
    { id: "display", label: "Studio Display", role: "screen", shape: "box", center: [0.27, 0.515, 0], size: [0.028, 0.34, 0.6] }
  ],
  joints: [
    { id: "base_yaw", label: "\u5E95\u5EA7\u65CB\u8F6C", pivot: [0, 0.03, 0], axis: [0, 1, 0], minDeg: -120, maxDeg: 120, restAngle: 0, affects: ["base", "seg1", "seg2", "seg3", "seg4", "seg5", "bracket", "display"] },
    { id: "seg1", label: "\u7B2C\u4E00\u6BB5", parentId: "base_yaw", pivot: [-0.035, 0.111, 0], axis: [0, 0, 1], minDeg: -25, maxDeg: 25, restAngle: 0, affects: ["seg1"] },
    { id: "seg2", label: "\u7B2C\u4E8C\u6BB5", parentId: "base_yaw", pivot: [-0.035, 0.111, 0], axis: [0, 0, 1], minDeg: -58, maxDeg: 36, restAngle: 0, affects: ["seg2", "seg3", "seg4", "seg5", "bracket", "display"] },
    { id: "seg3", label: "\u7B2C\u4E09\u6BB5", parentId: "seg2", pivot: [0.0655, 0.5155, 0], axis: [0, 0, 1], minDeg: -40, maxDeg: 72, restAngle: 0, affects: ["seg3", "seg4", "seg5", "bracket", "display"] },
    { id: "seg4", label: "\u7B2C\u56DB\u6BB5", parentId: "seg3", pivot: [0.1655, 0.5155, 0], axis: [0, 0, 1], minDeg: -45, maxDeg: 45, restAngle: 0, affects: ["seg4", "seg5", "bracket", "display"] },
    { id: "portrait", label: "\u6A2A\u7AD6\u5C4F", parentId: "seg4", pivot: [0.27, 0.515, 0], axis: [1, 0, 0], minDeg: 0, maxDeg: 90, restAngle: 0, affects: ["bracket", "display"] }
  ],
  poses: {
    folded: { seg2: -42, seg3: 48, seg4: -10 },
    portrait: { portrait: 90 },
    nod: { portrait: 90, seg4: 14 }
  }
};

// src/product/arm.ts
var rad2 = (deg2) => deg2 * Math.PI / 180;
var v3 = (a) => [a[0], a[1], a[2]];
var ARM_ORIGIN_WORLD = v3(arm_calibration_default.armOriginWorld);
var SCREEN_CENTER = v3(arm_calibration_default.screenCenter);
var ARM_PARTS = arm_calibration_default.parts;
var ARM_JOINTS = arm_calibration_default.joints.map((joint) => ({
  id: joint.id,
  label: joint.label,
  parentId: "parentId" in joint ? joint.parentId : void 0,
  pivot: v3(joint.pivot),
  axis: v3(joint.axis),
  minDeg: joint.minDeg,
  maxDeg: joint.maxDeg,
  restAngle: joint.restAngle,
  affects: [...joint.affects]
}));
var ACTIONS = ["hold", "unfold", "fold", "rise", "lower", "follow-face", "portrait", "landscape", "nod", "cable-tuck"];
var POSE_DELTAS = {
  rest: {},
  folded: arm_calibration_default.poses.folded,
  portrait: arm_calibration_default.poses.portrait,
  nod: arm_calibration_default.poses.nod,
  raised: { seg2: 12, seg3: -8 },
  lowered: { seg2: -20, seg3: 16 }
};
function jointById(id) {
  const joint = ARM_JOINTS.find((item) => item.id === id);
  if (!joint) throw new Error(`\u5173\u8282\u4E0D\u5B58\u5728\uFF1A${id}`);
  return joint;
}
function clampJoint(id, angle) {
  const joint = jointById(id);
  return Math.min(joint.maxDeg, Math.max(joint.minDeg, angle));
}
function poseAngles(name) {
  const delta = POSE_DELTAS[name];
  if (!delta) throw new Error(`\u59FF\u6001\u4E0D\u5B58\u5728\uFF1A${name}`);
  const angles = {};
  for (const joint of ARM_JOINTS) angles[joint.id] = clampJoint(joint.id, delta[joint.id] ?? joint.restAngle);
  return angles;
}
function ordered(joints) {
  const byId = new Map(joints.map((joint) => [joint.id, joint]));
  const done = /* @__PURE__ */ new Set();
  const result = [];
  const visit = (joint) => {
    if (done.has(joint.id)) return;
    if (joint.parentId) {
      const parent = byId.get(joint.parentId);
      if (parent) visit(parent);
    }
    done.add(joint.id);
    result.push(joint);
  };
  joints.forEach(visit);
  return result;
}
function influencingJoints(partId) {
  const byId = new Map(ARM_JOINTS.map((joint) => [joint.id, joint]));
  const ids = /* @__PURE__ */ new Set();
  for (const joint of ARM_JOINTS) if (joint.affects.includes(partId)) {
    let current = joint;
    while (current) {
      ids.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : void 0;
    }
  }
  return ordered(ARM_JOINTS.filter((joint) => ids.has(joint.id)));
}
function rotateAround(point, pivot, axis, degrees) {
  if (Math.abs(degrees) < 1e-10) return [...point];
  const matrix = new Matrix43().makeTranslation(...pivot).multiply(new Matrix43().makeRotationAxis(new Vector33(...axis).normalize(), rad2(degrees))).multiply(new Matrix43().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
  return new Vector33(...point).applyMatrix4(matrix).toArray();
}
function transformPoint(partId, local, angles) {
  const chain = influencingJoints(partId);
  let point = [...local];
  for (const joint of [...chain].reverse()) {
    const delta = (angles[joint.id] ?? joint.restAngle) - joint.restAngle;
    point = rotateAround(point, joint.pivot, joint.axis, delta);
  }
  return point;
}
function screenPosition(angles) {
  return transformPoint("display", SCREEN_CENTER, angles);
}
var IK_JOINTS = ["seg4", "seg3", "seg2", "base_yaw"];
function solveIk(goal, seed = {}, portrait) {
  const angles = poseAngles("rest");
  for (const [id, value] of Object.entries(seed)) if (id in angles && Number.isFinite(value)) angles[id] = clampJoint(id, value);
  if (portrait !== void 0) angles.portrait = clampJoint("portrait", portrait);
  const distance = () => Math.hypot(...goal.map((value, index) => value - screenPosition(angles)[index]));
  for (let iteration = 0; iteration < 24 && distance() > 8e-3; iteration++) {
    for (const id of IK_JOINTS) {
      const origin = angles[id];
      let best = origin, bestError = distance();
      for (const delta of [-24, -10, -4, -1.5, -0.4, 0.4, 1.5, 4, 10, 24]) {
        angles[id] = clampJoint(id, origin + delta);
        const error2 = distance();
        if (error2 < bestError) {
          bestError = error2;
          best = angles[id];
        }
      }
      angles[id] = best;
    }
  }
  const screen = screenPosition(angles);
  const error = Math.hypot(...goal.map((value, index) => value - screen[index]));
  return { angles, error, screen, reached: error < 0.02 };
}
function keysFor(start, end, from, to, mid) {
  const last = Math.max(start, end - 1);
  const joints = {};
  for (const joint of ARM_JOINTS) {
    const keys = [{ frame: start, value: from[joint.id], easing: "smooth" }];
    if (mid && mid.at > start && mid.at < last) keys.push({ frame: mid.at, value: mid.pose[joint.id], easing: "smooth" });
    if (last !== start) keys.push({ frame: last, value: to[joint.id], easing: "smooth" });
    joints[joint.id] = keys;
  }
  return joints;
}
var CABLE_OUT = [0.18, 0.05, 0.09];
var CABLE_IN = [0.055, 0.036, 0.05];
function faceGoal(goal, facing, distance) {
  if (goal) return goal;
  const face = [0.9, 0.42, 0.05];
  const look = facing ?? [-1, 0, 0];
  const length = Math.hypot(...look) || 1;
  const metres = distance ?? 0.6;
  return face.map((value, index) => value + look[index] / length * metres);
}
function planAction(action, start, end, options = {}) {
  if (!ACTIONS.includes(action)) throw new Error(`\u672A\u77E5\u673A\u68B0\u81C2\u52A8\u4F5C\uFF1A${action}\uFF08\u652F\u6301 ${ACTIONS.join(" / ")}\uFF09`);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) throw new Error("\u52A8\u4F5C\u9700\u8981\u6574\u6570\u5E27\u5E76\u4E14 start < end");
  const rest = poseAngles("rest");
  const folded = poseAngles("folded");
  const portrait = poseAngles("portrait");
  const nod = poseAngles("nod");
  const motions = [];
  let from = rest, to = rest, mid;
  if (action === "unfold") {
    from = folded;
    to = rest;
  } else if (action === "fold") {
    from = rest;
    to = folded;
  } else if (action === "rise") {
    from = poseAngles("lowered");
    to = poseAngles("raised");
  } else if (action === "lower") {
    from = poseAngles("raised");
    to = poseAngles("lowered");
  } else if (action === "portrait") {
    from = rest;
    to = portrait;
  } else if (action === "landscape") {
    from = portrait;
    to = rest;
  } else if (action === "nod") {
    from = portrait;
    to = portrait;
    mid = { at: start + Math.max(1, Math.round((end - start) * 0.45)), pose: nod };
  } else if (action === "cable-tuck") {
    from = portrait;
    to = portrait;
    const last = Math.max(start, end - 1);
    motions.push({ objectId: "cable", property: "position", keys: [{ frame: start, value: CABLE_OUT, easing: "smooth" }, { frame: last, value: CABLE_IN, easing: "smooth" }] });
  } else if (action === "follow-face") {
    const solved = solveIk(faceGoal(options.goal, options.facing, options.distance), rest, options.portrait === false ? 0 : 90);
    from = rest;
    to = solved.angles;
  }
  return { joints: keysFor(start, end, from, to, mid), motions };
}

// scripts/solve-camera.mjs
var SENSOR_HALF_HEIGHT_MM = 18;
function basisOf(position, target) {
  const f = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
  const fl = Math.hypot(...f) || 1;
  const nf = f.map((v) => v / fl);
  let r = [nf[2], 0, -nf[0]];
  const rl = Math.hypot(...r) || 1e-6;
  r = r.map((v) => v / rl);
  const u = [
    r[1] * nf[2] - r[2] * nf[1],
    r[2] * nf[0] - r[0] * nf[2],
    r[0] * nf[1] - r[1] * nf[0]
  ];
  return { f: nf, r, u };
}
function projectPoint(position, target, focalLength, aspect, point) {
  const { f, r, u } = basisOf(position, target);
  const d = [point[0] - position[0], point[1] - position[1], point[2] - position[2]];
  const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (z <= 1e-4) return null;
  const halfH = SENSOR_HALF_HEIGHT_MM / focalLength;
  const halfW = halfH * aspect;
  return {
    x: (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / z / halfW,
    y: (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / z / halfH,
    depth: z
  };
}
function boundsOf(position, target, focalLength, aspect, points) {
  const proj = points.map((p) => projectPoint(position, target, focalLength, aspect, p)).filter(Boolean);
  if (proj.length < 2) return null;
  const xs = proj.map((p) => p.x), ys = proj.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, x1, y0, y1, width: x1 - x0, height: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
function eyeDirection(azimuthDeg, elevationDeg) {
  const az = azimuthDeg * Math.PI / 180, el = elevationDeg * Math.PI / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
}
function centroidOf(points) {
  return [0, 1, 2].map((k) => points.reduce((a, p) => a + p[k], 0) / points.length);
}
function solveCamera({ points, focalLength, aspect, azimuthDeg, elevationDeg, fill, wantX = 0, wantY = 0, minDistance = 0.5, maxDistance = 60 }) {
  if (points.length < 2) return null;
  const c = centroidOf(points);
  const dir = eyeDirection(azimuthDeg, elevationDeg);
  const wantHeight = fill * 2;
  const MIN_D = minDistance, MAX_D = maxDistance;
  const eyeAt = (d) => [c[0] + dir[0] * d, c[1] + dir[1] * d, c[2] + dir[2] * d];
  const bboxAt = (d) => boundsOf(eyeAt(d), c, focalLength, aspect, points);
  let lo = MIN_D, hi = MAX_D;
  const nearest = bboxAt(MIN_D), farthest = bboxAt(MAX_D);
  if (!nearest || nearest.height < wantHeight) return null;
  if (!farthest || farthest.height >= wantHeight) return null;
  let distance = (lo + hi) / 2;
  for (let i = 0; i < 60; i++) {
    distance = (lo + hi) / 2;
    const b = bboxAt(distance);
    if (!b) {
      hi = distance;
      continue;
    }
    if (Math.abs(b.height - wantHeight) < 4e-3) break;
    if (b.height > wantHeight) lo = distance;
    else hi = distance;
  }
  const eye = eyeAt(distance);
  let target = [...c];
  let bestTarget = [...target], bestErr = Infinity;
  for (let i = 0; i < 40; i++) {
    const b = boundsOf(eye, target, focalLength, aspect, points);
    if (!b) break;
    const errX = wantX - b.cx, errY = wantY - b.cy;
    const err = Math.hypot(errX, errY);
    if (err < bestErr) {
      bestErr = err;
      bestTarget = [...target];
    }
    if (Math.abs(errX) < 1e-3 && Math.abs(errY) < 1e-3) break;
    const { r, u } = basisOf(eye, target);
    const spanY = 2 * (SENSOR_HALF_HEIGHT_MM / focalLength) * distance;
    const spanX = spanY * aspect;
    for (let k = 0; k < 3; k++) target[k] -= (r[k] * errX * spanX + u[k] * errY * spanY) * 0.5;
  }
  let finalEye = eye, finalTarget = bestTarget;
  for (let pass = 0; pass < 6; pass++) {
    const b = boundsOf(finalEye, finalTarget, focalLength, aspect, points);
    if (!b) break;
    if (Math.abs(b.height - wantHeight) < 4e-3) break;
    const back = finalEye.map((v, k) => v - c[k]);
    const len = Math.hypot(...back) || 1;
    const axis = back.map((v) => v / len);
    const scale = b.height / wantHeight;
    const nextLen = len * scale;
    const eyeNext = c.map((v, k) => v + axis[k] * nextLen);
    const targetNext = finalTarget.map((v, k) => v + (eyeNext[k] - finalEye[k]));
    const b2 = boundsOf(eyeNext, targetNext, focalLength, aspect, points);
    if (!b2) break;
    finalEye = eyeNext;
    finalTarget = targetNext;
    distance = nextLen;
  }
  return finish(distance, finalEye, finalTarget);
  function finish(d, eyeOverride, targetOverride) {
    const finalEye2 = eyeOverride ?? eyeAt(d);
    const finalTarget2 = targetOverride ?? [...c];
    const bounds = boundsOf(finalEye2, finalTarget2, focalLength, aspect, points);
    if (!bounds) return null;
    const focus = Math.hypot(...finalEye2.map((v, k) => v - finalTarget2[k]));
    return {
      pose: { position: finalEye2, target: finalTarget2, focalLength, focusDistance: focus, aperture: 8 },
      bounds,
      distance: d
    };
  }
}

// src/camera/solver.ts
function solveCamera2(input) {
  return solveCamera(input);
}

// src/camera/moves.ts
var MOVE_NAMES = ["slow-pull", "slow-push", "locked", "orbit", "crane", "macro", "handheld", "over-shoulder"];
var COMPOSITIONS = {
  centered: { azimuth: 32, elevation: 8, wantX: 0, wantY: 0.02 },
  macro: { azimuth: 78, elevation: 6, wantX: 0, wantY: 0 },
  side: { azimuth: 0, elevation: 2, wantX: 0, wantY: 0 },
  front: { azimuth: 90, elevation: 3, wantX: 0, wantY: 0 },
  angle45: { azimuth: 45, elevation: 10, wantX: 0, wantY: 0 },
  low: { azimuth: 24, elevation: -8, wantX: 0, wantY: -0.04 },
  top: { azimuth: 20, elevation: 72, wantX: 0, wantY: 0 },
  "over-shoulder": { azimuth: 155, elevation: 12, wantX: 0.28, wantY: 0.05 }
};
var SUBJECTS = {
  shoulder: ["seg1"],
  elbow: ["seg3"],
  base: ["base"],
  screen: ["display"],
  arm: ARM_PARTS.map((part) => part.id),
  motion: ARM_PARTS.map((part) => part.id)
};
var PULL_SPEED = 0.1;
function solveAt(points, focal, aspect, azimuth, elevation, fill, wantX, wantY, minDistance) {
  for (const attempt of [fill, fill * 0.85, fill * 0.7, Math.min(fill, 0.45)]) {
    const result = solveCamera2({ points, focalLength: focal, aspect, azimuthDeg: azimuth, elevationDeg: elevation, fill: Math.max(0.12, attempt), wantX, wantY, minDistance });
    if (!result) continue;
    return { pose: { ...result.pose, position: result.pose.position, target: result.pose.target }, distance: result.distance };
  }
  return null;
}
function subjectPoints(project, objectId, frame, subject) {
  const partIds = SUBJECTS[subject] ?? SUBJECTS.arm;
  const state = evaluateProject(project, frame);
  const object = project.objects.find((item) => item.id === objectId);
  const asset = project.assets.find((item) => item.id === object?.assetId);
  const evaluated = state.objects[objectId];
  if (!object || !evaluated || asset?.kind !== "model") throw new Error(`\u53D6\u666F\u5BF9\u8C61\u4E0D\u5B58\u5728\uFF1A${objectId}`);
  const origin = object.sourceOrigin ?? [0, 0, 0];
  const rotation = evaluated.transform.rotation;
  const objectMatrix = new Matrix44().compose(
    new Vector34(...evaluated.transform.position),
    new Quaternion3().setFromEuler(new Euler3(rotation[0] * Math.PI / 180, rotation[1] * Math.PI / 180, rotation[2] * Math.PI / 180, "XYZ")),
    new Vector34(...evaluated.transform.scale)
  );
  const points = [];
  for (const part of asset.parts.filter((item) => partIds.includes(item.id))) {
    const delta = evaluated.partMatrices[part.id];
    if (!delta) continue;
    const local = new Matrix44().fromArray(delta);
    for (const x of [part.bounds.min[0], part.bounds.max[0]]) {
      for (const y of [part.bounds.min[1], part.bounds.max[1]]) {
        for (const z of [part.bounds.min[2], part.bounds.max[2]]) {
          const point = new Vector34(x - origin[0], y - origin[1], z - origin[2]).applyMatrix4(local).applyMatrix4(objectMatrix);
          points.push([point.x, point.y, point.z]);
        }
      }
    }
  }
  if (points.length < 2) throw new Error(`\u4E3B\u4F53\u6CA1\u6709\u53EF\u53D6\u666F\u7684\u70B9\uFF1A${subject}`);
  return points;
}
function solveMove(options) {
  const requested = options.move === "macro" ? "slow-pull" : options.move;
  if (!MOVE_NAMES.includes(requested)) throw new Error(`\u672A\u77E5\u8FD0\u955C\uFF1A${options.move}\uFF08\u652F\u6301 ${MOVE_NAMES.join(" / ")}\uFF09`);
  const compositionName = options.composition === "macro" ? "macro" : options.move === "over-shoulder" && !COMPOSITIONS[options.composition] ? "over-shoulder" : options.composition;
  const preset = COMPOSITIONS[compositionName];
  if (!preset) throw new Error(`\u672A\u77E5\u6784\u56FE\uFF1A${options.composition}\uFF08\u652F\u6301 ${Object.keys(COMPOSITIONS).join(" / ")}\uFF09`);
  const azimuth = options.azimuth ?? preset.azimuth;
  const elevation = options.elevation ?? preset.elevation;
  const macro = compositionName === "macro" || options.move === "macro";
  const focal = options.focal ?? (macro ? 85 : options.move === "over-shoulder" ? 40 : 50);
  const fill = options.fill ?? (macro ? 0.72 : requested === "locked" ? 0.52 : 0.6);
  const aperture = options.aperture ?? (macro ? 2.8 : requested === "locked" ? 5.6 : 4);
  const aspect = options.project.width / options.project.height;
  const subject = options.subject ?? (requested === "locked" ? "motion" : macro ? "shoulder" : "arm");
  const minDistance = macro ? 0.08 : 0.35;
  const duration = Math.max(1 / options.project.fps, (options.end - options.start - 1) / options.project.fps);
  const framingSubject = subject === "motion" ? "arm" : subject;
  const fromPoints = subjectPoints(options.project, options.objectId, options.start, framingSubject);
  const toFrame = Math.max(options.start, options.end - 1);
  const toPoints = subject === "motion" ? [...fromPoints, ...subjectPoints(options.project, options.objectId, toFrame, "arm")] : subjectPoints(options.project, options.objectId, toFrame, framingSubject);
  const paint = (pose) => ({ ...pose, aperture, focalLength: focal });
  const framed = subject === "motion" ? toPoints : fromPoints;
  const startSolve = solveAt(framed, focal, aspect, azimuth, elevation, fill, preset.wantX, preset.wantY, minDistance);
  if (!startSolve) throw new Error(`\u6784\u56FE\u65E0\u89E3\uFF1A${options.move} / ${options.composition}`);
  if (requested === "locked" || requested === "over-shoulder") {
    const pose = paint(startSolve.pose);
    return { from: pose, to: { ...pose, position: [...pose.position], target: [...pose.target] }, move: "static", easing: "linear" };
  }
  if (requested === "orbit") {
    const end2 = solveAt(fromPoints, focal, aspect, azimuth + 26, elevation, fill, preset.wantX, preset.wantY, minDistance) ?? startSolve;
    return { from: paint(startSolve.pose), to: paint(end2.pose), move: "orbit", easing: "linear", orbitDegrees: 26 };
  }
  if (requested === "crane") {
    const end2 = solveAt(fromPoints, focal, aspect, azimuth, elevation + 16, fill, preset.wantX, preset.wantY, minDistance) ?? startSolve;
    return { from: paint(startSolve.pose), to: paint(end2.pose), move: "linear", easing: "smooth" };
  }
  if (requested === "handheld") {
    const end2 = solveAt(fromPoints, focal, aspect, azimuth + 3, elevation + 1, fill * 0.96, preset.wantX, preset.wantY, minDistance) ?? startSolve;
    const mid = startSolve.pose.position.map((value, index) => value * 0.55 + end2.pose.position[index] * 0.45 + [0.014, 8e-3, -0.01][index]);
    return { from: { ...paint(startSolve.pose), roll: -1.3 }, to: { ...paint(end2.pose), roll: 1.1 }, move: "spline", easing: "linear", points: [mid] };
  }
  const speed = options.pullSpeed ?? PULL_SPEED;
  const endDistance = Math.max(minDistance + 0.02, startSolve.distance + (requested === "slow-push" ? -1 : 1) * speed * duration);
  const endFill = Math.min(0.92, Math.max(0.18, fill * (startSolve.distance / endDistance)));
  const end = solveAt(toPoints, focal, aspect, azimuth, elevation, endFill, preset.wantX, preset.wantY, minDistance) ?? startSolve;
  return { from: paint(startSolve.pose), to: paint(end.pose), move: "linear", easing: "linear" };
}

// src/core/commands.ts
var fields = {
  project: ["schemaVersion", "id", "name", "revision", "fps", "durationFrames", "width", "height", "assets", "objects", "shots", "tracks", "audio", "film", "sequences", "createdAt", "updatedAt"],
  object: ["id", "name", "kind", "transform", "visible", "locked", "color", "assetId", "partIds", "sourceOrigin", "joints", "explodeDirections", "actor", "screen", "light"],
  shot: ["id", "name", "start", "end", "description", "camera", "kind", "sequenceId", "dialogue", "screenContent", "broll", "intent", "videoPrompt"],
  track: ["id", "objectId", "property", "keys"],
  joint: ["id", "label", "parentId", "pivot", "axis", "minDeg", "maxDeg", "restAngle", "affects"],
  pose: ["position", "target", "focalLength", "focusDistance", "aperture", "roll"]
};
var poses = ["standing", "sitting", "walking"];
var gestures = ["neutral", "reach", "raise", "type"];
var easings = ["linear", "smooth", "ease-in", "ease-out"];
var kinds = ["model", "actor", "box", "plane", "screen", "light"];
var isRow = (v) => !!v && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
var validId = (v) => typeof v === "string" && /^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,127}$/.test(v) && !["__proto__", "prototype", "constructor"].includes(v);
function validateProject(project) {
  try {
    return validateDocument(project);
  } catch (error) {
    return [`project: \u9879\u76EE\u7ED3\u6784\u65E0\u6548\uFF08${error instanceof Error ? error.message : String(error)}\uFF09`];
  }
}
function validateDocument(project) {
  const errors = [];
  const err = (path, message) => errors.push(`${path}: ${message}`);
  const row = (v, path, allowed) => {
    if (!isRow(v)) {
      err(path, "\u5FC5\u987B\u662F\u666E\u901A\u5BF9\u8C61");
      return false;
    }
    for (const key of Object.keys(v)) if (!allowed.includes(key)) err(`${path}.${key}`, "\u672A\u77E5\u5B57\u6BB5");
    return true;
  };
  const number = (v, path, min = -1e9, max = 1e9, integer = false) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || integer && !Number.isInteger(v)) {
      err(path, `\u5FC5\u987B\u662F${integer ? "\u6574\u6570" : "\u6709\u9650\u6570\u503C"}\uFF08${min}\u2026${max}\uFF09`);
      return false;
    }
    return true;
  };
  const text = (v, path, max = 1e4) => {
    if (typeof v !== "string" || v.length > max || v.includes("\0")) {
      err(path, `\u5FC5\u987B\u662F\u957F\u5EA6\u4E0D\u8D85\u8FC7 ${max} \u7684\u6587\u5B57`);
      return false;
    }
    return true;
  };
  const choice = (v, path, values) => {
    if (typeof v !== "string" || !values.includes(v)) err(path, `\u4EC5\u652F\u6301 ${values.join(" / ")}`);
  };
  const vector = (v, path, positive = false) => {
    if (!Array.isArray(v) || v.length !== 3) {
      err(path, "\u5FC5\u987B\u662F\u4E09\u5143\u5411\u91CF");
      return false;
    }
    return v.map((n, i) => number(n, `${path}[${i}]`, positive ? 1e-6 : -1e9, 1e9)).every(Boolean);
  };
  const boolean = (v, path) => {
    if (typeof v !== "boolean") err(path, "\u5FC5\u987B\u662F\u5E03\u5C14\u503C");
  };
  const list = (v, path) => {
    if (!Array.isArray(v)) {
      err(path, "\u5FC5\u987B\u662F\u6570\u7EC4");
      return false;
    }
    return true;
  };
  const id = (v, path) => {
    if (!validId(v)) err(path, "ID \u65E0\u6548\uFF08\u4EC5\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u3001\u70B9\u3001\u5192\u53F7\u548C\u77ED\u6A2A\u7EBF\uFF09");
  };
  const globalIds = /* @__PURE__ */ new Set();
  const register = (v, path, seen = globalIds) => {
    id(v, path);
    if (typeof v === "string") {
      if (seen.has(v)) err(path, `ID \u91CD\u590D\uFF1A${v}`);
      seen.add(v);
    }
  };
  const bounds = (v, path) => {
    if (!row(v, path, ["min", "max"])) return;
    if (vector(v.min, `${path}.min`) && vector(v.max, `${path}.max`) && v.min.some((n, i) => n > v.max[i])) err(path, "min \u4E0D\u80FD\u5927\u4E8E max");
  };
  const file = (v, path) => {
    if (!text(v, path, 1024)) return;
    if (!v || v.startsWith("/") || /^[A-Za-z]:/.test(v) || v.includes("\\") || v.split("/").some((s) => s === ".." || s === ".") || /^[a-z]+:/i.test(v)) err(path, "\u5FC5\u987B\u662F\u9879\u76EE\u5185\u7684\u76F8\u5BF9\u8D44\u6E90\u8DEF\u5F84");
  };
  const cameraPose = (v, path) => {
    if (!row(v, path, fields.pose)) return;
    vector(v.position, `${path}.position`);
    vector(v.target, `${path}.target`);
    if (Array.isArray(v.position) && Array.isArray(v.target) && v.position.length === 3 && v.target.length === 3 && v.position.every((n, i) => n === v.target[i])) err(path, "\u76F8\u673A\u4F4D\u7F6E\u4E0D\u80FD\u4E0E\u6CE8\u89C6\u76EE\u6807\u91CD\u5408");
    number(v.focalLength, `${path}.focalLength`, 1, 2e3);
    number(v.focusDistance, `${path}.focusDistance`, 1e-4, 1e9);
    number(v.aperture, `${path}.aperture`, 0.1, 256);
    if (v.roll !== void 0) number(v.roll, `${path}.roll`, -36e3, 36e3);
  };
  if (!row(project, "project", fields.project)) return errors;
  if (project.schemaVersion !== 2) err("schemaVersion", "\u4EC5\u652F\u6301\u7248\u672C 2");
  id(project.id, "id");
  text(project.name, "name", 500);
  number(project.revision, "revision", 0, Number.MAX_SAFE_INTEGER, true);
  number(project.fps, "fps", 1, 240, true);
  number(project.durationFrames, "durationFrames", 1, 1e7, true);
  number(project.width, "width", 16, 8192, true);
  number(project.height, "height", 16, 8192, true);
  for (const field of ["createdAt", "updatedAt"]) if (!text(project[field], field, 100) || !Number.isFinite(Date.parse(project[field]))) err(field, "\u5FC5\u987B\u662F\u6709\u6548\u65E5\u671F\u6587\u5B57");
  const endFrame = Math.max(0, project.durationFrames - 1);
  const assets = Array.isArray(project.assets) ? project.assets : [];
  if (list(project.assets, "assets")) project.assets.forEach((asset, i) => {
    const p = `assets[${i}]`;
    if (!isRow(asset)) {
      err(p, "\u5FC5\u987B\u662F\u666E\u901A\u5BF9\u8C61");
      return;
    }
    if (asset.kind === "model") {
      if (!row(asset, p, ["id", "name", "kind", "file", "sourceName", "hash", "originalBytes", "previewBytes", "triangles", "bounds", "parts"])) return;
      text(asset.sourceName, `${p}.sourceName`, 1024);
      text(asset.hash, `${p}.hash`, 200);
      for (const key of ["originalBytes", "previewBytes", "triangles"]) number(asset[key], `${p}.${key}`, 0, Number.MAX_SAFE_INTEGER, true);
      bounds(asset.bounds, `${p}.bounds`);
      const partIds = /* @__PURE__ */ new Set(), indices = /* @__PURE__ */ new Set();
      if (list(asset.parts, `${p}.parts`)) asset.parts.forEach((part, k) => {
        const q = `${p}.parts[${k}]`;
        if (!row(part, q, ["id", "label", "nodeIndex", "bounds", "center", "role"])) return;
        register(part.id, `${q}.id`, partIds);
        text(part.label, `${q}.label`, 500);
        if (number(part.nodeIndex, `${q}.nodeIndex`, 0, 1e7, true)) {
          if (indices.has(part.nodeIndex)) err(`${q}.nodeIndex`, "\u540C\u4E00\u8282\u70B9\u4E0D\u80FD\u58F0\u660E\u4E24\u6B21");
          indices.add(part.nodeIndex);
        }
        bounds(part.bounds, `${q}.bounds`);
        vector(part.center, `${q}.center`);
        if (part.role !== void 0) choice(part.role, `${q}.role`, ["product", "set", "screen", "computer"]);
      });
    } else {
      row(asset, p, ["id", "name", "kind", "file", "hash"]);
      choice(asset.kind, `${p}.kind`, ["image", "video", "audio"]);
      if (asset.hash !== void 0) text(asset.hash, `${p}.hash`, 200);
    }
    register(asset.id, `${p}.id`);
    text(asset.name, `${p}.name`, 500);
    file(asset.file, `${p}.file`);
  });
  const objects = Array.isArray(project.objects) ? project.objects : [];
  if (list(project.objects, "objects")) project.objects.forEach((object, i) => {
    const p = `objects[${i}]`;
    if (!row(object, p, fields.object)) return;
    register(object.id, `${p}.id`);
    text(object.name, `${p}.name`, 500);
    choice(object.kind, `${p}.kind`, kinds);
    boolean(object.visible, `${p}.visible`);
    if (object.locked !== void 0) boolean(object.locked, `${p}.locked`);
    if (object.color !== void 0 && (typeof object.color !== "string" || !/^#[0-9a-f]{6}$/i.test(object.color))) err(`${p}.color`, "\u5FC5\u987B\u662F #RRGGBB \u8272\u503C");
    if (row(object.transform, `${p}.transform`, ["position", "rotation", "scale"])) {
      vector(object.transform.position, `${p}.transform.position`);
      vector(object.transform.rotation, `${p}.transform.rotation`);
      vector(object.transform.scale, `${p}.transform.scale`, true);
    }
    const asset = assets.find((a) => a.id === object.assetId);
    if (object.assetId !== void 0) {
      id(object.assetId, `${p}.assetId`);
      if (!asset) err(`${p}.assetId`, "\u8D44\u6E90\u4E0D\u5B58\u5728");
    }
    if (object.kind === "model" && asset?.kind !== "model") err(`${p}.assetId`, "\u6A21\u578B\u5BF9\u8C61\u5FC5\u987B\u5F15\u7528\u6A21\u578B\u8D44\u6E90");
    const available = new Set(asset?.kind === "model" ? asset.parts?.map((part) => part.id) : []);
    if (object.partIds !== void 0 && list(object.partIds, `${p}.partIds`)) {
      const selected2 = /* @__PURE__ */ new Set();
      for (const partId of object.partIds) {
        register(partId, `${p}.partIds`, selected2);
        if (!available.has(partId)) err(`${p}.partIds`, `\u6E90\u90E8\u4EF6\u4E0D\u5B58\u5728\uFF1A${partId}`);
      }
      if (object.partIds.length === 0 && object.kind === "model") err(`${p}.partIds`, "\u6A21\u578B\u5BF9\u8C61\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u90E8\u4EF6");
    }
    if (object.sourceOrigin !== void 0) vector(object.sourceOrigin, `${p}.sourceOrigin`);
    const selected = new Set(object.partIds ?? available);
    if (object.explodeDirections !== void 0) {
      if (!isRow(object.explodeDirections)) err(`${p}.explodeDirections`, "\u5FC5\u987B\u662F\u90E8\u4EF6 ID \u5230\u5411\u91CF\u7684\u5BF9\u8C61");
      else for (const [partId, direction] of Object.entries(object.explodeDirections)) {
        if (!selected.has(partId)) err(`${p}.explodeDirections.${partId}`, "\u4E0D\u662F\u672C\u5BF9\u8C61\u7684\u90E8\u4EF6");
        vector(direction, `${p}.explodeDirections.${partId}`);
      }
    }
    if (object.joints !== void 0 && list(object.joints, `${p}.joints`)) {
      const jointIds = /* @__PURE__ */ new Set();
      object.joints.forEach((joint, j) => {
        const q = `${p}.joints[${j}]`;
        if (!row(joint, q, fields.joint)) return;
        register(joint.id, `${q}.id`, jointIds);
        text(joint.label, `${q}.label`, 500);
        vector(joint.pivot, `${q}.pivot`);
        if (vector(joint.axis, `${q}.axis`) && Math.hypot(...joint.axis) < 1e-8) err(`${q}.axis`, "\u65CB\u8F6C\u8F74\u4E0D\u80FD\u4E3A\u96F6");
        number(joint.minDeg, `${q}.minDeg`, -36e3, 36e3);
        number(joint.maxDeg, `${q}.maxDeg`, -36e3, 36e3);
        number(joint.restAngle, `${q}.restAngle`, -36e3, 36e3);
        if (joint.minDeg > joint.maxDeg || joint.restAngle < joint.minDeg || joint.restAngle > joint.maxDeg) err(q, "\u5173\u8282\u9650\u4F4D\u6216\u521D\u59CB\u89D2\u5EA6\u65E0\u6548");
        if (joint.parentId !== void 0) id(joint.parentId, `${q}.parentId`);
        if (list(joint.affects, `${q}.affects`)) {
          const unique = /* @__PURE__ */ new Set();
          for (const partId of joint.affects) {
            register(partId, `${q}.affects`, unique);
            if (!selected.has(partId)) err(`${q}.affects`, `\u5F71\u54CD\u7684\u90E8\u4EF6\u4E0D\u5C5E\u4E8E\u672C\u5BF9\u8C61\uFF1A${partId}`);
          }
          if (!joint.affects.length) err(`${q}.affects`, "\u81F3\u5C11\u6307\u5B9A\u4E00\u4E2A\u53D7\u5F71\u54CD\u90E8\u4EF6");
        }
      });
      const byId = new Map(object.joints.filter(isRow).map((j) => [j.id, j]));
      for (const joint of object.joints.filter(isRow)) {
        if (joint.parentId && !byId.has(joint.parentId)) err(`${p}.joints.${joint.id}.parentId`, "\u7236\u5173\u8282\u4E0D\u5B58\u5728");
        const chain = /* @__PURE__ */ new Set();
        let current = joint;
        while (current) {
          if (chain.has(current.id)) {
            err(`${p}.joints`, `\u7236\u7EA7\u6210\u73AF\uFF1A${current.id}`);
            break;
          }
          chain.add(current.id);
          current = byId.get(current.parentId);
        }
      }
    }
    if (object.actor !== void 0 && row(object.actor, `${p}.actor`, ["height", "pose", "gesture", "target"])) {
      number(object.actor.height, `${p}.actor.height`, 0.2, 10);
      choice(object.actor.pose, `${p}.actor.pose`, poses);
      choice(object.actor.gesture, `${p}.actor.gesture`, gestures);
      if (object.actor.target !== void 0) vector(object.actor.target, `${p}.actor.target`);
    }
    if (object.kind === "actor" && !object.actor) err(`${p}.actor`, "\u4EBA\u7269\u9700\u8981\u8EAB\u9AD8\u3001\u59FF\u6001\u548C\u624B\u52BF");
    if (object.screen !== void 0 && row(object.screen, `${p}.screen`, ["assetId", "text", "mount"])) {
      if (object.screen.text !== void 0) text(object.screen.text, `${p}.screen.text`);
      if (object.screen.assetId !== void 0) {
        const media = assets.find((a) => a.id === object.screen.assetId);
        if (!media || !["image", "video"].includes(media.kind)) err(`${p}.screen.assetId`, "\u5C4F\u5E55\u9700\u8981\u56FE\u7247\u6216\u89C6\u9891\u8D44\u6E90");
      }
      if (object.screen.mount !== void 0 && row(object.screen.mount, `${p}.screen.mount`, ["objectId", "partId"])) {
        id(object.screen.mount.objectId, `${p}.screen.mount.objectId`);
        id(object.screen.mount.partId, `${p}.screen.mount.partId`);
        if (object.screen.mount.objectId === object.id) err(`${p}.screen.mount`, "\u5C4F\u5E55\u4E0D\u80FD\u6302\u8F7D\u5230\u81EA\u8EAB");
        const parent = objects.find((item) => item.id === object.screen.mount.objectId);
        const parentAsset = assets.find((item) => item.id === parent?.assetId);
        if (!parent) err(`${p}.screen.mount.objectId`, "\u6302\u8F7D\u5BF9\u8C61\u4E0D\u5B58\u5728");
        else if (parent.kind !== "model" || parentAsset?.kind !== "model") err(`${p}.screen.mount.objectId`, "\u6302\u8F7D\u76EE\u6807\u5FC5\u987B\u662F\u6A21\u578B\u5BF9\u8C61");
        else if (!(parent.partIds ?? parentAsset.parts.map((part) => part.id)).includes(object.screen.mount.partId)) err(`${p}.screen.mount.partId`, "\u6302\u8F7D\u90E8\u4EF6\u4E0D\u5C5E\u4E8E\u76EE\u6807\u6A21\u578B\u5BF9\u8C61");
      }
    }
    if (object.light !== void 0 && row(object.light, `${p}.light`, ["type", "intensity", "target", "color"])) {
      choice(object.light.type, `${p}.light.type`, ["directional", "point"]);
      number(object.light.intensity, `${p}.light.intensity`, 0, 1e5);
      vector(object.light.target, `${p}.light.target`);
      if (typeof object.light.color !== "string" || !/^#[0-9a-f]{6}$/i.test(object.light.color)) err(`${p}.light.color`, "\u5FC5\u987B\u662F #RRGGBB \u8272\u503C");
    }
    if (object.kind === "light" && !object.light) err(`${p}.light`, "\u706F\u5149\u914D\u7F6E\u7F3A\u5931");
  });
  const mountState = /* @__PURE__ */ new Map();
  const mountPath = [];
  const visitMount = (object) => {
    const state = mountState.get(object.id) ?? 0;
    if (state === 2) return;
    if (state === 1) {
      err(`objects.${object.id}.screen.mount`, `\u6302\u8F7D\u5173\u7CFB\u6210\u73AF\uFF1A${[...mountPath, object.id].join(" \u2192 ")}`);
      return;
    }
    mountState.set(object.id, 1);
    mountPath.push(object.id);
    const next = object.screen?.mount?.objectId ? objects.find((candidate) => candidate.id === object.screen.mount.objectId) : void 0;
    if (next) visitMount(next);
    mountPath.pop();
    mountState.set(object.id, 2);
  };
  objects.forEach(visitMount);
  const sequenceIds = /* @__PURE__ */ new Set();
  if (project.film !== void 0 && row(project.film, "film", ["id", "title", "style", "look", "logline", "bpm", "grade"])) {
    register(project.film.id, "film.id");
    text(project.film.title, "film.title", 500);
    text(project.film.logline, "film.logline", 4e3);
    choice(project.film.style, "film.style", ["brand", "creator"]);
    choice(project.film.look, "film.look", ["studio-black", "desk"]);
    if (project.film.bpm !== void 0) number(project.film.bpm, "film.bpm", 20, 400);
    if (project.film.grade !== void 0) boolean(project.film.grade, "film.grade");
  }
  if (project.sequences !== void 0 && list(project.sequences, "sequences")) project.sequences.forEach((sequence, i) => {
    const p = `sequences[${i}]`;
    if (!row(sequence, p, ["id", "name", "start", "end", "summary", "role"])) return;
    register(sequence.id, `${p}.id`);
    if (typeof sequence.id === "string") sequenceIds.add(sequence.id);
    text(sequence.name, `${p}.name`, 500);
    text(sequence.summary, `${p}.summary`, 4e3);
    number(sequence.start, `${p}.start`, 0, endFrame, true);
    number(sequence.end, `${p}.end`, 1, project.durationFrames, true);
    if (sequence.start >= sequence.end) err(p, "\u6BB5\u843D\u5FC5\u987B\u6EE1\u8DB3 start < end");
    if (sequence.role !== void 0) text(sequence.role, `${p}.role`, 80);
  });
  if (Array.isArray(project.sequences)) {
    const sorted = [...project.sequences].filter(isRow).sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) err("sequences", `\u6BB5\u843D\u65F6\u95F4\u91CD\u53E0\uFF1A${sorted[i - 1].id} / ${sorted[i].id}`);
  }
  if (list(project.shots, "shots")) {
    project.shots.forEach((shot, i) => {
      const p = `shots[${i}]`;
      if (!row(shot, p, fields.shot)) return;
      register(shot.id, `${p}.id`);
      text(shot.name, `${p}.name`, 500);
      text(shot.description, `${p}.description`);
      number(shot.start, `${p}.start`, 0, endFrame, true);
      number(shot.end, `${p}.end`, 1, project.durationFrames, true);
      if (shot.start >= shot.end) err(p, "\u955C\u5934\u5FC5\u987B\u6EE1\u8DB3 start < end\uFF08\u5DE6\u95ED\u53F3\u5F00\uFF09");
      if (row(shot.camera, `${p}.camera`, ["from", "to", "move", "easing", "orbitDegrees", "points", "targetBinding"])) {
        cameraPose(shot.camera.from, `${p}.camera.from`);
        cameraPose(shot.camera.to, `${p}.camera.to`);
        choice(shot.camera.move, `${p}.camera.move`, ["static", "linear", "orbit", "spline"]);
        choice(shot.camera.easing, `${p}.camera.easing`, easings);
        if (shot.camera.orbitDegrees !== void 0) number(shot.camera.orbitDegrees, `${p}.camera.orbitDegrees`, -36e3, 36e3);
        if (shot.camera.points !== void 0 && list(shot.camera.points, `${p}.camera.points`)) {
          if (shot.camera.points.length > 1e3) err(`${p}.camera.points`, "\u8DEF\u5F84\u70B9\u8FC7\u591A");
          shot.camera.points.forEach((v, j) => vector(v, `${p}.camera.points[${j}]`));
        }
        const binding = shot.camera.targetBinding;
        if (binding !== void 0 && row(binding, `${p}.camera.targetBinding`, ["objectId", "partId", "offset", "followPosition"])) {
          id(binding.objectId, `${p}.camera.targetBinding.objectId`);
          const target = objects.find((object) => object.id === binding.objectId);
          if (!target) err(`${p}.camera.targetBinding.objectId`, "\u6CE8\u89C6\u5BF9\u8C61\u4E0D\u5B58\u5728");
          if (binding.partId !== void 0) {
            id(binding.partId, `${p}.camera.targetBinding.partId`);
            const targetAsset = assets.find((asset) => asset.id === target?.assetId);
            if (target?.kind !== "model" || targetAsset?.kind !== "model" || !(target.partIds ?? targetAsset.parts.map((part) => part.id)).includes(binding.partId)) err(`${p}.camera.targetBinding.partId`, "\u6CE8\u89C6\u90E8\u4EF6\u4E0D\u5C5E\u4E8E\u76EE\u6807\u5BF9\u8C61");
          }
          if (binding.offset !== void 0) vector(binding.offset, `${p}.camera.targetBinding.offset`);
          if (binding.followPosition !== void 0) boolean(binding.followPosition, `${p}.camera.targetBinding.followPosition`);
        }
      }
      if (shot.kind !== void 0) choice(shot.kind, `${p}.kind`, ["3d", "broll-code"]);
      if (shot.sequenceId !== void 0) {
        id(shot.sequenceId, `${p}.sequenceId`);
        if (!sequenceIds.has(shot.sequenceId)) err(`${p}.sequenceId`, "\u6BB5\u843D\u4E0D\u5B58\u5728");
      }
      if (shot.screenContent !== void 0) text(shot.screenContent, `${p}.screenContent`, 2e3);
      if (shot.videoPrompt !== void 0) text(shot.videoPrompt, `${p}.videoPrompt`, 4e3);
      if (shot.dialogue !== void 0 && row(shot.dialogue, `${p}.dialogue`, ["speaker", "line", "vo"])) {
        text(shot.dialogue.speaker, `${p}.dialogue.speaker`, 80);
        text(shot.dialogue.line, `${p}.dialogue.line`, 2e3);
        if (shot.dialogue.vo !== void 0) boolean(shot.dialogue.vo, `${p}.dialogue.vo`);
      }
      if (shot.broll !== void 0 && row(shot.broll, `${p}.broll`, ["template", "lines", "accent"])) {
        choice(shot.broll.template, `${p}.broll.template`, ["kinetic", "spec", "ui", "diagram", "logo"]);
        if (shot.broll.accent !== void 0) text(shot.broll.accent, `${p}.broll.accent`, 40);
        if (list(shot.broll.lines, `${p}.broll.lines`)) {
          if (!shot.broll.lines.length || shot.broll.lines.length > 8) err(`${p}.broll.lines`, "\u9700\u8981 1 \u5230 8 \u884C");
          shot.broll.lines.forEach((line, j) => text(line, `${p}.broll.lines[${j}]`, 80));
        }
      }
      if (shot.kind === "broll-code" && !shot.broll) err(p, "\u4EE3\u7801 B-roll \u955C\u5934\u9700\u8981 broll \u6A21\u677F");
      if (shot.intent !== void 0 && row(shot.intent, `${p}.intent`, ["move", "composition", "subject", "role", "azimuth", "elevation", "fill", "focal", "wantX", "wantY", "beats", "aperture", "pullSpeed"])) {
        for (const key of ["move", "composition", "subject", "role"]) if (shot.intent[key] !== void 0) text(shot.intent[key], `${p}.intent.${key}`, 80);
        for (const key of ["azimuth", "elevation", "focal", "aperture", "pullSpeed"]) if (shot.intent[key] !== void 0) number(shot.intent[key], `${p}.intent.${key}`, key === "aperture" || key === "pullSpeed" || key === "focal" ? 0.01 : -36e3, key === "focal" ? 2e3 : 36e3);
        if (shot.intent.fill !== void 0) number(shot.intent.fill, `${p}.intent.fill`, 0.05, 1.5);
        if (shot.intent.wantX !== void 0) number(shot.intent.wantX, `${p}.intent.wantX`, -1, 1);
        if (shot.intent.wantY !== void 0) number(shot.intent.wantY, `${p}.intent.wantY`, -1, 1);
        if (shot.intent.beats !== void 0) number(shot.intent.beats, `${p}.intent.beats`, 0.25, 1e4);
      }
    });
    const sorted = [...project.shots].filter(isRow).sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) err("shots", `\u955C\u5934\u65F6\u95F4\u91CD\u53E0\uFF1A${sorted[i - 1].id} / ${sorted[i].id}`);
  }
  if (list(project.tracks, "tracks")) {
    const properties = /* @__PURE__ */ new Set();
    project.tracks.forEach((track, i) => {
      const p = `tracks[${i}]`;
      if (!row(track, p, fields.track)) return;
      register(track.id, `${p}.id`);
      id(track.objectId, `${p}.objectId`);
      const object = objects.find((o) => o.id === track.objectId);
      if (!object) err(`${p}.objectId`, "\u5BF9\u8C61\u4E0D\u5B58\u5728");
      const property = track.property;
      if (typeof property !== "string" || !["position", "rotation", "scale", "pose", "gesture", "explode", "visible", "screen"].includes(property) && !property.startsWith("joint:")) err(`${p}.property`, "\u672A\u77E5\u8F68\u9053\u5C5E\u6027");
      if (property?.startsWith("joint:") && !object?.joints?.some((j) => j.id === property.slice(6))) err(`${p}.property`, "\u5173\u8282\u4E0D\u5B58\u5728");
      if (["pose", "gesture"].includes(property) && object?.kind !== "actor") err(`${p}.property`, "\u59FF\u6001\u8F68\u9053\u53EA\u80FD\u4F5C\u7528\u4E8E\u4EBA\u7269");
      if (property === "screen" && object?.kind !== "screen") err(`${p}.property`, "\u5C4F\u5E55\u8F68\u9053\u53EA\u80FD\u4F5C\u7528\u4E8E\u5C4F\u5E55");
      const propertyId = `${track.objectId}/${property}`;
      if (properties.has(propertyId)) err(p, "\u540C\u4E00\u5BF9\u8C61\u7684\u540C\u4E00\u5C5E\u6027\u53EA\u80FD\u6709\u4E00\u6761\u8F68\u9053");
      properties.add(propertyId);
      if (list(track.keys, `${p}.keys`)) {
        const keyFrames = /* @__PURE__ */ new Set();
        if (!track.keys.length) err(`${p}.keys`, "\u8F68\u9053\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u5173\u952E\u5E27");
        track.keys.forEach((key, j) => {
          const q = `${p}.keys[${j}]`;
          if (!row(key, q, ["frame", "value", "easing"])) return;
          number(key.frame, `${q}.frame`, 0, endFrame, true);
          if (keyFrames.has(key.frame)) err(`${q}.frame`, "\u5173\u952E\u5E27\u91CD\u590D");
          keyFrames.add(key.frame);
          if (key.easing !== void 0) choice(key.easing, `${q}.easing`, easings);
          if (["position", "rotation", "scale"].includes(property)) vector(key.value, `${q}.value`, property === "scale");
          else if (property === "pose") choice(key.value, `${q}.value`, poses);
          else if (property === "gesture") choice(key.value, `${q}.value`, gestures);
          else if (property === "screen") text(key.value, `${q}.value`);
          else if (property === "visible") {
            if (![0, 1, "true", "false"].includes(key.value)) err(`${q}.value`, "\u53EF\u89C1\u6027\u4F7F\u7528 0 / 1 \u6216 true / false \u6587\u5B57");
          } else number(key.value, `${q}.value`, property === "explode" ? 0 : -36e3, property === "explode" ? 1e4 : 36e3);
        });
      }
    });
  }
  if (project.audio !== void 0 && row(project.audio, "audio", ["assetId", "startFrame", "trimStart", "gain"])) {
    if (!assets.some((a) => a.id === project.audio.assetId && a.kind === "audio")) err("audio.assetId", "\u97F3\u9891\u8D44\u6E90\u4E0D\u5B58\u5728");
    number(project.audio.startFrame, "audio.startFrame", 0, endFrame, true);
    number(project.audio.trimStart, "audio.trimStart", 0, 86400);
    number(project.audio.gain, "audio.gain", 0, 10);
  }
  return errors;
}
function assertFields(value, allowed, context) {
  if (!isRow(value)) throw new Error(`${context}: \u5FC5\u987B\u662F\u666E\u901A\u5BF9\u8C61`);
  const unknown = Object.keys(value).filter((k) => !allowed.includes(k));
  if (unknown.length) throw new Error(`${context}: \u672A\u77E5\u6216\u7981\u6B62\u7684\u5B57\u6BB5 ${unknown.join(", ")}`);
}
function applyCommands(project, commands) {
  if (!Array.isArray(commands) || commands.length > 1e4) throw new Error("commands \u5FC5\u987B\u662F\u6570\u7EC4\uFF0C\u4E14\u4E0D\u8D85\u8FC7 10000 \u6761");
  const result = structuredClone(project);
  const existing = (items, id, kind) => {
    const item = items.find((x) => x.id === id);
    if (!item) throw new Error(`${kind}\u4E0D\u5B58\u5728\uFF1A${id}`);
    return item;
  };
  for (const command of commands) {
    if (!isRow(command)) throw new Error("\u547D\u4EE4\u5FC5\u987B\u662F\u666E\u901A\u5BF9\u8C61");
    const clone = (v) => structuredClone(v);
    switch (command.type) {
      case "project.update":
        assertFields(command, ["type", "patch"], command.type);
        assertFields(command.patch, ["name", "durationFrames", "width", "height"], command.type);
        Object.assign(result, clone(command.patch));
        break;
      case "object.add":
        assertFields(command, ["type", "object"], command.type);
        result.objects.push(clone(command.object));
        break;
      case "object.update": {
        assertFields(command, ["type", "id", "patch"], command.type);
        assertFields(command.patch, fields.object.filter((k) => k !== "id" && k !== "kind"), command.type);
        Object.assign(existing(result.objects, command.id, "\u5BF9\u8C61"), clone(command.patch));
        break;
      }
      case "object.remove":
        assertFields(command, ["type", "id"], command.type);
        existing(result.objects, command.id, "\u5BF9\u8C61");
        result.objects = result.objects.filter((o) => o.id !== command.id);
        result.tracks = result.tracks.filter((t) => t.objectId !== command.id);
        break;
      case "shot.add":
        assertFields(command, ["type", "shot"], command.type);
        result.shots.push(clone(command.shot));
        break;
      case "shot.update":
        assertFields(command, ["type", "id", "patch"], command.type);
        assertFields(command.patch, fields.shot.filter((k) => k !== "id"), command.type);
        Object.assign(existing(result.shots, command.id, "\u955C\u5934"), clone(command.patch));
        break;
      case "shot.remove":
        assertFields(command, ["type", "id"], command.type);
        existing(result.shots, command.id, "\u955C\u5934");
        result.shots = result.shots.filter((s) => s.id !== command.id);
        break;
      case "track.set": {
        assertFields(command, ["type", "track"], command.type);
        const index = result.tracks.findIndex((t) => t.id === command.track.id);
        if (index < 0) result.tracks.push(clone(command.track));
        else result.tracks[index] = clone(command.track);
        break;
      }
      case "track.remove":
        assertFields(command, ["type", "id"], command.type);
        existing(result.tracks, command.id, "\u8F68\u9053");
        result.tracks = result.tracks.filter((t) => t.id !== command.id);
        break;
      case "keyframe.set": {
        assertFields(command, ["type", "trackId", "key"], command.type);
        const track = existing(result.tracks, command.trackId, "\u8F68\u9053");
        const index = track.keys.findIndex((k) => k.frame === command.key.frame);
        if (index < 0) track.keys.push(clone(command.key));
        else track.keys[index] = clone(command.key);
        track.keys.sort((a, b) => a.frame - b.frame);
        break;
      }
      case "rig.set":
        assertFields(command, ["type", "objectId", "joints"], command.type);
        existing(result.objects, command.objectId, "\u5BF9\u8C61").joints = clone(command.joints);
        break;
      case "asset.add":
        assertFields(command, ["type", "asset"], command.type);
        result.assets.push(clone(command.asset));
        break;
      case "film.set":
        assertFields(command, ["type", "film"], command.type);
        result.film = clone(command.film);
        break;
      case "sequence.add":
        assertFields(command, ["type", "sequence"], command.type);
        result.sequences = [...result.sequences ?? [], clone(command.sequence)];
        break;
      case "sequence.update": {
        assertFields(command, ["type", "id", "patch"], command.type);
        assertFields(command.patch, ["name", "start", "end", "summary", "role"], command.type);
        const sequences = result.sequences ?? [];
        Object.assign(existing(sequences, command.id, "\u6BB5\u843D"), clone(command.patch));
        break;
      }
      case "sequence.remove": {
        assertFields(command, ["type", "id"], command.type);
        existing(result.sequences ?? [], command.id, "\u6BB5\u843D");
        result.sequences = (result.sequences ?? []).filter((sequence) => sequence.id !== command.id);
        for (const shot of result.shots) if (shot.sequenceId === command.id) delete shot.sequenceId;
        break;
      }
      case "audio.set":
        assertFields(command, ["type", "audio"], command.type);
        result.audio = clone(command.audio);
        break;
      case "arm.action": {
        assertFields(command, ["type", "objectId", "action", "start", "end", "goal", "facing", "distance", "portrait"], command.type);
        const object = existing(result.objects, command.objectId, "\u5BF9\u8C61");
        if (command.goal !== void 0 && !Array.isArray(command.goal)) throw new Error("goal \u5FC5\u987B\u662F\u4E09\u5143\u5411\u91CF");
        if (command.facing !== void 0 && !Array.isArray(command.facing)) throw new Error("facing \u5FC5\u987B\u662F\u4E09\u5143\u5411\u91CF");
        const plan = planAction(command.action, command.start, command.end, { goal: command.goal, facing: command.facing, distance: command.distance, portrait: command.portrait });
        const merge = (track) => {
          const index = result.tracks.findIndex((item) => item.id === track.id);
          if (index < 0) {
            result.tracks.push(track);
            return;
          }
          const keys = new Map(result.tracks[index].keys.map((key) => [key.frame, key]));
          for (const key of track.keys) keys.set(key.frame, key);
          result.tracks[index] = { ...result.tracks[index], keys: [...keys.values()].sort((a, b) => a.frame - b.frame) };
        };
        for (const [jointId, keys] of Object.entries(plan.joints)) {
          if (!object.joints?.some((joint) => joint.id === jointId)) throw new Error(`\u5BF9\u8C61 ${object.id} \u6CA1\u6709\u5173\u8282 ${jointId}`);
          merge({ id: `${object.id}-joint-${jointId}`, objectId: object.id, property: `joint:${jointId}`, keys });
        }
        for (const motion of plan.motions) {
          existing(result.objects, motion.objectId, "\u5BF9\u8C61");
          merge({ id: `${motion.objectId}-${motion.property}`, objectId: motion.objectId, property: motion.property, keys: motion.keys });
        }
        break;
      }
      case "camera.apply": {
        assertFields(command, ["type", "shotId", "move", "composition", "subject", "azimuth", "elevation", "fill", "focal", "aperture", "pullSpeed"], command.type);
        const shot = existing(result.shots, command.shotId, "\u955C\u5934");
        const object = result.objects.find((item) => item.joints?.some((joint) => joint.id === "portrait")) ?? result.objects.find((item) => item.kind === "model");
        if (!object) throw new Error("\u573A\u666F\u91CC\u6CA1\u6709\u53EF\u53D6\u666F\u7684\u6A21\u578B");
        const solved = solveMove({
          project: result,
          objectId: object.id,
          start: shot.start,
          end: shot.end,
          move: command.move,
          composition: command.composition,
          subject: command.subject,
          azimuth: command.azimuth,
          elevation: command.elevation,
          fill: command.fill,
          focal: command.focal,
          aperture: command.aperture,
          pullSpeed: command.pullSpeed
        });
        const { points, orbitDegrees, ...camera } = solved;
        shot.camera = { ...camera, ...orbitDegrees !== void 0 ? { orbitDegrees } : {}, ...points ? { points } : {} };
        shot.intent = {
          ...shot.intent,
          move: command.move,
          composition: command.composition,
          ...command.subject !== void 0 ? { subject: command.subject } : {},
          ...command.azimuth !== void 0 ? { azimuth: command.azimuth } : {},
          ...command.elevation !== void 0 ? { elevation: command.elevation } : {},
          ...command.fill !== void 0 ? { fill: command.fill } : {},
          ...command.focal !== void 0 ? { focal: command.focal } : {},
          ...command.aperture !== void 0 ? { aperture: command.aperture } : {},
          ...command.pullSpeed !== void 0 ? { pullSpeed: command.pullSpeed } : {}
        };
        break;
      }
      case "timeline.align": {
        assertFields(command, ["type", "bpm", "onsets"], command.type);
        if (command.onsets !== void 0 && (!Array.isArray(command.onsets) || command.onsets.some((item) => typeof item !== "number" || !Number.isFinite(item)))) throw new Error("onsets \u5FC5\u987B\u662F\u79D2\u6570\u6570\u7EC4");
        const aligned = realignProject(result, command.bpm, command.onsets);
        result.shots = aligned.shots;
        result.tracks = aligned.tracks;
        result.durationFrames = aligned.durationFrames;
        result.film = aligned.film;
        result.audio = aligned.audio;
        break;
      }
      default:
        throw new Error(`\u672A\u77E5\u547D\u4EE4\uFF1A${String(command.type)}`);
    }
  }
  const errors = validateProject(result);
  if (errors.length) throw new Error(`\u9879\u76EE\u4FEE\u6539\u65E0\u6548\uFF1A
${errors.join("\n")}`);
  return result;
}
export {
  activeShot,
  applyCommands,
  ease,
  evaluateCamera,
  evaluateProject,
  keyInterval,
  orderedJoints,
  validateProject
};
//# sourceMappingURL=generated-core.mjs.map
