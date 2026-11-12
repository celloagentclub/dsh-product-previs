/** Canonical shared contract. Units: meters, degrees in authored rotations, integer frames. */
export type V3 = [number, number, number];
export type Mat4 = number[];
export type Easing = 'linear' | 'smooth' | 'ease-in' | 'ease-out';
export interface Bounds { min: V3; max: V3 }
export interface AssetPart {
  id: string; label: string; nodeIndex: number; bounds: Bounds;
  /** Original source world-space center, including all GLB matrices and unit conversion. */
  center: V3;
  role?: 'product' | 'set' | 'screen' | 'computer';
}
export interface ModelAsset {
  id: string; name: string; kind: 'model'; file: string; sourceName: string; hash: string;
  originalBytes: number; previewBytes: number; triangles: number; bounds: Bounds; parts: AssetPart[];
}
export interface MediaAsset { id: string; name: string; kind: 'image' | 'video' | 'audio'; file: string; hash?: string }
export type Asset = ModelAsset | MediaAsset;
export interface Transform { position: V3; rotation: V3; scale: V3 }
/** Joint pivots/axes live in product-local REST coordinates (source world minus sourceOrigin).
 * Apply parent joints before child joints. `affects` is a list of immutable source part IDs.
 */
export interface JointBinding {
  id: string; label: string; parentId?: string; pivot: V3; axis: V3;
  minDeg: number; maxDeg: number; restAngle: number; affects: string[];
}
export type ActorPose = 'standing' | 'sitting' | 'walking';
export type ActorGesture = 'neutral' | 'reach' | 'raise' | 'type';
export interface SceneObject {
  id: string; name: string; kind: 'model' | 'actor' | 'box' | 'plane' | 'screen' | 'light';
  transform: Transform; visible: boolean; locked?: boolean; color?: string;
  assetId?: string; partIds?: string[];
  /** Object position defaults to sourceOrigin; imported geometry is shifted by -sourceOrigin. */
  sourceOrigin?: V3;
  joints?: JointBinding[]; explodeDirections?: Record<string, V3>;
  actor?: { height: number; pose: ActorPose; gesture: ActorGesture; target?: V3 };
  screen?: { assetId?: string; text?: string; mount?: {objectId:string;partId:string} };
  light?: { type: 'directional' | 'point'; intensity: number; target: V3; color: string };
}
export interface CameraPose { position: V3; target: V3; focalLength: number; focusDistance: number; aperture: number; roll?: number }
export type CameraMove = 'static' | 'linear' | 'orbit' | 'spline';
export interface Shot {
  id: string; name: string; start: number; end: number; description: string;
  camera: { from: CameraPose; to: CameraPose; move: CameraMove; easing: Easing; orbitDegrees?: number; points?: V3[]; targetBinding?: {objectId:string;partId?:string;offset?:V3;followPosition?:boolean} };
}
export type TrackValue = number | V3 | string;
export interface Keyframe { frame: number; value: TrackValue; easing?: Easing }
export interface Track {
  id: string; objectId: string;
  property: 'position' | 'rotation' | 'scale' | 'pose' | 'gesture' | 'explode' | 'visible' | 'screen' | `joint:${string}`;
  keys: Keyframe[];
}
export interface PrevisProject {
  schemaVersion: 2; id: string; name: string; revision: number;
  fps: number; durationFrames: number; width: number; height: number;
  assets: Asset[]; objects: SceneObject[]; shots: Shot[]; tracks: Track[];
  audio?: { assetId: string; startFrame: number; trimStart: number; gain: number };
  createdAt: string; updatedAt: string;
}
export interface PoseBlend<T extends string> { from: T; to: T; mix: number }
export interface EvaluatedObject {
  id: string; transform: Transform; visible: boolean;
  jointAngles: Record<string, number>; partMatrices: Record<string, Mat4>; explode: number;
  pose: PoseBlend<ActorPose>; gesture: PoseBlend<ActorGesture>;
  screen?: string; walkPhase: number;
}
export interface EvaluatedFrame {
  frame: number; shotId: string | null; camera: CameraPose; objects: Record<string, EvaluatedObject>;
}
export type Command =
  | {type:'project.update'; patch:Partial<Pick<PrevisProject,'name'|'durationFrames'|'width'|'height'>>}
  | {type:'object.add'; object:SceneObject}
  | {type:'object.update'; id:string; patch:Partial<SceneObject>}
  | {type:'object.remove'; id:string}
  | {type:'shot.add'; shot:Shot}
  | {type:'shot.update'; id:string; patch:Partial<Shot>}
  | {type:'shot.remove'; id:string}
  | {type:'track.set'; track:Track}
  | {type:'track.remove'; id:string}
  | {type:'keyframe.set'; trackId:string; key:Keyframe}
  | {type:'rig.set'; objectId:string; joints:JointBinding[]}
  | {type:'asset.add'; asset:Asset};
export interface ProjectSummary { id:string; name:string; revision:number; fps:number; durationFrames:number; width:number; height:number; objectCount:number; shotCount:number; updatedAt:string }
export interface RenderJob { id:string; projectId:string; revision:number; status:'queued'|'rendering'|'completed'|'failed'|'cancelled'; progress:number; message:string; createdAt:string; file?:string; width:number; height:number; fps:number; error?:string }
export const identityTransform = ():Transform => ({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
