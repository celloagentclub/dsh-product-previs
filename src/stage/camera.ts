import {MathUtils, PerspectiveCamera, Vector3} from 'three';
import type {CameraPose} from '../core/types';

/** Physical full-frame camera shared by editor monitor, helpers and ThreeCanvas render. */
export function applyCameraPose(camera: PerspectiveCamera, pose: CameraPose, aspect: number): void {
  camera.up.set(0, 1, 0);
  camera.aspect = aspect;
  camera.filmGauge = 36;
  camera.filmOffset = 0;
  camera.position.set(...pose.position);
  const target = new Vector3(...pose.target);
  // A path may pass through its target. Keep orientation deterministic at that singularity.
  if (camera.position.distanceToSquared(target) < 1e-12) target.z -= 1;
  camera.lookAt(target);
  if (pose.roll) camera.rotateZ(MathUtils.degToRad(pose.roll));
  camera.setFocalLength(pose.focalLength);
  camera.focus = pose.focusDistance;
  camera.near = 0.01;
  camera.far = 100000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
