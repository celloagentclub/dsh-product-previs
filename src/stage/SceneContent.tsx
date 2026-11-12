import {createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo} from 'react';
import {useGLTF, useTexture} from '@react-three/drei';
import type {ThreeEvent} from '@react-three/fiber';
import {Box3, CameraHelper, CanvasTexture, Color, DoubleSide, Euler, Group, MathUtils, Matrix4, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Quaternion, SRGBColorSpace, Vector3} from 'three';
import {evaluateCamera, evaluateProject} from '../core/evaluate';
import {screenMountMatrix, transformMatrix} from '../core/matrices';
import type {EvaluatedFrame, EvaluatedObject, ModelAsset, PrevisProject, SceneObject, V3} from '../core/types';
import {evaluateActorSkeleton} from './actorRig';
import {applyCameraPose} from './camera';
import {applyPartMatrix, extractModelParts} from './modelParts';
import {DeskRig, StudioGrade, StudioRig, gradeEnabled} from './studioLook';

export interface SceneContentProps {
  project: PrevisProject;
  frame: EvaluatedFrame | number;
  assetUrl: (file: string) => string;
  helpers?: boolean;
  selectedId?: string;
  onSelect?: (id: string) => void;
}

/** The viewport registers these roots for direct TransformControls attachment. */
export const ObjectRegistryContext = createContext<((id: string, object: Group | null) => void) | undefined>(undefined);
const radians = (v: V3): [number, number, number] => v.map(MathUtils.degToRad) as V3;

function ProductModel({asset, object, state, assetUrl, finish}: {asset: ModelAsset; object: SceneObject; state: EvaluatedObject; assetUrl: (file: string) => string; finish: string}) {
  const gltf = useGLTF(assetUrl(asset.file), false);
  const parts = useMemo(() => extractModelParts(gltf.scene, asset, object.partIds, object.sourceOrigin), [gltf.scene, asset, object.partIds, object.sourceOrigin]);
  useLayoutEffect(() => {
    if (finish !== 'studio') return;
    for (const part of parts) part.root.traverse(node => {
      if (!(node instanceof Mesh) || !node.material || Array.isArray(node.material)) return;
      const material = node.material.clone();
      if ('roughness' in material && 'metalness' in material) {
        material.roughness = 0.34;
        material.metalness = Math.max(0.28, material.metalness);
        material.envMapIntensity = 1.2;
        node.material = material;
      }
    });
  }, [parts, finish]);
  // Each instance owns its cloned nodes. Geometry and materials are cached by the loader and must not be disposed by an instance.
  for (const part of parts) applyPartMatrix(part.root, state.partMatrices[part.id]);
  return <group dispose={null}>{parts.map(part => <primitive key={part.id} object={part.root} dispose={null}/>)}</group>;
}

function Bone({from, to, radius, color}: {from: V3; to: V3; radius: number; color: string}) {
  const a = new Vector3(...from), b = new Vector3(...to), direction = b.clone().sub(a);
  const length = direction.length();
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), length > 1e-8 ? direction.clone().normalize() : new Vector3(0, 1, 0));
  return <mesh position={a.add(b).multiplyScalar(0.5)} quaternion={quaternion} scale={[radius,Math.max(.005,length),radius]} castShadow receiveShadow>
    <cylinderGeometry args={[1,1,1,8]}/>
    <meshStandardMaterial color={color} roughness={0.8}/>
  </mesh>;
}

function Mannequin({object, state}: {object: SceneObject; state: EvaluatedObject}) {
  const p = evaluateActorSkeleton(object, state);
  const color = object.color ?? '#929ba4', ratio = (object.actor?.height ?? 1.75) / 1.75;
  const bones: [V3, V3, number][] = [
    [p.pelvis, p.chest, 0.13], [p.chest, p.neck, 0.11], [p.leftShoulder, p.rightShoulder, 0.07],
    [p.leftShoulder, p.leftElbow, 0.044], [p.leftElbow, p.leftHand, 0.036],
    [p.rightShoulder, p.rightElbow, 0.044], [p.rightElbow, p.rightHand, 0.036],
    [p.leftHip, p.leftKnee, 0.065], [p.leftKnee, p.leftFoot, 0.046],
    [p.rightHip, p.rightKnee, 0.065], [p.rightKnee, p.rightFoot, 0.046],
  ];
  return <group>
    {bones.map(([from, to, radius], i) => <Bone key={i} from={from} to={to} radius={radius * ratio} color={color}/>)}
    <mesh position={p.head} scale={[0.105 * ratio, 0.135 * ratio, 0.105 * ratio]} castShadow><sphereGeometry args={[1, 16, 12]}/><meshStandardMaterial color={color} roughness={0.8}/></mesh>
    {[p.leftElbow, p.rightElbow, p.leftKnee, p.rightKnee, p.leftHand, p.rightHand].map((point, i) => <mesh key={i} position={point} castShadow><sphereGeometry args={[0.048 * ratio, 10, 8]}/><meshStandardMaterial color={color} roughness={0.85}/></mesh>)}
    {[p.leftFoot, p.rightFoot].map((point, i) => <mesh key={i} position={[point[0], point[1] - 0.025 * ratio, point[2] + 0.055 * ratio]} castShadow receiveShadow><boxGeometry args={[0.1 * ratio, 0.065 * ratio, 0.22 * ratio]}/><meshStandardMaterial color={color} roughness={0.85}/></mesh>)}
  </group>;
}

function TextSurface({text, studio}: {text: string; studio?: boolean}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建屏幕文字贴图');
    ctx.fillStyle = studio ? '#101114' : '#e5e8e9'; ctx.fillRect(0, 0, 1024, 640);
    ctx.fillStyle = studio ? '#f5f5f5' : '#303a3c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines: string[] = [];
    ctx.font = '500 52px system-ui, sans-serif';
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (ctx.measureText(line + char).width > 880 && line) {lines.push(line); line = char;}
        else line += char;
      }
      lines.push(line);
    }
    const shown = lines.slice(0, 8), fontSize = Math.min(52, 480 / Math.max(1, shown.length));
    ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
    shown.forEach((line, i) => ctx.fillText(line, 512, 320 + (i - (shown.length - 1) / 2) * fontSize * 1.25));
    const result = new CanvasTexture(canvas); result.colorSpace = SRGBColorSpace;
    return result;
  }, [text, studio]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh><planeGeometry args={[1, 1]}/><meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false}/></mesh>;
}

function ImageSurface({url}: {url: string}) {
  const texture = useTexture(url);
  texture.colorSpace = SRGBColorSpace;
  return <mesh><planeGeometry args={[1, 1]}/><meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false}/></mesh>;
}

function Screen({object, state, project, assetUrl, studio}: {object: SceneObject; state: EvaluatedObject; project: PrevisProject; assetUrl: (file: string) => string; studio?: boolean}) {
  const asset = project.assets.find(a => a.id === (state.screen ?? object.screen?.assetId));
  if (asset?.kind === 'image') return <ImageSurface url={assetUrl(asset.file)}/>;
  // Video assets are intentionally identified as such; this first renderer supports image/text screens.
  const text = asset?.kind === 'video' ? `${asset.name}\n视频素材 · 暂用文字预演` : state.screen ?? object.screen?.text ?? '';
  return <TextSurface text={text} studio={studio}/>;
}

function SceneLight({object, state}: {object: SceneObject; state: EvaluatedObject}) {
  const target = useMemo(() => new Object3D(), []);
  if (!object.light) throw new Error(`灯光 ${object.name} 缺少配置`);
  // Light targets are explicit world positions, unlike the actor's local reach target.
  target.position.set(...object.light.target).applyMatrix4(transformMatrix(state.transform).invert());
  return <>
    <primitive object={target}/>
    {object.light.type === 'point'
      ? <pointLight intensity={object.light.intensity} color={object.light.color} castShadow shadow-mapSize={[1024, 1024]}/>
      : <directionalLight intensity={object.light.intensity} color={object.light.color} target={target} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4} shadow-camera-near={0.01} shadow-camera-far={100} shadow-bias={-0.00015}/>}
  </>;
}

function SceneItem({object, state, project, frame, assetUrl, helpers, selected, onSelect, finish}: {object: SceneObject; state: EvaluatedObject; project: PrevisProject; frame: EvaluatedFrame; assetUrl: (file: string) => string; helpers: boolean; selected: boolean; onSelect?: (id: string) => void; finish: string}) {
  const register = useContext(ObjectRegistryContext);
  const registerRoot = useCallback((node: Group | null) => {register?.(object.id, node);}, [register, object.id]);
  const asset = project.assets.find(a => a.id === object.assetId);
  const onClick = (event: ThreeEvent<MouseEvent>) => {event.stopPropagation(); onSelect?.(object.id);};
  const color = object.color ?? (object.kind === 'box' ? '#b7bec2' : '#d2d6d7');
  if (object.kind === 'model' && asset?.kind !== 'model') throw new Error(`模型对象 ${object.name} 的资源不存在`);
  return <group matrix={screenMountMatrix(project, frame, object)} matrixAutoUpdate={false}><group ref={registerRoot} name={`previs-object:${object.id}`} position={state.transform.position} rotation={radians(state.transform.rotation)} scale={state.transform.scale} visible={state.visible} onClick={onClick} userData={{previsObjectId: object.id}}>
    {object.kind === 'model' && asset?.kind === 'model' && <ProductModel asset={asset} object={object} state={state} assetUrl={assetUrl} finish={finish}/>}
    {object.kind === 'actor' && <Mannequin object={object} state={state}/>}
    {object.kind === 'box' && <mesh castShadow receiveShadow><boxGeometry args={[1, 1, 1]}/><meshStandardMaterial color={color} roughness={0.85}/></mesh>}
    {object.kind === 'plane' && finish === 'studio' && <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[1, 1]}/><shadowMaterial transparent opacity={0.5}/></mesh>}
    {object.kind === 'plane' && finish !== 'studio' && <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[1, 1]}/><meshStandardMaterial color={color} roughness={0.92} metalness={0.02} side={DoubleSide}/></mesh>}
    {object.kind === 'screen' && <Screen object={object} state={state} project={project} assetUrl={assetUrl} studio={finish === 'studio'}/>}
    {object.kind === 'light' && <SceneLight object={object} state={state}/>}
    {helpers && object.kind === 'light' && <mesh><sphereGeometry args={[0.055, 10, 8]}/><meshBasicMaterial color={selected ? '#168b9a' : '#bd8d3d'}/></mesh>}
    {helpers && selected && <axesHelper args={[0.2]}/>}
    {helpers && selected && (object.joints||[]).map(joint=>{
      const matrix=state.partMatrices[joint.affects[0]]?new Matrix4().fromArray(state.partMatrices[joint.affects[0]]):new Matrix4();
      const pivot=new Vector3(...joint.pivot).applyMatrix4(matrix),axis=new Vector3(...joint.axis).transformDirection(matrix).multiplyScalar(.09);
      const points=new Float32Array([...pivot.clone().sub(axis).toArray(),...pivot.clone().add(axis).toArray()]);
      return <group key={joint.id}><mesh position={pivot}><sphereGeometry args={[.014,10,8]}/><meshBasicMaterial color="#349eab" depthTest={false}/></mesh><line><bufferGeometry><bufferAttribute attach="attributes-position" args={[points,3]}/></bufferGeometry><lineBasicMaterial color="#349eab" depthTest={false}/></line></group>;
    })}
  </group></group>;
}

function CameraGuides({project, frame}: {project: PrevisProject; frame: EvaluatedFrame}) {
  const camera = useMemo(() => new PerspectiveCamera(), []);
  applyCameraPose(camera, frame.camera, project.width / project.height);
  camera.far = Math.min(10, Math.max(0.5, new Vector3(...frame.camera.position).distanceTo(new Vector3(...frame.camera.target))));
  camera.updateProjectionMatrix();
  const helper = useMemo(() => new CameraHelper(camera), [camera]);
  helper.update();
  const paths = useMemo(() => project.shots.map(shot => {
    const points = Array.from({length: 41}, (_, i) => evaluateProject(project, shot.start + i / 40 * Math.max(0, shot.end - shot.start - 1)).camera.position);
    return {id: shot.id, points, positions:new Float32Array(points.flat())};
  }), [project]);
  useEffect(() => () => helper.dispose(), [helper]);
  const lineArray = (points: V3[]) => new Float32Array(points.flat());
  return <group>
    <primitive object={helper}/>
    <mesh position={frame.camera.position} quaternion={camera.quaternion}><boxGeometry args={[0.12, 0.09, 0.12]}/><meshBasicMaterial color="#bc8735"/></mesh>
    <mesh position={frame.camera.target}><sphereGeometry args={[0.025, 10, 8]}/><meshBasicMaterial color="#bc8735"/></mesh>
    {paths.map(path => <line key={path.id}><bufferGeometry><bufferAttribute attach="attributes-position" args={[path.positions, 3]}/></bufferGeometry><lineBasicMaterial color={path.id === frame.shotId ? '#ad7b2d' : '#a3a9aa'} transparent opacity={path.id === frame.shotId ? 0.8 : 0.3}/></line>)}
  </group>;
}

/** Used unchanged inside ordinary R3F Canvas and Remotion ThreeCanvas. Suspense belongs to their wrapper. */
export function SceneContent({project, frame, assetUrl, helpers = false, selectedId, onSelect}: SceneContentProps) {
  const evaluated = typeof frame === 'number' ? evaluateProject(project, frame) : frame;
  const finish = project.film?.look === 'studio-black' ? 'studio' : project.film?.look === 'desk' ? 'desk' : 'clay';
  const hasFloor = project.objects.some(o => o.kind === 'plane' && evaluated.objects[o.id]?.visible);
  const hasLights = project.objects.some(o => o.kind === 'light' && evaluated.objects[o.id]?.visible);
  return <>
    {finish === 'studio' && <StudioRig/>}
    {finish === 'desk' && <DeskRig/>}
    {finish === 'clay' && <>
      <color attach="background" args={['#e3e6e7']}/>
      <ambientLight intensity={0.45}/>
      <hemisphereLight args={['#ffffff', '#abb4b7', 0.65]}/>
      {!hasLights && <directionalLight position={[3, 5, 4]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-bias={-0.00015}/>}
    </>}
    {finish !== 'studio' && !hasFloor && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]} receiveShadow><planeGeometry args={[30, 30]}/><meshStandardMaterial color="#c5cbcd" roughness={0.92}/></mesh>}
    {finish === 'studio' && !hasFloor && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} receiveShadow><planeGeometry args={[8, 8]}/><shadowMaterial transparent opacity={0.5}/></mesh>}
    {project.objects.map(object => {
      const state = evaluated.objects[object.id];
      if (!state) throw new Error(`缺少对象的求值状态：${object.id}`);
      return <SceneItem key={object.id} object={object} state={state} project={project} frame={evaluated} assetUrl={assetUrl} helpers={helpers} selected={selectedId === object.id} onSelect={onSelect} finish={finish}/>;
    })}
    {gradeEnabled(project.film?.look, project.film?.grade) && <StudioGrade focus={evaluated.camera.focusDistance} aperture={evaluated.camera.aperture}/>}
    {helpers && <CameraGuides project={project} frame={evaluated}/>}
  </>;
}

export default SceneContent;
