/**
 * Camera framing solver.
 *
 * State the intent (subjects in frame, how tall they should read, from which
 * direction, where they sit on screen) and get a camera back. Two independent
 * steps, because coupling them silently broke the first version:
 *
 *   1. Size: from a fixed look direction, bisect distance until the projected
 *      subject height matches the request. Monotone, so bisection is valid.
 *   2. Aim: rotate the look direction so the subject group lands at the wanted
 *      screen position. This barely changes size, so step 1 stays valid.
 *
 * All measurements use the same projection the renderer uses.
 */
const SENSOR_HALF_HEIGHT_MM = 18; // full-frame 36mm sensor

export function basisOf(position, target) {
  const f = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
  const fl = Math.hypot(...f) || 1;
  const nf = f.map(v => v / fl);
  let r = [nf[2], 0, -nf[0]];
  const rl = Math.hypot(...r) || 1e-6;
  r = r.map(v => v / rl);
  const u = [
    r[1] * nf[2] - r[2] * nf[1],
    r[2] * nf[0] - r[0] * nf[2],
    r[0] * nf[1] - r[1] * nf[0],
  ];
  return {f: nf, r, u};
}

/** NDC projection. x,y in -1..1 (frame edges); depth along the view axis. */
export function projectPoint(position, target, focalLength, aspect, point) {
  const {f, r, u} = basisOf(position, target);
  const d = [point[0] - position[0], point[1] - position[1], point[2] - position[2]];
  const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (z <= 1e-4) return null;
  const halfH = SENSOR_HALF_HEIGHT_MM / focalLength;
  const halfW = halfH * aspect;
  return {
    x: (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / z / halfW,
    y: (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / z / halfH,
    depth: z,
  };
}

export function boundsOf(position, target, focalLength, aspect, points) {
  const proj = points.map(p => projectPoint(position, target, focalLength, aspect, p)).filter(Boolean);
  if (proj.length < 2) return null;
  const xs = proj.map(p => p.x), ys = proj.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return {x0, x1, y0, y1, width: x1 - x0, height: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2};
}

/** Unit vector from subject centre toward where the camera stands. */
export function eyeDirection(azimuthDeg, elevationDeg) {
  const az = azimuthDeg * Math.PI / 180, el = elevationDeg * Math.PI / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
}

export function centroidOf(points) {
  return [0, 1, 2].map(k => points.reduce((a, p) => a + p[k], 0) / points.length);
}

/**
 * @param points      world-space points that must read in frame
 * @param focalLength mm
 * @param aspect      width / height
 * @param fill        subject height as a fraction of frame height (1 fills it)
 * @param wantX/wantY where the subject group should centre, in NDC (-1..1)
 */
export function solveCamera({points, focalLength, aspect, azimuthDeg, elevationDeg, fill, wantX = 0, wantY = 0}) {
  if (points.length < 2) return null;
  const c = centroidOf(points);
  const dir = eyeDirection(azimuthDeg, elevationDeg);
  const wantHeight = fill * 2; // NDC spans -1..1
  const MIN_D = 0.5, MAX_D = 60;

  const eyeAt = d => [c[0] + dir[0] * d, c[1] + dir[1] * d, c[2] + dir[2] * d];

  // Step 1: size, aiming at the centroid. Height falls monotonically with distance.
  const bboxAt = d => boundsOf(eyeAt(d), c, focalLength, aspect, points);
  let lo = MIN_D, hi = MAX_D;
  const nearest = bboxAt(MIN_D), farthest = bboxAt(MAX_D);
  // If the subject is still smaller than requested at the closest allowed
  // distance, the size is unreachable; refusing is better than a wrong camera.
  if (!nearest || nearest.height < wantHeight) return null;
  if (!farthest || farthest.height >= wantHeight) return null;

  let distance = (lo + hi) / 2;
  for (let i = 0; i < 60; i++) {
    distance = (lo + hi) / 2;
    const b = bboxAt(distance);
    if (!b) { hi = distance; continue; }
    if (Math.abs(b.height - wantHeight) < 0.004) break;
    if (b.height > wantHeight) lo = distance; else hi = distance;
  }

  // Step 2: aim, keeping the eye fixed so size does not drift.
  const eye = eyeAt(distance);
  let target = [...c];
  let bestTarget = [...target], bestErr = Infinity;
  for (let i = 0; i < 40; i++) {
    const b = boundsOf(eye, target, focalLength, aspect, points);
    // Aiming too far off can push the subject behind the camera; stop and keep
    // the best valid aim instead of discarding the whole shot.
    if (!b) break;
    const errX = wantX - b.cx, errY = wantY - b.cy;
    const err = Math.hypot(errX, errY);
    if (err < bestErr) { bestErr = err; bestTarget = [...target]; }
    if (Math.abs(errX) < 0.001 && Math.abs(errY) < 0.001) break;
    const {r, u} = basisOf(eye, target);
    const spanY = 2 * (SENSOR_HALF_HEIGHT_MM / focalLength) * distance;
    const spanX = spanY * aspect;
    // Aiming ahead of the subject moves the subject BEHIND frame centre, so the
    // aim point must move opposite the requested offset, half-damped.
    for (let k = 0; k < 3; k++) target[k] -= (r[k] * errX * spanX + u[k] * errY * spanY) * 0.5;
  }

  // Aiming moves the subject across the frame, which changes its projected size.
  // Re-solve distance from the aimed direction and repeat until both hold.
  let finalEye = eye, finalTarget = bestTarget;
  for (let pass = 0; pass < 6; pass++) {
    const b = boundsOf(finalEye, finalTarget, focalLength, aspect, points);
    if (!b) break;
    if (Math.abs(b.height - wantHeight) < 0.004) break;
    // Walk the eye along its current direction to correct the height.
    const back = finalEye.map((v, k) => v - c[k]);
    const len = Math.hypot(...back) || 1;
    const axis = back.map(v => v / len);
    const scale = b.height / wantHeight;
    const nextLen = len * scale;
    const eyeNext = c.map((v, k) => v + axis[k] * nextLen);
    const targetNext = finalTarget.map((v, k) => v + (eyeNext[k] - finalEye[k]));
    const b2 = boundsOf(eyeNext, targetNext, focalLength, aspect, points);
    if (!b2) break;
    finalEye = eyeNext; finalTarget = targetNext;
    distance = nextLen;
  }

  return finish(distance, finalEye, finalTarget);

  function finish(d, eyeOverride, targetOverride) {
    const finalEye = eyeOverride ?? eyeAt(d);
    const finalTarget = targetOverride ?? [...c];
    const bounds = boundsOf(finalEye, finalTarget, focalLength, aspect, points);
    if (!bounds) return null;
    const focus = Math.hypot(...finalEye.map((v, k) => v - finalTarget[k]));
    return {
      pose: {position: finalEye, target: finalTarget, focalLength, focusDistance: focus, aperture: 8},
      bounds, distance: d,
    };
  }
}
