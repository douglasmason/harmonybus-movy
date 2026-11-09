import './hb-comp-generator.mjs';
import assert from 'node:assert/strict';
const generator=await import('../dist/esm/seq/comp-generator.js');
const cloud=await import('../dist/esm/seq/cloud-surface.js');
const view=await import('../dist/esm/seq/cloud-view.js');
const chord=await import('../dist/esm/seq/chord-play.js');
const {padsPlayNotes}=await import('../dist/esm/seq/router-pads.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const originalGet=globalThis.host_module_get_param,originalSet=globalThis.host_module_set_param_blocking;
let now=Date.now()+2000,commands=[],state='Off|0|0 32 64 1 0|';Date.now=()=>now;
globalThis.host_module_get_param=key=>key==='generator_info_2'?state:key==='cloud_view_2'?'cf1|127,127,100|0,0,100,2|64,64,100,1':originalGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 if(key==='cmd')for(const command of value.split(';')){commands.push(command);const fields=command.split(' ');if(fields[0]==='gexplore'&&fields[1]==='2'&&fields.length>=6)state='Exploring|0|'+fields.slice(2).join(' ')+'|';}
 return originalSet?.(key,value);
};
generator.generatorWrite('cg_actor','Comp',2);generator.generatorTarget(2,1);
assert(generator.generatorWrite('cg_source_style','Cloud',2));assert(generator.generatorCloud());
assert.deepEqual(generator.generatorPanelKeys(),generator.cloudKeys);assert.equal(generator.cloudKeys.length,8);
for(let index=0;index<4;index++){now+=200;chord.tickChord();}let page=chord.chordPage();
page.goToPage(page.ctl.pages.findIndex(entry=>entry.level==='cp_comp_generator'));now+=200;chord.tickChord();
assert.equal(page.keyAt(7),'cg_cloud_dynamics');assert(cloud.cloudSurfaceActive());assert(!padsPlayNotes(),'field pads cannot also play their ordinary mapped notes');
commands=[];chord.chordMidi([144,68,110]);chord.chordMidi([144,99,90]);seqCmdFlush();
assert(commands.includes('gcloud 2 0 0 0 110'));assert(commands.includes('gcloud 2 31 127 127 90'));
chord.chordMidi([128,68,0]);chord.chordMidi([128,99,0]);seqCmdFlush();assert(commands.includes('gcloud 2 0 0 0 0'));assert(commands.includes('gcloud 2 31 127 127 0'));
cloud.cloudWrite('cg_edge','Wrap');cloud.cloudWrite('cg_x','127');seqCmdFlush();commands=[];
cloud.cloudTurn('cg_x',3);seqCmdFlush();assert.equal(cloud.cloudRead('cg_x'),'2');
assert.deepEqual(commands.filter(command=>command.startsWith('gcloud ')),['gcloud 2 112 127 64 0','gcloud 2 112 2 64 100'],'wrap starts a new stroke instead of drawing across the field');
cloud.cloudWrite('cg_y','0');cloud.cloudTurn('cg_y',-2);assert.equal(cloud.cloudRead('cg_y'),'126');
cloud.cloudWrite('cg_edge','Bounded');cloud.cloudTurn('cg_x',200);assert.equal(cloud.cloudRead('cg_x'),'127');
page.goToPage(page.ctl.pages.findIndex(entry=>entry.level==='cp_cloud_field'));now+=200;chord.tickChord();
assert.equal(page.keyAt(0),'cg_x');assert.equal(page.keyAt(1),'cg_y');assert.equal(page.keyAt(2),'cg_axes');assert.equal(page.keyAt(4),'cg_activity');assert.equal(page.keyAt(7),'cg_restore');
cloud.cloudWrite('cg_edge','Wrap');chord.chordMidi([176,71,3]);assert.equal(cloud.cloudRead('cg_x'),'2','physical X encoder preserves wrapped overshoot');
cloud.cloudWrite('cg_x','127');cloud.cloudWrite('cg_edge','Bounded');
const settings={scope:'pitch',window:'infinite',windowBeats:4,curve:'linear',decayBeats:4,strength:1,peak:1,floor:0};
const snapshot=view.readCloud('cf1|0,0,127|0,0,127,4;127,127,127,8|');assert(snapshot);
const colors=view.cloudCells(snapshot,8,4,settings);assert.equal(colors[0],126,'direct green wins over every trail');assert.notEqual(colors[31],126);
assert.equal(view.readCloud('cf1|NaN,0,1||'),null);assert.equal(view.cloudCoordinate(-257,true),127);
commands=[];cloud.setCloudSurface(false);seqCmdFlush();assert(commands.some(command=>command==='gcloud 2 112 127 126 0'),'leaving the field releases the drawing cursor');
cloud.setCloudSurface(true);cloud.cloudWrite('cg_axes','Pitch / Activity');commands=[];
chord.chordMidi([144,75,110]);seqCmdFlush();assert(commands.includes('gcloud 2 7 0 127 110'),'wide physical X axis becomes semantic pitch');
chord.chordMidi([128,75,0]);seqCmdFlush();assert(commands.includes('gcloud 2 7 0 127 0'));
const axisSnapshot=view.readCloud('cf1|0,127,127||');assert.equal(view.cloudCells(axisSnapshot,8,4,settings,true)[7],126,'projection puts the sounding contact back on the touched pad');
assert.equal(cloud.cloudWrite('cg_activity','bogus'),false);assert.equal(cloud.cloudRead('cg_activity'),'Probability');
chord.chordMidi([176,75,1]);assert.equal(cloud.cloudRead('cg_activity'),'Rate','fifth physical encoder selects the activity');commands=[];
chord.chordMidi([144,75,110]);seqCmdFlush();assert(commands.includes('gcloud 2 7 0 127 110 1'),'pad uses the selected activity and flipped projection');
cloud.cloudWrite('cg_activity','Probability');seqCmdFlush();assert(commands.includes('gcloud 2 7 0 127 0 1'),'changing activity releases old input before changing its interpretation');
cloud.cloudWrite('cg_activity','Rate');cloud.cloudPad('launchpad',63,true,8,100);seqCmdFlush();assert(commands.includes('gcloud 2 95 127 127 100 1'));
cloud.cloudWrite('cg_x','80');seqCmdFlush();assert(commands.includes('gcloud 2 112 126 80 100 1'));
const saved=cloud.cloudSurfaceSnapshot();cloud.restoreCloudSurface(null);assert.equal(cloud.cloudRead('cg_axes'),'Activity / Pitch');assert.equal(cloud.cloudRead('cg_activity'),'Probability');cloud.restoreCloudSurface(saved);assert.equal(cloud.cloudRead('cg_axes'),'Pitch / Activity');assert.equal(cloud.cloudRead('cg_activity'),'Rate');
cloud.setCloudSurface(false);
// Remote Record has the same bound destination and one-Undo lifetime as the
// physical button, including after browsing an actor that is not using Cloud.
const remote=await import('../dist/esm/seq/cloud-remote.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {endEdit}=await import('../dist/esm/undo/group.js');
const {resetRecPass,recPassTick}=await import('../dist/esm/undo/rec-pass.js');
const states=new Map();let owner=-1;
globalThis.host_module_get_param=key=>key.startsWith('generator_info_')?(states.get(Number(key.slice(15)))??'Off|0|0 32 64 1 0|')+'|'+owner:originalGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 if(key==='cmd')for(const command of value.split(';')){
  commands.push(command);const fields=command.split(' '),track=Number(fields[1]);
  if(fields[0]==='gexplore'&&fields.length>=6)states.set(track,'Exploring|'+(states.get(track)?.split('|')[1]??0)+'|'+fields.slice(2).join(' ')+'|');
  if(fields[0]==='rec'){
   if(owner>=0){states.set(owner,states.get(owner).replace(/^(Recording|Overdub)/,'Recorded'));owner=-1;}
   else {owner=track;states.set(track,states.get(track).replace(/^Exploring/,'Recording'));}
  }
 }
 return originalSet?.(key,value);
};
for(const actor of ['Comp','Bass'])for(const phase of ['armed','count-in','recording']){
 const playing=phase==='recording';
 seqState.recording=false;seqState.countingIn=false;seqState.playing=playing;owner=-1;endEdit();resetRecPass();
 states.set(1,'Off|2|4 32 64 1 0|');states.set(2,'Off|1|0 32 64 1 0|');now+=101;
 const target=actor==='Comp'?2:1,other=3-target,otherActor=actor==='Comp'?'Bass':'Comp';
 remote.cloudRemoteAction('actor '+otherActor);generator.generatorWrite('cg_source_style','Quarters',other);
 remote.cloudRemoteAction('actor '+actor);remote.cloudRemoteAction('choose');seqCmdFlush();commands=[];
 remote.cloudRemoteAction('record');now+=101;
 assert.equal(owner,target);assert(commands.includes('rec '+target));
 assert.equal(JSON.parse(remote.cloudRemoteSnapshot()).transport.phase,'armed','engine binding is shown before the status mirror confirms recording');
 seqState.recording=phase==='recording';seqState.countingIn=phase==='count-in';recPassTick();now+=101;
 let snapshot=JSON.parse(remote.cloudRemoteSnapshot());
 assert.deepEqual(snapshot.transport,{playing,phase,track:target,slot:target===2?1:2});
 assert.equal(snapshot.slot,target===2?1:2);
 if(phase==='count-in')assert.match(generator.generatorFooter(target),/^Count-in /,'native page shows the shared count-in');
 remote.cloudRemoteAction('actor '+otherActor);now+=101;snapshot=JSON.parse(remote.cloudRemoteSnapshot());
 assert.equal(snapshot.cloud,false);assert.equal(snapshot.track,other);assert.equal(snapshot.transport.track,target);
 const before=commands.length;for(let read=0;read<5;read++)remote.cloudRemoteSnapshot();assert.equal(commands.length,before,'transport observation is read-only');
 remote.cloudRemoteAction('record');seqCmdFlush();
 assert.equal(owner,-1);assert.deepEqual(commands.slice(before),['rec '+target],'ending the original take cannot start the browsed actor');
 seqState.recording=false;seqState.countingIn=false;for(let tick=0;tick<41;tick++)recPassTick();seqCmdFlush();now+=101;
 assert.equal(commands.filter(command=>command.startsWith('usnap ')).length,1);
 assert.equal(commands.filter(command=>command.startsWith('ucommit ')).length,1,'ending or cancelling closes the same Undo pass');
 assert.deepEqual(JSON.parse(remote.cloudRemoteSnapshot()).transport,{playing,phase:'idle',track:null,slot:null});
}
seqState.playing=false;endEdit();resetRecPass();
globalThis.host_module_get_param=originalGet;globalThis.host_module_set_param_blocking=originalSet;
console.log('Cloud: shared controls, multitouch, X/Y, trails, transport feedback, count-in and cross-actor Record ownership/Undo pass');
