import './hb-comp-generator.mjs';
import assert from 'node:assert/strict';
const generator=await import('../dist/esm/seq/comp-generator.js');
const cloud=await import('../dist/esm/seq/cloud-surface.js');
const view=await import('../dist/esm/seq/cloud-view.js');
const chord=await import('../dist/esm/seq/chord-play.js');
const buttons=await import('../dist/esm/seq/mode-buttons.js');
const remote=await import('../dist/esm/seq/cloud-remote.js');
const {WHITE_DIM,WHITE_BRIGHT}=await import('../dist/esm/seq/colors.js');
const {padsPlayNotes}=await import('../dist/esm/seq/router-pads.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const originalGet=globalThis.host_module_get_param,originalSet=globalThis.host_module_set_param_blocking;
let holding=false,commandWrites=0;
let now=Date.now()+2000,commands=[],state='Off|0|0 32 64 1 0|';Date.now=()=>now;
globalThis.host_module_get_param=key=>key==='cloud_hold_2'?(holding?'1':'0'):key==='generator_info_2'?state:key==='cloud_view_2'?'cf1|127,127,100|0,0,100,2|64,64,100,1':originalGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 if(key==='cmd')commandWrites++;
 if(key==='cmd')for(const command of value.split(';')){commands.push(command);const fields=command.split(' ');if(fields[0]==='gcloud'&&fields[1]==='2'&&fields[2]==='hold')holding=fields[3]==='1';if(fields[0]==='gexplore'&&fields[1]==='2'&&fields.length>=6)state='Exploring|0|'+fields.slice(2).join(' ')+'|';}
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
commands=[];chord.chordMidi([144,68,110]);chord.chordMidi([160,68,0]);cloud.tickCloud(now+=16);chord.chordMidi([160,68,73]);cloud.tickCloud(now+=16);seqCmdFlush();
assert(commands.includes('gcloud 2 move 0 0 0 1'),'zero Move aftertouch remains a softly held contact');
assert(commands.includes('gcloud 2 move 0 0 0 73'));assert(!commands.includes('gcloud 2 0 0 0 0'),'pressure does not synthesize a release');
commands=[];const writesBeforePressure=commandWrites;
for(let pressure=0;pressure<1000;pressure++)chord.chordMidi([160,68,pressure%128]);
assert.equal(commandWrites,writesBeforePressure,'pressure callbacks never make blocking host writes');
cloud.tickCloud(now+=16);assert.equal(commandWrites,writesBeforePressure+1,'one tick sends one pressure batch');
assert.deepEqual(commands,['gcloud 2 move 0 0 0 103'],'only the latest pressure is deposited');
commands=[];chord.chordMidi([160,68,77]);chord.chordMidi([128,68,0]);seqCmdFlush();
assert.deepEqual(commands,['gcloud 2 move 0 0 0 77','gcloud 2 0 0 0 0'],'note-off flushes the final pending pressure in order');
commands=[];chord.chordMidi([160,68,99]);seqCmdFlush();assert.equal(commands.length,0,'late pressure cannot create a new contact');
const launchpad=await import('../dist/esm/surfaces/launchpad.js');
const {setFlag}=await import('../dist/esm/seq/flags.js');
globalThis.move_midi_external_send=()=>true;globalThis.host_ext_midi_remap_set=()=>true;globalThis.host_ext_midi_remap_enable=()=>true;globalThis.host_external_surface=()=>true;
setFlag('hblaunchpad',2);launchpad.tickLaunchpad(now);commands=[];
launchpad.onMidiMessageExternal([144,88,90]);launchpad.onMidiMessageExternal([160,88,38]);cloud.tickCloud(now+=16);launchpad.onMidiMessageExternal([160,88,0]);cloud.tickCloud(now+=16);seqCmdFlush();
assert(commands.includes('gcloud 2 95 127 127 90'));assert(commands.includes('gcloud 2 move 95 127 127 38'),'Launchpad X pressure reaches Cloud through the real external MIDI route');
assert(commands.includes('gcloud 2 move 95 127 127 1'));assert(!commands.includes('gcloud 2 95 127 127 0'));
launchpad.onMidiMessageExternal([128,88,0]);seqCmdFlush();assert(commands.includes('gcloud 2 95 127 127 0'));
commands=[];launchpad.onMidiMessageExternal([160,88,95]);seqCmdFlush();assert.equal(commands.length,0);
launchpad.onMidiMessageExternal([144,88,90]);cloud.setCloudSurface(false);seqCmdFlush();commands=[];
launchpad.onMidiMessageExternal([160,88,95]);seqCmdFlush();assert.equal(commands.length,0,'pressure cannot revive a contact after leaving Cloud');
cloud.setCloudSurface(true);launchpad.unloadLaunchpad();setFlag('hblaunchpad',0);
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
for(const height of [4,8]){
 const middle={x:3.5/7,y:1.5/(height-1),pressure:1,age:0},field={contacts:[],trails:[middle],grains:[]};
 const blended=view.cloudCells(field,8,height,settings),lit=blended.flatMap((color,index)=>color?[index]:[]);
 assert.deepEqual(lit,[11,12,19,20],'a source between pads shares its cloud across four neighbors');assert(!blended.includes(126));
 assert.deepEqual(view.cloudCells({...field,trails:Array(256).fill(middle)},8,height,settings),blended,'repeated held deposits cannot amplify visual energy');
 const mixed=[middle,{...middle,age:2}];
 assert.deepEqual(view.cloudCells({...field,trails:mixed},8,height,{...settings,curve:'none'}),view.cloudCells({...field,trails:mixed.slice().reverse()},8,height,{...settings,curve:'none'}),'equally bright fresh and old deposits keep the fresh color regardless of storage order');
 assert.deepEqual(view.cloudCells({...field,contacts:[middle]},8,height,settings).filter(color=>color===126),[126],'direct touch stays one green pad above the cloud');
 assert(view.cloudCells({...field,trails:[{...middle,age:4}]},8,height,settings).every(color=>color===0));
 for(let index=0;index<8*height;index++){
  const centered={x:Math.round(index%8*127/7)/127,y:Math.round(Math.floor(index/8)*127/(height-1))/127,pressure:1,age:0};
  const centeredColors=view.cloudCells({contacts:[],trails:[centered],grains:[]},8,height,settings);
  assert.deepEqual(centeredColors.flatMap((color,cell)=>color?[cell]:[]),[index],'7-bit rounding does not light phantom neighbors at pad centers');
 }
 const normal=view.cloudCells(field,8,height,settings),flipped=view.cloudCells({contacts:[],trails:[{...middle,x:middle.y,y:middle.x}],grains:[]},8,height,settings,true);
 assert.deepEqual(normal,flipped,'axis exchange preserves the spatial footprint');
}
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
commands=[];cloud.tickCloud(now+200);
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_SAMPLE,0),WHITE_DIM);
chord.chordMidi([144,68,90]);chord.chordMidi([160,68,65]);commands=[];
assert(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,127,false));assert(holding);assert(cloud.cloudHolding());
assert.match(commands.at(-2),/^gcloud 2 move 0 \d+ \d+ 65 1$/);assert.equal(commands.at(-1),'gcloud 2 hold 1','Hold captures the final pressure before the next UI tick');
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_SAMPLE,0),WHITE_BRIGHT);
assert(buttons.modeHelpSnapshot().lines.includes('Sample: hold / release'));
assert.equal(buttons.modeActionDescriptors().find(action=>action.cc===buttons.CC_MODE_SAMPLE).label,'Release cloud');
cloud.setCloudSurface(false);assert(holding,'leaving the field releases fingers but keeps the captured cloud');
assert(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,0,false),'a consumed Sample release cannot open the stock sampler after leaving');
cloud.setCloudSurface(true);cloud.tickCloud(now+400);assert(cloud.cloudHolding());
remote.cloudRemoteAction('hold 0');assert(!holding);assert.equal(JSON.parse(remote.cloudRemoteSnapshot()).holding,false);
const sent=commands.length;for(const value of ['hold','hold 2','hold 1 extra','hold -1'])remote.cloudRemoteAction(value);
assert.equal(commands.length,sent,'malformed Hold actions cannot reach the engine');
remote.cloudRemoteAction('hold 1');assert(holding);assert.equal(JSON.parse(remote.cloudRemoteSnapshot()).holding,true);
cloud.setCloudSurface(false);
commands=[];remote.cloudRemoteAction('touch 2 96 30 50 90 1');remote.cloudRemoteAction('move 2 96 70 80 60 1');
assert(commands.includes('gcloud 2 96 50 30 90 1'));
assert(commands.includes('gcloud 2 move 96 80 70 60 1'),'remote movement uses update-only input with captured activity and flipped axes');
assert.equal(JSON.parse(remote.cloudRemoteSnapshot()).xyBits,14);
commands=[];remote.cloudRemoteAction('touch14 2 96 8193 10001 80 1');remote.cloudRemoteAction('move14 2 96 8194 10002 40 1');remote.cloudRemoteAction('touch14 2 113 7741 11610 30 1');
assert.deepEqual(commands,['gcloud 2 touch14 96 10001 8193 80 1','gcloud 2 move14 96 10002 8194 40 1','gcloud 2 touch14 113 11610 7741 30 1'],'precise touch/MPE coordinates share axes and ownership without truncation');
commands=[];for(const malformed of ['touch14 2 112 500 500 80','touch14 2 96 16384 500 80','move14 2 96 500 500 128','touch14 2 96 500.5 500 80'])remote.cloudRemoteAction(malformed);assert.equal(commands.length,0);
state='Off|0|16 127 96 71 0 127 50 64 80 64 100|';now+=101;commands=[];
remote.cloudRemoteAction('move 2 96 70 80 60 1');seqCmdFlush();
assert.equal(commands.length,0,'a remote heartbeat cannot restart stopped exploration');
remote.cloudRemoteAction('actor Bass');generator.generatorWrite('cg_source_style','Quarters',1);commands=[];
remote.cloudRemoteAction('move 2 96 70 80 60 1');remote.cloudRemoteAction('touch 2 96 70 80 0 1');seqCmdFlush();
assert.deepEqual(commands,['gcloud 2 96 80 70 0 1'],'late up releases its original actor even while browsing a non-cloud actor');
// Remote Record has the same bound destination and one-Undo lifetime as the
// physical button, including after browsing an actor that is not using Cloud.
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
