/** Native, external and browser gestures share the same follower source. */
import {generatorCloud,generatorSelectedTrack,generatorCloudContact,generatorCloudSnapshot,generatorTouch,generatorRead,generatorCloud as cloudSelected} from './comp-generator.js';
import {cloudCoordinate,cloudPosition,readCloud,emptyCloud,cloudCells,cloudFade} from './cloud-view.js';
import {trailStyle} from './trail-settings.js';
import {sendPadLedFrame} from './led-cache.js';
import {appState} from '../app/state.js';
import {fontPrint} from '../font/index.js';
import {seqCmd,seqCmdFlush,engineReady,fieldEngineSet} from './engine.js';
import {syncPadRoute} from '../track/pad-route.js';
import {markUiStateDirty} from './ui-dirty.js';
let owner:number|null=null,lastRead=-Infinity,lastRefresh=-Infinity,snapshot=emptyCloud();
let paint:number[]=Array(32).fill(-1);
let cursorX=64,cursorY=64,wrap=false,flipped=false,lastDraw=-Infinity;
const held=new Map<number,{track:number;x:number;y:number;pressure:number}>();
export const cloudFieldKeys=['cg_x','cg_y','cg_axes','cg_edge','cg_explore','cg_seed','cg_bake','cg_restore'];
export function cloudParameters():any[]{return [
 ...['x','y'].map(field=>({key:'cg_'+field,name:'Draw '+field.toUpperCase(),short_name:field.toUpperCase(),type:'int',min:0,max:127,step:1,default:64})),
 {key:'cg_edge',name:'Field Boundary',short_name:'Edges',type:'enum',options:['Bounded','Wrap'],options_as_string:true,default:'Bounded'},
 {key:'cg_axes',name:'X / Y Axes',short_name:'Axes',type:'enum',options:['Activity / Pitch','Pitch / Activity'],short_options:['Act/Pitch','Pitch/Act'],options_as_string:true,default:'Activity / Pitch'}
];}
export function cloudSurfaceSnapshot():{wrap:boolean;flipped:boolean} {return {wrap,flipped};}
export function restoreCloudSurface(value:unknown):void {releaseCloud();const state=value as {wrap?:unknown;flipped?:unknown}|null;wrap=state?.wrap===true;flipped=state?.flipped===true;cursorX=cursorY=64;paint.fill(-1);appState.dirty=true;}
export function cloudInput(x:number,y:number):{x:number;y:number} {return cloudPosition({x,y},flipped);}
function contactInput(track:number,id:number,x:number,y:number,pressure:number,start=true):void {const position=cloudInput(x,y);generatorCloudContact(track,id,position.x,position.y,pressure,start);}
export function cloudSurfaceActive():boolean {return owner!==null;}
export function cloudRunning():boolean {return owner!==null&&generatorRead('cg_explore',owner)==='Stop';}
export function setCloudSurface(visible:boolean):void {
 const next=visible&&generatorCloud()?generatorSelectedTrack():null;
 if(next===owner)return;releaseCloud();owner=next;paint.fill(-1);snapshot=emptyCloud();lastRead=-Infinity;
 if(engineReady()){syncPadRoute(fieldEngineSet);if(next!==null){fieldEngineSet('joint_map','off');fieldEngineSet('joint_release','1');}}appState.dirty=true;
}
export function cloudRead(key:string):string|null {return key==='cg_x'?String(cursorX):key==='cg_y'?String(cursorY):key==='cg_edge'?(wrap?'Wrap':'Bounded'):key==='cg_axes'?(flipped?'Pitch / Activity':'Activity / Pitch'):null;}
export function cloudWrite(key:string,value:string):boolean|null {
 if(key==='cg_edge'){if(!['Wrap','Bounded'].includes(value))return false;wrap=value==='Wrap';markUiStateDirty();return true;}
 if(key==='cg_axes'){if(!['Activity / Pitch','Pitch / Activity'].includes(value))return false;releaseCloud();flipped=value==='Pitch / Activity';paint.fill(-1);markUiStateDirty();appState.dirty=true;return true;}
 if(!['cg_x','cg_y'].includes(key))return null;
 const number=Number(value);if(!Number.isFinite(number)||!cloudSelected())return false;
 if(key==='cg_x')cursorX=cloudCoordinate(Math.round(number),wrap);else cursorY=cloudCoordinate(Math.round(number),wrap);
 lastDraw=Date.now();const track=generatorSelectedTrack();contactInput(track,112,cursorX,cursorY,100);held.set(112,{track,x:cursorX,y:cursorY,pressure:100});appState.dirty=true;return true;
}
/** Turn path retains overshoot; enum/int widgets otherwise clamp before writing. */
export function cloudTurn(key:string,delta:number):boolean {
 if(!['cg_x','cg_y'].includes(key))return false;cloudWrite(key,String((key==='cg_x'?cursorX:cursorY)+delta));return true;
}
export function cloudPad(source:string,index:number,down:boolean,height=4,pressure=100):boolean {
 const offset=source==='move'?0:source==='launchpad'?32:96;
 const id=offset+index;
 if(!down){const contact=held.get(id);if(contact){contactInput(contact.track,id,contact.x,contact.y,0);held.delete(id);return true;}return cloudSurfaceActive();}
 if(owner===null||index<0||index>=height*8||!Number.isInteger(index))return false;
 const contact={track:owner,x:Math.round(index%8*127/7),y:Math.round(Math.floor(index/8)*127/(height-1)),pressure};
 held.set(id,contact);contactInput(owner,id,contact.x,contact.y,pressure);appState.dirty=true;return true;
}
export function releaseCloud(source?:string):void {
 for(const [id,contact] of held){if(source&&(source==='move'?id>=32:source==='launchpad'?id<32||id>=96:id<96))continue;contactInput(contact.track,id,contact.x,contact.y,0);held.delete(id);}
}
export function cloudMidi(data:number[]):boolean {
 const type=data[0]&240,key=data[1],value=data[2];
 if(key>=68&&key<100&&[128,144,160].includes(type)){
  if(type===160){const contact=held.get(key-68);if(contact){contact.pressure=value;contactInput(contact.track,key-68,contact.x,contact.y,value);}return cloudSurfaceActive();}
  return cloudPad('move',key-68,type===144&&value>0,4,value);
 }
 if(!cloudSurfaceActive())return false;
 if(type===176&&key===58){if(value){releaseCloud();generatorTouch('cg_explore',owner!,true);}return true;}
 return false;
}
export function tickCloud(now=Date.now()):void {
 if(held.has(112)&&now-lastDraw>300){const contact=held.get(112)!;contactInput(contact.track,112,contact.x,contact.y,0);held.delete(112);}
 if(now-lastRefresh>=250){lastRefresh=now;for(const [id,contact] of held)contactInput(contact.track,id,contact.x,contact.y,contact.pressure,false);}
 if(owner===null)return;
 if(now-lastRead<80)return;lastRead=now;
 const next=readCloud(generatorCloudSnapshot(owner));if(next){snapshot=next;appState.dirty=true;}
}
export function cloudColors(height=4):number[]{return cloudCells(snapshot,8,height,trailStyle().settings,flipped);}
export function paintCloud(force=false):boolean {if(force)paint.fill(-1);const colors=cloudColors(),changes=colors.flatMap((color,index)=>color===paint[index]?[]:[{note:68+index,color}]);for(const change of sendPadLedFrame(changes))paint[change.note-68]=change.color;return colors.every((color,index)=>paint[index]===color);}
export function drawCloud():void {
 fill_rect(0,11,128,46,0);const settings=trailStyle().settings;
 for(const point of [...snapshot.trails,...snapshot.grains].map(point=>cloudPosition(point,flipped))){
  const level=cloudFade(point,settings);if(level<.05)continue;
  const x=Math.round(point.x*123)+2,y=53-Math.round(point.y*38);
  fill_rect(x,y,level>.5?2:1,level>.5?2:1,1);
 }
 for(const point of snapshot.contacts.map(point=>cloudPosition(point,flipped))){const x=Math.round(point.x*123)+2,y=53-Math.round(point.y*38);fill_rect(x-1,y,3,1,1);fill_rect(x,y-1,1,3,1);}
 fontPrint(1,56,Date.now()-lastDraw<1500?`X ${cursorX} Y ${cursorY} ${wrap?'Wrap':'Bounded'}`:flipped?'X Pitch / Y Probability':'X Probability / Y Pitch',1);
}

export function clearCloud():void {releaseCloud();if(owner!==null&&engineReady()){seqCmd(`gcloud ${owner} clear`);seqCmdFlush();snapshot=emptyCloud();appState.dirty=true;}}
