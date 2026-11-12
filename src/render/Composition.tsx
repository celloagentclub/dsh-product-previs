import React,{Suspense,useEffect,useLayoutEffect,useState} from 'react';
import {AbsoluteFill,Audio,Img,Sequence,useCurrentFrame,useVideoConfig,delayRender,continueRender,cancelRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import {PerspectiveCamera,Vector3} from 'three';
import {SceneContent} from '../stage/SceneContent';
import {paintGrade} from '../stage/studioLook';
import {applyCameraPose} from '../stage/camera';
import {activeShot, evaluateProject} from '../core/evaluate';
import type {PrevisProject,CameraPose} from '../core/types';
import {BrollFrame} from './Broll';
export interface RenderProps extends Record<string,unknown> {project:PrevisProject;assetBase:string;frameOffset?:number;sourceFps?:number;outputFps?:number;outputFrames?:number;usePlates?:boolean}
function Camera({pose,aspect,studio}:{pose:CameraPose;aspect:number;studio:boolean}){const {camera}=useThree();useLayoutEffect(()=>{const view=camera as PerspectiveCamera;applyCameraPose(view,pose,aspect);if(studio){view.near=0.05;view.far=18;view.updateProjectionMatrix();}},[camera,pose,aspect,studio]);return null;}
function AssetPending(){const [handle]=useState(()=>delayRender('正在准备三维产品资源',{timeoutInMilliseconds:120000}));useEffect(()=>()=>continueRender(handle),[handle]);return null;}
/** R3F frameloop=never must draw again AFTER Suspense resolves, including static frame zero. */
function FrameReady({frame}:{frame:number}){const {gl,scene,camera}=useThree();useLayoutEffect(()=>{const handle=delayRender(`等待三维场景第 ${frame} 帧绘制`,{timeoutInMilliseconds:120000});let live=true;let a=0,b=0;const draw=()=>{if(paintGrade)paintGrade();else gl.render(scene,camera);};a=requestAnimationFrame(()=>{if(!live)return;try{draw();b=requestAnimationFrame(()=>{if(!live)return;try{draw();gl.getContext().finish();continueRender(handle);}catch(e){cancelRender(e);}});}catch(e){cancelRender(e);}});return()=>{live=false;cancelAnimationFrame(a);cancelAnimationFrame(b);continueRender(handle);};},[frame,gl,scene,camera]);return null;}
export function PrevisComposition({project,assetBase,frameOffset=0,sourceFps,usePlates}:RenderProps){
 const frame=useCurrentFrame(),config=useVideoConfig();
 const sourceFrame=Math.min(project.durationFrames-1,Math.round((frame/config.fps)*(sourceFps||project.fps))+frameOffset);
 const shot=activeShot(project,sourceFrame);
 const state=evaluateProject(project,sourceFrame);
 const assetUrl=(file:string)=>`${assetBase}&file=${encodeURIComponent(file)}`;
 const audio=project.audio&&project.assets.find(a=>a.id===project.audio?.assetId);
 const audioNode=audio&&project.audio?<Sequence from={Math.round(project.audio.startFrame*config.fps/project.fps)}><Audio src={assetUrl(audio.file)} trimBefore={Math.round(project.audio.trimStart*config.fps)} volume={project.audio.gain}/></Sequence>:null;
 const studio=project.film?.look==='studio-black';
 if(shot.kind==='broll-code') return <AbsoluteFill style={{background:'#000'}}><BrollFrame shot={shot} frame={sourceFrame}/>{audioNode}</AbsoluteFill>;
 if(usePlates) return <AbsoluteFill style={{background:'#000'}}><Img src={assetUrl(`output/plates/${String(sourceFrame).padStart(4,'0')}.png`)}/>{audioNode}</AbsoluteFill>;
 const background=studio?'#000':project.film?.look==='desk'?'#d7d2cb':'#c9cdd3';
 return <AbsoluteFill style={{background}}><ThreeCanvas width={config.width} height={config.height} shadows camera={{position:state.camera.position,near:.05,far:studio?18:300}} gl={{antialias:true,preserveDrawingBuffer:true}} dpr={1}><Camera pose={state.camera} aspect={config.width/config.height} studio={studio}/><Suspense fallback={<AssetPending/>}><SceneContent project={project} frame={state} assetUrl={assetUrl} helpers={false}/><FrameReady frame={sourceFrame}/></Suspense></ThreeCanvas>{audioNode}</AbsoluteFill>;
}
