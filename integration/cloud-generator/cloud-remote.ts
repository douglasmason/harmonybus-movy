/** Remote actions re-enter the production controller, including ordinary Record/Undo. */
import {generatorActor,generatorCloud,generatorSelectedTrack,generatorRead,generatorWrite,generatorTouch,generatorEnsureCloud,generatorCloudContact,generatorCloudHeld,generatorCloudHold,generatorPrepareRecord,generatorFooter,generatorClipSlot,generatorRecording,cloudControls} from './comp-generator.js';
import {cloudRead,cloudWrite,cloudTurn,cloudInput,releaseCloud,flushCloudPressure} from './cloud-surface.js';
import {trailStyle} from './trail-settings.js';
import {seqState} from './state.js';
import {recToggle} from '../undo/rec-pass.js';
import {seqCmd,seqCmdFlush,engineReady,fieldEngineSet,cloudRemoteRequested} from './engine.js';
let lastPoll=-Infinity,lastState='';
export function cloudRemoteAction(message:string):void {
 if(typeof message!=='string'||message.length>180)return;
 const [action,...fields]=message.split(' '),track=generatorSelectedTrack();
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
 if(!generatorCloud())return;
 if(action==='control'&&fields.length===2&&(/^(?:cg_cloud_(?:rate|density|length|register|spread|contour|variation|dynamics)|cg_seed)$/.test(fields[0])))generatorWrite(fields[0],fields[1],track);
 else if(action==='edge'&&fields.length===1)cloudWrite('cg_edge',fields[0]);
 else if(action==='activity'&&fields.length===1)cloudWrite('cg_activity',fields[0]);
 else if(action==='axes'&&fields.length===1&&['pitch-x','pitch-y'].includes(fields[0]))cloudWrite('cg_axes',fields[0]==='pitch-x'?'Pitch / Activity':'Activity / Pitch');
 else if(action==='draw'&&fields.length===2&&['x','y'].includes(fields[0])&&Number.isInteger(Number(fields[1]))&&Math.abs(Number(fields[1]))<=127)cloudTurn('cg_'+fields[0],Number(fields[1]));
 else if(action==='touch'&&[5,6].includes(fields.length)){
  const [target,id,x,y,pressure,activity=0]=fields.map(Number);
  if([target,id,x,y,pressure,activity].every(Number.isInteger)&&[0,1].includes(activity)&&target>=0&&target<16&&id>=96&&id<112&&[x,y,pressure].every(value=>value>=0&&value<=127)&&(pressure===0||target===track)){const position=cloudInput(x,y);generatorCloudContact(target,id,position.x,position.y,pressure,true,activity===1?'Rate':'Probability');}
 }else if(['explore','bake','restore'].includes(action)&&fields.length===0)generatorTouch('cg_'+action,track,true);
 else if(action==='hold'&&fields.length===1&&['0','1'].includes(fields[0])){flushCloudPressure();generatorCloudHold(fields[0]==='1',track);}
 else if(action==='clear'&&fields.length===0){releaseCloud();seqCmd(`gcloud ${track} clear`);seqCmdFlush();}
}
export function cloudRemoteSnapshot():string {
 const track=generatorSelectedTrack();
 return JSON.stringify({actor:generatorActor(),track,slot:generatorClipSlot(track),transport:{playing:seqState.playing,...generatorRecording()},cloud:generatorCloud(),holding:generatorCloudHeld(track),values:cloudControls.map(field=>Number(generatorRead('cg_cloud_'+field,track))),seed:generatorRead('cg_seed',track),explore:generatorRead('cg_explore',track),footer:generatorFooter(track),x:Number(cloudRead('cg_x')),y:Number(cloudRead('cg_y')),edge:cloudRead('cg_edge'),axes:cloudRead('cg_axes'),activity:cloudRead('cg_activity'),trail:trailStyle().settings});
}
export function tickCloudRemote(now=Date.now()):void {
 if(!engineReady()||!cloudRemoteRequested||now-lastPoll<50)return;lastPoll=now;
 const pending=String(host_module_get_param('cloud_actions')??'');
 for(const action of pending.split('\n'))if(action)cloudRemoteAction(action);
 const snapshot=cloudRemoteSnapshot();if(snapshot!==lastState){fieldEngineSet('cloud_ui_state',snapshot);fieldEngineSet('cloud_focus',String(generatorSelectedTrack()));lastState=snapshot;}
}
