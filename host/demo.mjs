import {randomUUID} from 'node:crypto';
export const transform=(position=[0,0,0],rotation=[0,0,0],scale=[1,1,1])=>({position,rotation,scale});
export const camera=(position,target,focalLength=40)=>({position,target,focalLength,focusDistance:Math.hypot(...position.map((v,i)=>v-target[i])),aperture:8});
export function emptyProject(name='未命名预演'){
 const now=new Date().toISOString(),id=`previs-${randomUUID().slice(0,8)}`;
 return {schemaVersion:2,id,name,revision:1,fps:24,durationFrames:720,width:1920,height:1080,assets:[],objects:[{id:'floor',name:'地面',kind:'plane',transform:transform([0,-.012,0],[0,0,0],[8,.01,8]),visible:true,locked:true,color:'#bfc2c7'}],shots:[{id:'shot-01',name:'镜头 01',start:0,end:720,description:'添加产品，然后设置镜头起点与终点。',camera:{from:camera([2.5,1.8,3.2],[0,.9,0]),to:camera([2.5,1.8,3.2],[0,.9,0]),move:'static',easing:'smooth'}}],tracks:[],createdAt:now,updatedAt:now};
}
export function objectsForModel(asset){
 const product=asset.parts.filter(p=>!['set','computer'].includes(p.role)),set=asset.parts.filter(p=>p.role==='set'),computer=asset.parts.filter(p=>p.role==='computer');
 const center=product.length?product.reduce((a,p)=>a.map((v,i)=>v+p.center[i]/product.length),[0,0,0]):asset.bounds.min.map((v,i)=>(v+asset.bounds.max[i])/2);
 const origin=[center[0],Math.min(...product.map(p=>p.bounds.min[1])),center[2]];
 const objs=[{id:'product',name:'二代 AI 机械臂',kind:'model',assetId:asset.id,partIds:product.map(p=>p.id),sourceOrigin:origin,transform:transform(origin),visible:true,color:'#d7d9dc',joints:[],explodeDirections:{}}];
 if(set.length)objs.push({id:'desk',name:'办公桌 · 场景',kind:'model',assetId:asset.id,partIds:set.map(p=>p.id),sourceOrigin:[0,0,0],transform:transform(),visible:true,color:'#b9bdc4'});
 if(computer.length)objs.push({id:'computer',name:'桌面主机',kind:'model',assetId:asset.id,partIds:computer.map(p=>p.id),sourceOrigin:[0,0,0],transform:transform(),visible:true,color:'#b5bac2'});
 return objs;
}
export function mechanicalArmRig(asset,origin){
 const find=(txt)=>asset.parts.find(p=>p.label.includes(txt));const ids=(names)=>names.map(find).filter(Boolean).map(p=>p.id);
 const moving=['第一段','第二段','第三段','第四段','第五段','显示器固定支架','Studio Display'];
 const local=(p)=>p.map((v,i)=>v-origin[i]);
 const j=(id,label,parentId,pivot,axis,affects,minDeg,maxDeg)=>({id,label,...(parentId?{parentId}:{}),pivot:local(pivot),axis,minDeg,maxDeg,restAngle:0,affects:ids(affects)});
 return [
  j('base-yaw','底座转向',null,[-.32677,.86,0],[0,1,0],moving,-65,65),
  j('shoulder','下臂 · 俯仰','base-yaw',[-.32677,.914,0],[0,0,1],['第二段','第三段','第四段','第五段','显示器固定支架','Studio Display'],-25,25),
  j('elbow','上臂 · 俯仰','shoulder',[-.433,1.165,0],[0,0,1],['第三段','第四段','第五段','显示器固定支架','Studio Display'],-30,30),
  j('wrist','屏幕 · 俯仰','elbow',[-.10,1.315,0],[0,0,1],['第五段','显示器固定支架','Studio Display'],-35,35),
 ];
}
const key=(frame,value,easing='smooth')=>({frame,value,easing});
const track=(id,objectId,property,keys)=>({id,objectId,property,keys});
export function buildMechanicalDemo(asset){
 const p=emptyProject('二代 AI 机械臂 · 导演预演');p.assets=[asset];const objs=objectsForModel(asset),product=objs[0];
 product.joints=mechanicalArmRig(asset,product.sourceOrigin);
 for(const part of asset.parts.filter(q=>product.partIds.includes(q.id))){const d=part.center.map((v,i)=>v-product.sourceOrigin[i]);product.explodeDirections[part.id]=[d[0]<-.08?-.30:.20,.10+Math.max(0,d[1])*.55,part.nodeIndex%2===0?.22:-.22];}
 p.objects.push(...objs,{id:'actor',name:'使用者',kind:'actor',transform:transform([.50,0,.16],[0,-90,0]),visible:true,color:'#909aa7',actor:{height:1.72,pose:'standing',gesture:'neutral',target:[0,1.24,.46]}},{id:'chair',name:'座椅',kind:'box',transform:transform([.44,.405,.02],[0,0,0],[.42,.08,.46]),visible:true,color:'#a8adb5'},{id:'chair-back',name:'椅背',kind:'box',transform:transform([.67,.77,.02],[0,0,0],[.07,.6,.46]),visible:true,color:'#a8adb5'},{id:'screen-content',name:'屏幕 · 使用内容',kind:'screen',transform:transform([-.005,1.315,-.0005],[0,90,0],[.56,.31,1]),visible:true,screen:{text:'WORKSPACE',mount:{objectId:'product',partId:'node-69'}}},{id:'key-light',name:'主光',kind:'light',transform:transform([2.5,3.8,2]),visible:true,light:{type:'directional',intensity:3,target:[-.15,1,0],color:'#fff6eb'}});
 // Geometric/transform animation ranges are director-previs ranges, editable; not claimed as engineering limits.
 p.shots=[
  {id:'shot-01',name:'01 · 产品建立',start:0,end:120,description:'从桌面边缘升起，建立产品与使用空间。',camera:{from:camera([1.45,1.15,2.1],[-.15,1.03,0],42),to:camera([1.6,1.65,1.5],[-.18,1.15,0],42),move:'linear',easing:'smooth'}},
  {id:'shot-02',name:'02 · 人物入场',start:120,end:240,description:'人物走近并坐下，横移观察人与产品关系。',camera:{from:camera([2.35,1.6,-1.75],[.0,1.08,0],38),to:camera([1.95,1.38,-1.1],[.0,1.08,0],38),move:'linear',easing:'smooth'}},
  {id:'shot-03',name:'03 · 伸手与关节',start:240,end:384,description:'使用者伸手，机械臂转向并调整屏幕。关节范围为预演配置，可校准。',camera:{from:camera([1.35,1.5,-.95],[-.16,1.2,0],50),to:camera([1.08,1.52,-.60],[-.22,1.20,0],50),move:'linear',easing:'smooth'}},
  {id:'shot-04',name:'04 · 产品环绕',start:384,end:480,description:'屏幕转向，产品静态细节与空间环绕。',camera:{from:camera([1.25,1.8,-1.8],[-.22,1.16,0],50),to:camera([-1.55,1.75,-1.7],[-.22,1.16,0],50),move:'orbit',easing:'smooth'}},
  {id:'shot-05',name:'05 · 部件拆解',start:480,end:600,description:'零件离开装配位置并回装，检查结构节奏与遮挡。',camera:{from:camera([2,2.05,2.9],[-.2,1.5,0],40),to:camera([2.15,2.15,3.1],[-.2,1.5,0],40),move:'linear',easing:'smooth'}},
  {id:'shot-06',name:'06 · 收尾全景',start:600,end:720,description:'还原使用状态，产品与人物关系收尾。',camera:{from:camera([1.85,1.60,2.4],[-.08,1.12,0],42),to:camera([1.65,1.48,1.9],[-.08,1.12,0],42),move:'linear',easing:'smooth'}},
 ];
 const pos=product.transform.position;
 p.tracks=[
  track('actor-position','actor','position',[key(0,[.96,0,.4]),key(118,[.96,0,.4]),key(206,[.44,0,.02]),key(719,[.44,0,.02])]),
  track('actor-pose','actor','pose',[key(0,'standing'),key(120,'walking'),key(196,'walking'),key(232,'sitting'),key(719,'sitting')]),
  track('actor-gesture','actor','gesture',[key(0,'neutral'),key(224,'neutral'),key(276,'reach'),key(344,'reach'),key(382,'type'),key(719,'type')]),
  track('product-base','product','joint:base-yaw',[key(0,0),key(240,0),key(306,-18),key(366,-18),key(430,0),key(719,0)]),
  track('product-shoulder','product','joint:shoulder',[key(0,0),key(240,0),key(306,8),key(342,8),key(430,0),key(719,0)]),
  track('product-elbow','product','joint:elbow',[key(0,0),key(240,0),key(310,-10),key(346,-10),key(430,0),key(719,0)]),
  track('product-wrist','product','joint:wrist',[key(0,0),key(260,0),key(324,14),key(350,14),key(430,0),key(719,0)]),
  track('product-explode','product','explode',[key(0,0),key(480,0),key(530,1),key(548,1),key(599,0),key(719,0)]),
  track('product-position','product','position',[key(0,pos),key(394,pos),key(432,[pos[0],pos[1]+.04,pos[2]]),key(478,pos),key(719,pos)]),
  track('screen-text','screen-content','screen',[key(0,'WORKSPACE'),key(250,'FOCUS'),key(348,'CREATE'),key(599,'WORKSPACE')]),
  track('actor-vis','actor','visible',[key(0,0),key(119,0),key(120,1),key(479,1),key(480,0),key(599,0),key(600,1),key(719,1)]),
  track('screen-vis','screen-content','visible',[key(0,1),key(479,1),key(480,0),key(599,0),key(600,1),key(719,1)]),
 ];return p;
}
