/** Native, external and browser gestures share the same follower source. */
import {generatorCloud,generatorSelectedTrack,generatorCloudContact,generatorCloudSnapshot,generatorCloudHeld,generatorCloudHold,generatorCloudHoldState,generatorCloudShift,generatorCloudShiftXY,generatorCloudCenter,type CloudHoldState,generatorTouch,generatorRead,generatorCloud as cloudSelected} from './comp-generator.js';
import {cloudCoordinate,cloudPosition,readCloud,emptyCloud,cloudCells,cloudFade} from './cloud-view.js';
import {trailStyle} from './trail-settings.js';
import {sendPadLedFrame} from './led-cache.js';
import {appState} from '../app/state.js';
import {fontPrint} from '../font/index.js';
import {seqCmd,seqCmdFlush,engineReady,fieldEngineSet} from './engine.js';
import {syncPadRoute} from '../track/pad-route.js';
import {markUiStateDirty} from './ui-dirty.js';
import {cloudPressureSnapshot,restoreCloudPressure,cloudPressureRead,cloudPressureWrite,cloudPressureParameters,type CloudPressure} from './cloud-pressure.js';
import {EXPRESSION_MAX} from './expression-input.js';
let owner:number|null=null,lastRead=-Infinity,lastRefresh=-Infinity,snapshot=emptyCloud();
let holding=false;
let holdRead=-Infinity,holdTrack=-1,holdState:CloudHoldState|null=null;
export function cloudHoldState(track=generatorSelectedTrack()):CloudHoldState|null {
 const now=Date.now();if(track!==holdTrack||now<holdRead||now-holdRead>=80){holdTrack=track;holdRead=now;holdState=generatorCloudHoldState(track);}return holdState;
}
function invalidateHold():void {holdRead=-Infinity;}
export function cloudHoldPosition():{x:number;y:number}|null {const state=cloudHoldState();return state?cloudPosition({x:state.x,y:state.y},flipped):null;}
let paint:number[]=Array(32).fill(-1);
let cursorX=8256,cursorY=8256,drawPressure=100,wrap=false,flipped=false,lastDraw=-Infinity;
let activity:'Probability'|'Rate'='Probability';
const held=new Map<number,{track:number;x:number;y:number;pressure:number}>();
const pendingPressure=new Set<number>();
export const cloudFieldKeys=['cg_x','cg_y','cg_axes','cg_edge','cg_activity','cg_pressure','cg_bake','cg_restore'];
export const cloudPressureKeys=['cg_pressure','cg_pressure_target','cg_pressure_curve','cg_pressure_direction','cg_pressure_low','cg_pressure_high','cg_axes','cg_activity'];
export const cloudHoldKeys=['cg_hold_x','cg_hold_y','cg_edge','cg_axes','cg_hold','cg_hold_center','cg_bake','cg_restore'];
export function cloudParameters():any[]{return [
 ...['x','y'].map(axis=>({key:'cg_hold_'+axis,name:'Move Held '+axis.toUpperCase(),short_name:'Hold '+axis.toUpperCase(),type:'float',min:-127,max:127,step:1,default:0})),
 {key:'cg_hold',name:'Hold Cloud',short_name:'Hold',type:'enum',options:['Off','On'],options_as_string:true,default:'Off'},
 {key:'cg_hold_center',name:'Center Held Cloud',short_name:'Center',type:'string',readOnly:true},
 ...cloudPressureParameters(),
 ...['x','y'].map(field=>({key:'cg_'+field,name:'Draw '+field.toUpperCase(),short_name:field.toUpperCase(),type:'float',min:0,max:127,step:1,default:64})),
 {key:'cg_pressure',name:'Draw Pressure',short_name:'Pressure',type:'int',min:1,max:127,step:1,default:100},
 {key:'cg_edge',name:'Field Boundary',short_name:'Edges',type:'enum',options:['Bounded','Wrap'],options_as_string:true,default:'Bounded'},
 {key:'cg_activity',name:'Field Activity',short_name:'Activity',type:'enum',options:['Probability','Rate'],short_options:['Prob','Rate'],options_as_string:true,default:'Probability'},
 {key:'cg_axes',name:'X / Y Axes',short_name:'Axes',type:'enum',options:['Activity / Pitch','Pitch / Activity'],short_options:['Act/Pitch','Pitch/Act'],options_as_string:true,default:'Activity / Pitch'}
];}
export function cloudSurfaceSnapshot():{wrap:boolean;flipped:boolean;activity:string;pressure:number;response:CloudPressure} {return {wrap,flipped,activity,pressure:drawPressure,response:cloudPressureSnapshot()};}
export function restoreCloudSurface(value:unknown):void {releaseCloud();const state=value as {wrap?:unknown;flipped?:unknown;activity?:unknown;pressure?:unknown;response?:unknown}|null;restoreCloudPressure(state?.response);wrap=state?.wrap===true;flipped=state?.flipped===true;activity=state?.activity==='Rate'?'Rate':'Probability';drawPressure=typeof state?.pressure==='number'&&Number.isInteger(state.pressure)&&state.pressure>=1&&state.pressure<=127?state.pressure:100;cursorX=cursorY=8256;paint.fill(-1);appState.dirty=true;}
export function cloudInput(x:number,y:number):{x:number;y:number} {return cloudPosition({x,y},flipped);}
function contactInput(track:number,id:number,x:number,y:number,pressure:number,start=true,flush=true):void {const position=cloudInput(x,y);generatorCloudContact(track,id,position.x,position.y,pressure,start,activity,flush,id===112);}
function finishContact(id:number,contact:{track:number;x:number;y:number;pressure:number}):void {
 if(pendingPressure.delete(id))contactInput(contact.track,id,contact.x,contact.y,contact.pressure,false,false);
 contactInput(contact.track,id,contact.x,contact.y,0);
}
export function cloudSurfaceActive():boolean {return owner!==null;}
export function cloudRunning():boolean {return owner!==null&&generatorRead('cg_explore',owner)==='Stop';}
/** Cached feedback: LED painters must not poll or mutate the engine. */
export function cloudHolding():boolean {return owner!==null&&holding;}
export function toggleCloudHold():void {
 if(owner===null)return;flushCloudPressure();generatorCloudHold(!generatorCloudHeld(owner),owner);holding=generatorCloudHeld(owner);invalidateHold();lastRead=-Infinity;appState.dirty=true;
}
export function setCloudSurface(visible:boolean):void {
 const next=visible&&generatorCloud()?generatorSelectedTrack():null;
 if(next===owner)return;releaseCloud();owner=next;holding=false;paint.fill(-1);snapshot=emptyCloud();lastRead=-Infinity;
 if(engineReady()){syncPadRoute(fieldEngineSet);if(next!==null){fieldEngineSet('joint_map','off');fieldEngineSet('joint_release','1');}}appState.dirty=true;
}
export function cloudRead(key:string):string|null {if(key==='cg_hold_center')return 'Tap';if(key==='cg_hold')return cloudHoldState()?.holding?'On':'Off';if(key==='cg_hold_x'||key==='cg_hold_y')return String((cloudHoldPosition()?.[key.endsWith('x')?'x':'y']??0)/129);const response=cloudPressureRead(key);if(response!==null)return response;return key==='cg_x'?String(cursorX/129):key==='cg_y'?String(cursorY/129):key==='cg_pressure'?String(drawPressure):key==='cg_activity'?activity:key==='cg_edge'?(wrap?'Wrap':'Bounded'):key==='cg_axes'?(flipped?'Pitch / Activity':'Activity / Pitch'):null;}
export function cloudWrite(key:string,value:string):boolean|null {
 if(key==='cg_hold') {if(!['Off','On'].includes(value))return false;flushCloudPressure();generatorCloudHold(value==='On');invalidateHold();appState.dirty=true;return true;}
 if(key==='cg_hold_center'){generatorCloudCenter();invalidateHold();appState.dirty=true;return true;}
 if(key==='cg_hold_x'||key==='cg_hold_y'){
  const amount=Number(value);if(!Number.isFinite(amount)||Math.abs(amount)>127)return false;
  return shiftCloudHold(key.endsWith('x')?'x':'y',Math.round(amount*129),false);
 }

 const response=cloudPressureWrite(key,value);if(response!==null){if(response){for(const id of held.keys())pendingPressure.add(id);markUiStateDirty();appState.dirty=true;}return response;}
 if(key==='cg_pressure'){
  const pressure=Number(value);if(!Number.isInteger(pressure)||pressure<1||pressure>127)return false;
  drawPressure=pressure;const contact=held.get(112);if(contact){contact.pressure=pressure;pendingPressure.add(112);}
  markUiStateDirty();appState.dirty=true;return true;
 }
 if(key==='cg_activity'){if(value!=='Probability'&&value!=='Rate')return false;releaseCloud();activity=value;markUiStateDirty();appState.dirty=true;return true;}
 if(key==='cg_edge'){if(!['Wrap','Bounded'].includes(value))return false;wrap=value==='Wrap';if(cloudHoldState()?.holding)shiftCloudHold('x',0,true);markUiStateDirty();return true;}
 if(key==='cg_axes'){if(!['Activity / Pitch','Pitch / Activity'].includes(value))return false;releaseCloud();flipped=value==='Pitch / Activity';paint.fill(-1);markUiStateDirty();appState.dirty=true;return true;}
 if(!['cg_x','cg_y'].includes(key))return null;
 const number=Number(value);if(!Number.isFinite(number)||!cloudSelected())return false;
 // Wrapping crosses an edge, not the whole field. End the old segment before
 // depositing at the opposite edge; other held contacts keep their ownership.
 const coordinate=Math.round(number*129);if(!Number.isSafeInteger(coordinate))return false;
 if(wrap&&(coordinate<0||coordinate>EXPRESSION_MAX)){
  const contact=held.get(112);if(contact){finishContact(112,contact);held.delete(112);}
 }
 if(key==='cg_x')cursorX=cloudCoordinate(coordinate,wrap,EXPRESSION_MAX);else cursorY=cloudCoordinate(coordinate,wrap,EXPRESSION_MAX);
 lastDraw=Date.now();const track=generatorSelectedTrack();contactInput(track,112,cursorX,cursorY,drawPressure);held.set(112,{track,x:cursorX,y:cursorY,pressure:drawPressure});appState.dirty=true;return true;
}
/** Physical axes are projected once; the engine owns the captured shape. */
export function shiftCloudHold(axis:'x'|'y',value:number,relative:boolean,capture?:number):boolean {
 const semantic=flipped?(axis==='x'?'y':'x'):axis;
 const changed=generatorCloudShift(semantic,value,relative,wrap,generatorSelectedTrack(),capture);invalidateHold();appState.dirty=true;return changed;
}
export function shiftCloudHoldXY(x:number,y:number,capture?:number):boolean {
 const delta=cloudInput(x,y),changed=generatorCloudShiftXY(delta.x,delta.y,wrap,generatorSelectedTrack(),capture);
 invalidateHold();appState.dirty=true;return changed;
}
export function centerCloudHold(capture:number):void {generatorCloudCenter(generatorSelectedTrack(),capture);invalidateHold();appState.dirty=true;}
export function cloudHoldTouch(key:string,down:boolean):boolean {
 if(!['cg_hold','cg_hold_center'].includes(key))return false;
 if(down)cloudWrite(key,key==='cg_hold'?(generatorCloudHeld()?'Off':'On'):'Tap');return true;
}
/** Turn path retains overshoot; enum/int widgets otherwise clamp before writing. */
export function cloudTurn(key:string,delta:number,fine=false):boolean {
 if(key==='cg_hold_center'){if(delta)cloudWrite(key,'Tap');return true;}
 if(key==='cg_hold_x'||key==='cg_hold_y')return shiftCloudHold(key.endsWith('x')?'x':'y',delta*(fine?1:129),true);
 if(!['cg_x','cg_y'].includes(key))return false;cloudWrite(key,String(((key==='cg_x'?cursorX:cursorY)+delta*(fine?1:129))/129));return true;
}
export function cloudPad(source:string,index:number,down:boolean,height=4,pressure=100):boolean {
 const offset=source==='move'?0:source==='launchpad'?32:96;
 const id=offset+index;
 if(!down){const contact=held.get(id);if(contact){finishContact(id,contact);held.delete(id);return true;}return cloudSurfaceActive();}
 if(owner===null||index<0||index>=height*8||!Number.isInteger(index))return false;
 const contact={track:owner,x:Math.round(index%8*127/7),y:Math.round(Math.floor(index/8)*127/(height-1)),pressure};
 pendingPressure.delete(id);held.set(id,contact);contactInput(owner,id,contact.x,contact.y,pressure);appState.dirty=true;return true;
}
/** Pressure changes an existing contact; only a note-off ends its ownership. */
export function cloudPadPressure(source:'move'|'launchpad',index:number,pressure:number):boolean {
 if(!Number.isInteger(index)||index<0||index>=(source==='move'?32:64)||!Number.isInteger(pressure)||pressure<0||pressure>127)return false;
 const id=(source==='move'?0:32)+index,contact=held.get(id);
 if(!contact)return cloudSurfaceActive();
 // Zero aftertouch still means a held pad. The cloud wire reserves zero for up,
 // so retain the smallest sounding pressure until a real note-off arrives.
 contact.pressure=Math.max(1,pressure);pendingPressure.add(id);appState.dirty=true;return true;
}
export function releaseCloud(source?:string):void {
 for(const [id,contact] of held){if(source&&(source==='move'?id>=32:source==='launchpad'?id<32||id>=96:id<96))continue;finishContact(id,contact);held.delete(id);}
}
export function cloudMidi(data:number[]):boolean {
 const type=data[0]&240,key=data[1],value=data[2];
 if(key>=68&&key<100&&[128,144,160].includes(type)){
  if(type===160)return cloudPadPressure('move',key-68,value);
  return cloudPad('move',key-68,type===144&&value>0,4,value);
 }
 if(!cloudSurfaceActive())return false;
 if(type===176&&key===58){if(value){releaseCloud();generatorTouch('cg_explore',owner!,true);}return true;}
 return false;
}
/** One batch per UI tick, also flushed before an explicit Hold capture. */
export function flushCloudPressure(refresh=false):void {
 let queued=false;
 for(const [id,contact] of held)if(refresh||pendingPressure.has(id)){contactInput(contact.track,id,contact.x,contact.y,contact.pressure,false,false);queued=true;}
 pendingPressure.clear();if(queued)seqCmdFlush();
}
export function tickCloud(now=Date.now()):void {
 if(held.has(112)&&now-lastDraw>300){const contact=held.get(112)!;finishContact(112,contact);held.delete(112);}
 const refresh=now-lastRefresh>=250;if(refresh)lastRefresh=now;flushCloudPressure(refresh);
 if(owner===null)return;
 if(now-lastRead<80)return;lastRead=now;
 holding=generatorCloudHeld(owner);
 const next=readCloud(generatorCloudSnapshot(owner));if(next){snapshot=next;appState.dirty=true;}
}
export function cloudColors(height=4):number[]{return cloudCells(snapshot,8,height,trailStyle().settings,flipped);}
export function paintCloud(force=false):boolean {if(force)paint.fill(-1);const colors=cloudColors(),changes=colors.flatMap((color,index)=>color===paint[index]?[]:[{note:68+index,color}]);for(const change of sendPadLedFrame(changes))paint[change.note-68]=change.color;return colors.every((color,index)=>paint[index]===color);}
export function drawCloud(holdMotion=false):void {
 fill_rect(0,11,128,46,0);const settings=trailStyle().settings;
 for(const point of [...snapshot.trails,...snapshot.grains].map(point=>cloudPosition(point,flipped))){
  const level=cloudFade(point,settings);if(level<.05)continue;
  const x=Math.round(point.x*123)+2,y=53-Math.round(point.y*38);
  fill_rect(x,y,level>.5?2:1,level>.5?2:1,1);
 }
 for(const point of snapshot.contacts.map(point=>cloudPosition(point,flipped))){const x=Math.round(point.x*123)+2,y=53-Math.round(point.y*38);fill_rect(x-1,y,3,1,1);fill_rect(x,y-1,1,3,1);}
 const offset=holdMotion?cloudHoldPosition():null;
 fontPrint(1,56,offset?`Hold X ${(offset.x/129).toFixed(2)} Y ${(offset.y/129).toFixed(2)}`:Date.now()-lastDraw<1500?`X ${(cursorX/129).toFixed(2)} Y ${(cursorY/129).toFixed(2)}`:holding?'Hold / Sample releases':flipped?`X Pitch / Y ${activity}`:`X ${activity} / Y Pitch`,1);
}

export function clearCloud():void {releaseCloud();invalidateHold();if(owner!==null&&engineReady()){seqCmd(`gcloud ${owner} clear`);seqCmdFlush();holding=false;snapshot=emptyCloud();appState.dirty=true;}}
