import React,{Suspense,useEffect,useLayoutEffect,useState} from 'react';
import {AbsoluteFill,Audio,Sequence,useCurrentFrame,useVideoConfig,delayRender,continueRender,cancelRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import {PerspectiveCamera,Vector3} from 'three';
import {SceneContent} from '../stage/SceneContent';
import {applyCameraPose} from '../stage/camera';
import {evaluateProject} from '../core/evaluate';
import type {PrevisProject,CameraPose} from '../core/types';
export interface RenderProps extends Record<string,unknown> {project:PrevisProject;assetBase:string;frameOffset?:number;sourceFps?:number;outputFps?:number;outputFrames?:number}
function Camera({pose,aspect}:{pose:CameraPose;aspect:number}){const {camera}=useThree();useLayoutEffect(()=>{applyCameraPose(camera as PerspectiveCamera,pose,aspect);},[camera,pose,aspect]);return null;}
/** Music fades are authored in seconds and converted with the real output fps. */
function MusicLayer({src,trimStart,gain,fadeIn,fadeOut}:{src:string;trimStart:number;gain:number;fadeIn:number;fadeOut:number}){
 const frame=useCurrentFrame();
 const {fps,durationInFrames}=useVideoConfig();
 const inFade=fadeIn>0?Math.min(1,frame/(fadeIn*fps)):1;
 const outFade=fadeOut>0?Math.min(1,Math.max(0,(durationInFrames-frame-1)/(fadeOut*fps))):1;
 const volume=Math.max(0,Math.min(1,gain*Math.min(inFade,outFade)));
 return <Audio src={src} trimBefore={Math.round(trimStart*fps)} volume={volume}/>;
}
function AssetPending(){const [handle]=useState(()=>delayRender('正在准备三维产品资源',{timeoutInMilliseconds:120000}));useEffect(()=>()=>continueRender(handle),[handle]);return null;}
/** R3F frameloop=never must draw again AFTER Suspense resolves, including static frame zero. */
function FrameReady({frame}:{frame:number}){const {gl,scene,camera}=useThree();useLayoutEffect(()=>{const handle=delayRender(`等待三维场景第 ${frame} 帧绘制`,{timeoutInMilliseconds:120000});let live=true;let a=0,b=0;a=requestAnimationFrame(()=>{if(!live)return;try{gl.render(scene,camera);b=requestAnimationFrame(()=>{if(!live)return;try{gl.render(scene,camera);gl.getContext().finish();continueRender(handle);}catch(e){cancelRender(e);}});}catch(e){cancelRender(e);}});return()=>{live=false;cancelAnimationFrame(a);cancelAnimationFrame(b);continueRender(handle);};},[frame,gl,scene,camera]);return null;}
export function PrevisComposition({project,assetBase,frameOffset=0,sourceFps}:RenderProps){
 const frame=useCurrentFrame(),config=useVideoConfig();
 const sourceFrame=Math.min(project.durationFrames-1,Math.round((frame/config.fps)*(sourceFps||project.fps))+frameOffset);
 const state=evaluateProject(project,sourceFrame);
 const assetUrl=(file:string)=>`${assetBase}&file=${encodeURIComponent(file)}`;
 const audio=project.audio&&project.assets.find(a=>a.id===project.audio?.assetId);
 return <AbsoluteFill style={{background:'#c9cdd3'}}><ThreeCanvas width={config.width} height={config.height} shadows camera={{position:state.camera.position,near:.005,far:300}} gl={{antialias:true,preserveDrawingBuffer:true}} dpr={1}><Camera pose={state.camera} aspect={config.width/config.height}/><Suspense fallback={<AssetPending/>}><SceneContent project={project} frame={state} assetUrl={assetUrl} helpers={false}/><FrameReady frame={sourceFrame}/></Suspense></ThreeCanvas>{audio&&project.audio?<Sequence from={Math.round(project.audio.startFrame*config.fps/project.fps)}><MusicLayer src={assetUrl(audio.file)} trimStart={project.audio.trimStart} gain={project.audio.gain} fadeIn={project.audio.fadeIn??0} fadeOut={project.audio.fadeOut??0}/></Sequence>:null}</AbsoluteFill>;
}
