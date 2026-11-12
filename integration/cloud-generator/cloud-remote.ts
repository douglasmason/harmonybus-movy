/** Remote actions re-enter the production controller, including ordinary Record/Undo. */
import {generatorActor,generatorCloud,generatorSelectedTrack,generatorRead,generatorWrite,generatorTouch,generatorEnsureCloud,generatorCloudContact,generatorCloudHeld,generatorCloudHold,generatorPrepareRecord,generatorFooter,generatorClipSlot,generatorRecording,cloudControls} from './comp-generator.js';
import {cloudRead,cloudWrite,cloudTurn,cloudInput,releaseCloud,flushCloudPressure} from './cloud-surface.js';
import {cloudPressureSnapshot} from './cloud-pressure.js';
import {trailStyle} from './trail-settings.js';
import {generatorEuclidean,generatorEuclideanView,generatorRotateStep,generatorEnsureEuclidean,generatorCanBake,euclideanControls} from './comp-generator.js';
import {seqState} from './state.js';
import {recToggle} from '../undo/rec-pass.js';
import {seqCmd,seqCmdFlush,engineReady,fieldEngineSet,cloudRemoteRequested} from './engine.js';
let lastPoll=-Infinity,lastState='';
export function cloudRemoteAction(message:string):void {
 if(typeof message!=='string'||message.length>180)return;
 const [action,...fields]=message.split(' '),track=generatorSelectedTrack();
 if(action==='euclidean'){
  const [target,operation,...args]=fields;
  if(!engineReady()||!/^(?:[0-9]|1[0-5])$/.test(target??''))return;
  if(operation==='record'&&args.length===0){
   const recording=generatorRecording();
   // Finish the confirmed take even while an actor change awaits its next UI
   // snapshot. Starting a take still requires the current gesture target.
   if(recording.phase!=='idle')recToggle(recording.track??track);
   else if(target===String(track)&&generatorEnsureEuclidean(track)&&generatorPrepareRecord(track)!==false)recToggle(track);
   seqCmdFlush();return;
  }
  // Delayed musical edits belong to the actor whose controls produced them.
  if(target!==String(track))return;
  if(operation==='choose'&&args.length===0){generatorWrite('cg_source_style','Euclidean',track);return;}
  if(!generatorEuclideanView(track))return;
  if(operation==='rotate'&&args.length===1&&/^\d+$/.test(args[0]))generatorRotateStep(Number(args[0]),track);
  else if(operation==='control'&&args.length===2&&/^(?:cg_euclid_(?:hits|steps|rotation|rate|accents|depth|gate)|cg_intensity)$/.test(args[0]))generatorWrite(args[0],args[1],track);
  else if(['explore','bake','restore'].includes(operation)&&args.length===0)generatorTouch('cg_'+operation,track,true);
  return;
 }
 if(action==='play'||action==='stop'){if(action==='stop'||!seqState.playing){if(action==='stop')releaseCloud();seqCmd(action);seqCmdFlush();}return;}
 if(action==='actor'&&fields.length===1){generatorWrite('cg_actor',fields[0],track);return;}
 if(action==='choose'&&fields.length===0){generatorWrite('cg_source_style','Cloud',track);return;}
 if(action==='record'&&fields.length===0){
  const recording=generatorRecording();
  // Finish the existing take even after browsing another actor/source. Starting
  // that actor's exploration here would alter the session just to end a take.
  if(recording.phase!=='idle')recToggle(recording.track??track);
  else if(generatorCloud()&&generatorEnsureCloud(track)&&generatorPrepareRecord(track)!==false)recToggle(track);
  seqCmdFlush();return;
 }
 // Up belongs to the original track even after selecting a non-cloud actor.
 // Only a new down may start exploration; movement cannot revive stopped input.
 if(['touch','move','touch14','move14'].includes(action)&&[5,6].includes(fields.length)){
  const [target,id,x,y,pressure,activity=0]=fields.map(Number);
  const precise=action.endsWith('14'),maximum=precise?16383:127;
  if([target,id,x,y,pressure,activity].every(Number.isInteger)&&[0,1].includes(activity)&&target>=0&&target<16&&id>=96&&id<128&&id!==112&&[x,y].every(value=>value>=0&&value<=maximum)&&pressure>=0&&pressure<=127&&(pressure===0||target===track&&generatorCloud())){const position=cloudInput(x,y);generatorCloudContact(target,id,position.x,position.y,pressure,action.startsWith('touch'),activity===1?'Rate':'Probability',true,precise);}
  return;
 }
 if(!generatorCloud())return;
 if(action==='control'&&fields.length===2&&(/^(?:cg_cloud_(?:rate|density|length|register|spread|contour|variation|dynamics)|cg_seed)$/.test(fields[0])))generatorWrite(fields[0],fields[1],track);
 else if(action==='edge'&&fields.length===1)cloudWrite('cg_edge',fields[0]);
 else if(action==='activity'&&fields.length===1)cloudWrite('cg_activity',fields[0]);
 else if(action==='axes'&&fields.length===1&&['pitch-x','pitch-y'].includes(fields[0]))cloudWrite('cg_axes',fields[0]==='pitch-x'?'Pitch / Activity':'Activity / Pitch');
 else if(action==='response'&&fields.length===2&&['target','curve','direction','low','high'].includes(fields[0]))cloudWrite('cg_pressure_'+fields[0],fields[1]);
 else if(action==='pressure'&&fields.length===1)cloudWrite('cg_pressure',fields[0]);
 else if(['draw','drawfine'].includes(action)&&fields.length===2&&['x','y'].includes(fields[0])&&Number.isInteger(Number(fields[1]))&&Math.abs(Number(fields[1]))<=127)cloudTurn('cg_'+fields[0],Number(fields[1]),action==='drawfine');
 else if(['explore','bake','restore'].includes(action)&&fields.length===0)generatorTouch('cg_'+action,track,true);
 else if(action==='hold'&&fields.length===1&&['0','1'].includes(fields[0])){flushCloudPressure();generatorCloudHold(fields[0]==='1',track);}
 else if(action==='clear'&&fields.length===0){releaseCloud();seqCmd(`gcloud ${track} clear`);seqCmdFlush();}
}
export function cloudRemoteSnapshot():string {
 const track=generatorSelectedTrack();
 return JSON.stringify({xyBits:14,drawBits:14,pressureResponse:cloudPressureSnapshot(),pressure:Number(cloudRead('cg_pressure')),ready:engineReady(),canBake:generatorCanBake(track),actor:generatorActor(),track,slot:generatorClipSlot(track),transport:{playing:seqState.playing,...generatorRecording()},euclidean:generatorEuclideanView(track),euclideanValues:generatorEuclidean(track)?[...euclideanControls.map(field=>generatorRead('cg_euclid_'+field,track)),generatorRead('cg_intensity',track)]:null,cloud:generatorCloud(),holding:generatorCloudHeld(track),values:cloudControls.map(field=>Number(generatorRead('cg_cloud_'+field,track))),seed:generatorRead('cg_seed',track),explore:generatorRead('cg_explore',track),footer:generatorFooter(track),x:Number(cloudRead('cg_x')),y:Number(cloudRead('cg_y')),edge:cloudRead('cg_edge'),axes:cloudRead('cg_axes'),activity:cloudRead('cg_activity'),trail:trailStyle().settings});
}
export function tickCloudRemote(now=Date.now()):void {
 if(!engineReady()||!cloudRemoteRequested||now-lastPoll<50)return;lastPoll=now;
 const pending=String(host_module_get_param('cloud_actions')??'');
 for(const action of pending.split('\n'))if(action)cloudRemoteAction(action);
 const snapshot=cloudRemoteSnapshot();if(snapshot!==lastState){fieldEngineSet('cloud_ui_state',snapshot);fieldEngineSet('cloud_focus',String(generatorSelectedTrack()));lastState=snapshot;}
}
