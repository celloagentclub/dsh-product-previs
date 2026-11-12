import {Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ErrorInfo, ReactNode} from 'react';
import {Canvas, useThree} from '@react-three/fiber';
import {OrbitControls, TransformControls} from '@react-three/drei';
import {Box3, Group, MathUtils, Matrix4, Object3D, PerspectiveCamera, Quaternion, Euler, Vector3} from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import type {CameraPose, EvaluatedFrame, PrevisProject, Transform, V3} from '../core/types';
import {SceneContent, ObjectRegistryContext} from './SceneContent';
import {applyCameraPose} from './camera';
import './stage.css';

export interface StageViewportProps {
  project: PrevisProject;
  frame: EvaluatedFrame;
  mode: 'stage' | 'camera';
  assetUrl: (file: string) => string;
  selectedId?: string;
  tool?: 'select' | 'translate' | 'rotate';
  showHelpers?: boolean;
  viewPreset?: 'perspective' | 'front' | 'side' | 'top';
  onSelect?: (id: string) => void;
  onTransformCommit?: (id: string, transform: Transform) => void;
  onObserverPose?: (pose: CameraPose) => void;
}

class ResourceBoundary extends Component<{children: ReactNode; resetKey: string}, {error: string | null}> {
  state = {error: null as string | null};
  static getDerivedStateFromError(error: Error) {return {error: error.message || String(error)};}
  componentDidCatch(error: Error, _info: ErrorInfo) {console.error('预演资源加载失败', error);}
  componentDidUpdate(previous: Readonly<{children: ReactNode; resetKey: string}>) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({error: null});
  }
  render() {
    if (this.state.error) return <div className="previs-stage-message previs-stage-error" role="alert"><strong>三维资源无法载入</strong><span>{this.state.error}</span><span>请检查项目资源路径，或重新导入模型后重试。</span><button type="button" onClick={() => this.setState({error: null})}>重新载入视口</button></div>;
    return this.props.children;
  }
}

function LoadingSignal({setLoading}: {setLoading: (value: boolean) => void}) {
  useEffect(() => {setLoading(true); return () => setLoading(false);}, [setLoading]);
  return null;
}

function ReadySignal({setLoading}: {setLoading: (value: boolean) => void}) {
  useEffect(() => setLoading(false), [setLoading]);
  return null;
}

function transformMatrix(transform: Transform) {
  return new Matrix4().compose(new Vector3(...transform.position), new Quaternion().setFromEuler(new Euler(...transform.rotation.map(MathUtils.degToRad) as V3)), new Vector3(...transform.scale));
}

function initialObserver(project: PrevisProject, frame: EvaluatedFrame): {position: V3; target: V3} {
  const box = new Box3();
  for (const object of project.objects) {
    const state = frame.objects[object.id];
    if (!state?.visible || ['light', 'plane'].includes(object.kind)) continue;
    const matrix = transformMatrix(state.transform);
    const asset = project.assets.find(a => a.id === object.assetId);
    if (object.kind === 'model' && asset?.kind === 'model') {
      const origin = new Vector3(...(object.sourceOrigin ?? [0, 0, 0]));
      const selected = object.partIds ?? asset.parts.map(p => p.id);
      for (const part of asset.parts) if (selected.includes(part.id)) {
        const local = new Box3(new Vector3(...part.bounds.min).sub(origin), new Vector3(...part.bounds.max).sub(origin));
        box.union(local.applyMatrix4(matrix));
      }
    } else {
      const h = object.kind === 'actor' ? object.actor?.height ?? 1.75 : 1;
      box.union(new Box3(new Vector3(-0.35, 0, -0.35), new Vector3(0.35, h, 0.35)).applyMatrix4(matrix));
    }
  }
  if (box.isEmpty()) box.set(new Vector3(-1, 0, -1), new Vector3(1, 1.8, 1));
  const center = box.getCenter(new Vector3()), size = box.getSize(new Vector3());
  const span = Math.max(1.5, size.x, size.y, size.z);
  return {position: [center.x + span * 1.2, center.y + span * 0.75, center.z + span * 1.4], target: center.toArray() as V3};
}

function ViewControls({project, frame, mode, selectedId, tool, viewPreset, roots, rootsVersion, observer, onTransformCommit, onObserverPose}: Pick<StageViewportProps, 'project' | 'frame' | 'mode' | 'selectedId' | 'tool' | 'viewPreset' | 'onTransformCommit' | 'onObserverPose'> & {roots: Map<string, Group>; rootsVersion: number; observer: {position: V3; target: V3}}) {
  const {camera, invalidate, size} = useThree();
  const orbit = useRef<OrbitControlsImpl>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Object3D>();
  const stagePose = useRef<{position: V3; target: V3}>({position: observer.position, target: observer.target});
  const lastMode = useRef(mode);
  const authored = project.objects.find(o => o.id === selectedId);
  const eligible = selectedId && authored && !authored.locked && frame.objects[selectedId]?.visible && tool !== 'select';
  useLayoutEffect(() => {setSelected(selectedId ? roots.get(selectedId) : undefined);}, [selectedId, roots, rootsVersion, project.objects]);
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    if (mode === 'camera') applyCameraPose(camera, frame.camera, project.width / project.height);
    else if (lastMode.current !== 'stage') {
      camera.up.set(0, 1, 0);
      camera.position.set(...stagePose.current.position);
      camera.lookAt(new Vector3(...stagePose.current.target));
      camera.aspect = size.width / size.height;
      camera.fov = 42; camera.updateProjectionMatrix();
      orbit.current?.target.set(...stagePose.current.target); orbit.current?.update();
    }
    lastMode.current = mode;
    invalidate();
  }, [mode, frame.camera, project.width, project.height, camera, invalidate]);
  const reportObserver = useCallback(() => {
    if (mode !== 'stage' || !(camera instanceof PerspectiveCamera) || !orbit.current) return;
    const position = camera.position.toArray() as V3, target = orbit.current.target.toArray() as V3;
    stagePose.current = {position, target};
    onObserverPose?.({position, target, focalLength: camera.getFocalLength(), focusDistance: camera.position.distanceTo(orbit.current.target), aperture: 8, roll: 0});
  }, [camera, mode, onObserverPose]);
  useEffect(() => {if (mode === 'stage') reportObserver();}, [mode, reportObserver]);
  useEffect(() => {
    if(mode!=='stage'||!viewPreset||!orbit.current)return;
    const c=new Vector3(...observer.target),distance=new Vector3(...observer.position).distanceTo(c);
    const offset=viewPreset==='front'?new Vector3(distance,0,0):viewPreset==='side'?new Vector3(0,0,distance):viewPreset==='top'?new Vector3(0,distance,.0001):new Vector3(...observer.position).sub(c);
    camera.up.set(0,1,0);camera.position.copy(c.clone().add(offset));camera.lookAt(c);orbit.current.target.copy(c);orbit.current.update();reportObserver();invalidate();
  }, [viewPreset,mode]);
  const commit = useCallback(() => {
    setDragging(false);
    if (orbit.current) orbit.current.enabled = true;
    if (!selectedId || !selected) return;
    const rotation = new Euler().setFromQuaternion(selected.quaternion, 'XYZ');
    const transform: Transform = {position: selected.position.toArray() as V3, rotation: [rotation.x, rotation.y, rotation.z].map(MathUtils.radToDeg) as V3, scale: selected.scale.toArray() as V3};
    if ([...transform.position, ...transform.rotation, ...transform.scale].every(Number.isFinite)) onTransformCommit?.(selectedId, transform);
    invalidate();
  }, [selectedId, selected, onTransformCommit, invalidate]);
  return <>
    {mode === 'stage' && <OrbitControls ref={orbit} makeDefault target={observer.target} enabled={!dragging} enableDamping dampingFactor={0.12} minDistance={0.1} maxDistance={10000} onChange={reportObserver} onEnd={reportObserver}/>}
    {mode === 'stage' && eligible && selected && <TransformControls object={selected} mode={tool === 'rotate' ? 'rotate' : 'translate'} space="world" size={0.8} onMouseDown={() => {setDragging(true); if (orbit.current) orbit.current.enabled = false;}} onMouseUp={commit}/>}
  </>;
}

/** Observer navigation never writes the authored shooting camera. Camera mode has no guides or gizmos. */
export function StageViewport({project, frame, mode, assetUrl, selectedId, tool = 'select', showHelpers = true, viewPreset, onSelect, onTransformCommit, onObserverPose}: StageViewportProps) {
  const container = useRef<HTMLDivElement>(null);
  const roots = useMemo(() => new Map<string, Group>(), [project.id]);
  const [rootsVersion, setRootsVersion] = useState(0);
  const register = useCallback((id: string, object: Group | null) => {
    if (roots.get(id) === object || (!object && !roots.has(id))) return;
    if (object) roots.set(id, object); else roots.delete(id);
    setRootsVersion(version => version + 1);
  }, [roots]);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState({width: 0, height: 0});
  // Initial framing is project-scoped; scrubbing and changing shots preserve the observer's view.
  const observer = useMemo(() => initialObserver(project, frame), [project.id]);
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    const observer = new ResizeObserver(entries => {const {width, height} = entries[0].contentRect; setSize({width, height});});
    observer.observe(target); return () => observer.disconnect();
  }, []);
  const ratio = project.width / project.height;
  const monitorWidth = mode === 'camera' && size.width && size.height ? Math.min(size.width, size.height * ratio) : undefined;
  const resetKey = `${project.id}:${project.assets.map(a => `${a.id}:${a.file}`).join('|')}`;
  return <div ref={container} className={`previs-stage-viewport previs-stage-${mode}`} aria-label={mode === 'stage' ? '三维场景观察视图' : '拍摄机位监看'}>
    <ResourceBoundary resetKey={resetKey}>
      <div className="previs-stage-canvas" style={monitorWidth ? {width: monitorWidth, height: monitorWidth / ratio} : {width: '100%', height: '100%'}}>
        <Canvas key={project.id} shadows dpr={1} onCreated={({gl})=>{const w=window as unknown as {__previsDebug?:Record<string,unknown>};w.__previsDebug??={};w.__previsDebug[mode]=gl;}} camera={{position: observer.position, fov: 42, near: 0.01, far: 100000}} gl={{antialias: true, alpha: false}}>
          <ObjectRegistryContext.Provider value={register}>
            <Suspense fallback={<LoadingSignal setLoading={setLoading}/>}>
              <SceneContent project={project} frame={frame} assetUrl={assetUrl} helpers={mode === 'stage' && showHelpers} selectedId={selectedId} onSelect={onSelect}/>
              <ReadySignal setLoading={setLoading}/>
              <ViewControls project={project} frame={frame} mode={mode} selectedId={selectedId} tool={tool} viewPreset={viewPreset} roots={roots} rootsVersion={rootsVersion} observer={observer} onTransformCommit={onTransformCommit} onObserverPose={onObserverPose}/>
            </Suspense>
          </ObjectRegistryContext.Provider>
        </Canvas>
      </div>
      {loading && <div className="previs-stage-message" role="status" aria-live="polite"><strong>正在载入白模与素材…</strong><span>资源就绪后显示真实场景。</span></div>}
    </ResourceBoundary>
  </div>;
}

export default StageViewport;
