import {useFrame, useThree} from '@react-three/fiber';
import {useLayoutEffect, useRef} from 'react';
import {BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, RenderPass} from 'postprocessing';
import {PMREMGenerator, UnsignedByteType} from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';

/** FrameReady calls this after the canvas exists, because Remotion's frameloop is "never". */
export let paintGrade: (() => void) | null = null;

export function gradeEnabled(look: string | undefined, grade: boolean | undefined): boolean {
  if (look !== 'studio-black' || grade === false) return false;
  try { if (process.env.PREVIS_GRADE === '0') return false; } catch { return true; }
  return true;
}

export function StudioGrade({focus, aperture}: {focus: number; aperture: number}) {
  const {gl, scene, camera, size} = useThree();
  const composer = useRef<EffectComposer | null>(null);
  useLayoutEffect(() => {
    const effect = new EffectComposer(gl, {multisampling: 0, frameBufferType: UnsignedByteType});
    effect.addPass(new RenderPass(scene, camera));
    const dof = new DepthOfFieldEffect(camera, {
      focusDistance: Math.max(0.25, focus),
      focusRange: Math.max(0.35, focus * (aperture / 5)),
      bokehScale: aperture <= 3.2 ? 2.4 : aperture <= 5 ? 1.5 : 0.7,
      resolutionScale: 0.5,
    });
    const bloom = new BloomEffect({intensity: 0.35, luminanceThreshold: 0.82, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.4});
    effect.addPass(new EffectPass(camera, dof, bloom));
    effect.setSize(size.width, size.height);
    composer.current = effect;
    paintGrade = () => effect.render();
    return () => { if (paintGrade === effect.render) paintGrade = null; else paintGrade = null; effect.dispose(); composer.current = null; };
  }, [gl, scene, camera, focus, aperture, size.width, size.height]);
  useFrame(() => { composer.current?.setSize(size.width, size.height); composer.current?.render(); }, 1);
  return null;
}

export function StudioRig() {
  const {gl, scene} = useThree();
  useLayoutEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = texture;
    scene.environmentIntensity = 0.18;
    return () => { scene.environment = null; scene.environmentIntensity = 1; texture.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return <>
    <color attach="background" args={['#000000']}/>
    <ambientLight intensity={0.08}/>
    <directionalLight position={[1.8, 2.6, 1.4]} intensity={2.4} color="#fff5ee" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-near={0.2} shadow-camera-far={8} shadow-camera-left={-1.4} shadow-camera-right={1.4} shadow-camera-top={1.6} shadow-camera-bottom={-1.2} shadow-bias={-0.0004}/>
    <directionalLight position={[-2.2, 1.6, -1.1]} intensity={5.5} color="#b9d4ff"/>
    <directionalLight position={[1.4, 1.1, -1.8]} intensity={2.4} color="#ffd0a8"/>
  </>;
}

export function DeskRig() {
  return <>
    <color attach="background" args={['#d7d2cb']}/>
    <ambientLight intensity={0.35}/>
    <hemisphereLight args={['#fff6ea', '#8d8478', 0.45]}/>
    <directionalLight position={[2.2, 3.4, 1.6]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0003}/>
  </>;
}
