import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {PrevisComposition,type RenderProps} from './Composition';
const empty={schemaVersion:2,id:'empty',name:'empty',revision:1,fps:24,durationFrames:24,width:1920,height:1080,assets:[],objects:[],shots:[],tracks:[],createdAt:'2026-11-11',updatedAt:'2026-11-11'} as const;
function Root(){return <Composition id="ProductPrevis" component={PrevisComposition} width={1920} height={1080} fps={24} durationInFrames={24} defaultProps={{project:empty,assetBase:''} as unknown as RenderProps} calculateMetadata={({props})=>({width:props.project.width,height:props.project.height,fps:props.outputFps||props.project.fps,durationInFrames:props.outputFrames||props.project.durationFrames})}/>;}
registerRoot(Root);
