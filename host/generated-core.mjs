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
  const ordered = [...keys].sort((a, b) => a.frame - b.frame);
  const first = ordered[0];
  if (frame <= first.frame) return { a: first, b: first, t: 0 };
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1], b = ordered[i];
    if (frame < b.frame) return { a, b, t: ease((frame - a.frame) / (b.frame - a.frame), a.easing) };
  }
  const last = ordered[ordered.length - 1];
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
  const shots = [...project.shots].sort((a, b) => a.start - b.start);
  const shot = shots.find((s) => s.start <= frame && frame < s.end) ?? [...shots].reverse().find((s) => s.start <= frame) ?? shots[0];
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

// src/core/commands.ts
var fields = {
  project: ["schemaVersion", "id", "name", "revision", "fps", "durationFrames", "width", "height", "assets", "objects", "shots", "tracks", "audio", "createdAt", "updatedAt"],
  object: ["id", "name", "kind", "transform", "visible", "locked", "color", "assetId", "partIds", "sourceOrigin", "joints", "explodeDirections", "actor", "screen", "light"],
  shot: ["id", "name", "start", "end", "description", "camera"],
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
  applyCommands,
  ease,
  evaluateCamera,
  evaluateProject,
  keyInterval,
  orderedJoints,
  validateProject
};
//# sourceMappingURL=generated-core.mjs.map
