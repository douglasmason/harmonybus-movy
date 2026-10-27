import './hb-actor-generator.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const generator=await import('../dist/esm/seq/comp-generator.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const {resetRecPass,recPassTick}=await import('../dist/esm/undo/rec-pass.js');
const {endEdit}=await import('../dist/esm/undo/group.js');
const originalGet=globalThis.host_module_get_param,originalSet=globalThis.host_module_set_param_blocking;
const states=new Map();let owner=-1,commands=[],now=Date.now()+1000;Date.now=()=>now;
globalThis.host_module_get_param=key=>key.startsWith('generator_info_')?(states.get(Number(key.slice(15)))??'Off|0|0 32 64 1 0|')+'|'+owner:originalGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 if(key==='cmd')for(const command of value.split(';')){
  commands.push(command);const fields=command.split(' '),track=Number(fields[1]);
  if(fields[0]==='gexplore'){
   if(fields[1]==='off'){owner=-1;for(const [target,state] of states)states.set(target,state.replace(/^(Exploring|Recording)/,'Off').replace(/^(Preview|Overdub)/,'Recorded'));}
   else if(fields[2]==='off'){if(owner===track)owner=-1;states.set(track,states.get(track).replace(/^(Exploring|Recording)/,'Off').replace(/^(Preview|Overdub)/,'Recorded'));}
   else states.set(track,(owner===track?'Recording':'Exploring')+'|0|'+fields.slice(2).join(' ')+' 0|');
  }
  if(fields[0]==='rec'){
   if(owner>=0){states.set(owner,states.get(owner).replace(/^(Recording|Overdub)/,'Recorded'));owner=-1;}
   else {owner=track;states.set(track,states.get(track).replace(/^Exploring/,'Recording').replace(/^Preview/,'Overdub'));}
  }
  if(fields[0]==='gpreview')states.set(track,states.get(track).replace(/^Recorded/,'Preview'));
 }
 return originalSet?.(key,value);
};
const refresh=()=>{now+=101;chord.tickChord();chord.chordPage().tick();seqCmdFlush();};
const visit=level=>{const page=chord.chordPage();page.goToPage(page.ctl.pages.findIndex(candidate=>candidate.level===level));return page;};
const choose=actor=>{generator.generatorWrite('cg_actor',actor,generator.generatorTarget(2,1));refresh();};
const record=()=>{chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);seqCmdFlush();refresh();};
const explore=()=>{visit('cp_comp_generator');chord.chordMidi([144,3,127]);chord.chordMidi([128,3,0]);seqCmdFlush();refresh();};
chord.setChordEnabled(true);
for(const recordingActor of ['Comp','Bass']){
 seqState.recording=false;seqState.countingIn=false;seqState.playing=true;endEdit();resetRecPass();
 states.set(1,'Off|0|4 32 64 1 0|');states.set(2,'Off|0|0 32 64 1 0|');owner=-1;generator.generatorStop();
 choose('Comp');explore();choose('Bass');explore();
 assert(states.get(1).startsWith('Exploring'));assert(states.get(2).startsWith('Exploring'));
 const target=recordingActor==='Comp'?2:1,other=3-target,otherActor=recordingActor==='Comp'?'Bass':'Comp';
 choose(recordingActor);commands=[];record();
 assert(commands.includes('rec '+target));seqState.recording=true;recPassTick();
 visit('cp_generator_browser');chord.chordMidi([176,71,otherActor==='Bass'?4:124]);refresh();assert.equal(generator.generatorActor(),otherActor);assert.equal(generator.generatorRecordTrack(),target,'engine binding survives focus changes');
 assert.match(generator.generatorFooter(other),new RegExp('Rec T'+(target+1)));
 commands=[];generator.generatorWrite('cg_complexity','91',other);generator.generatorWrite('cg_seed','41',other);seqCmdFlush();refresh();
 assert(commands.some(command=>command.startsWith('gexplore '+other+' ')));assert.equal(generator.generatorRead('cg_seed',other),'41');
 assert.equal(owner,target);assert(states.get(target).startsWith('Recording'));
 // Stopping the edited actor leaves the bound take and Undo pass running.
 explore();assert(states.get(other).startsWith('Off'));assert.equal(owner,target);
 explore();assert(states.get(other).startsWith('Exploring'));assert.equal(owner,target);
 seqState.curStep=63;recPassTick();seqState.curStep=0;recPassTick();
 commands=[];record();assert(commands.includes('rec '+target));assert(!commands.includes('rec '+other));
 assert.equal(owner,-1);assert(states.get(other).startsWith('Exploring'));
 seqState.recording=false;recPassTick();seqCmdFlush();assert.equal(commands.filter(command=>command.startsWith('ucommit ')).length,1);
 // Now Record starts a separate pass for the actor currently being edited.
 commands=[];record();assert(commands.includes('rec '+other));seqState.recording=true;recPassTick();
 choose(recordingActor);record();seqState.recording=false;recPassTick();seqCmdFlush();
 assert.equal(commands.filter(command=>command.startsWith('usnap ')).length,1);assert.equal(commands.filter(command=>command.startsWith('ucommit ')).length,1);
 generator.generatorStop();refresh();endEdit();resetRecPass();
}
// Global Harmony Off consumes both temporary auditions through the same path.
states.set(1,'Off|0|4 32 64 1 0|');states.set(2,'Off|0|0 32 64 1 0|');
choose('Comp');explore();choose('Bass');explore();commands=[];chord.harmonyOff();seqCmdFlush();
assert(commands.includes('gexplore off'));assert([...states.values()].every(state=>state.startsWith('Off')));
generator.generatorWrite('cg_actor','Comp',1);generator.generatorTarget(2,2);states.set(2,'Exploring|0|4 32 64 1 0|');now+=101;
assert.equal(generator.generatorPrepareRecord(2),false);assert.equal(generator.generatorRecordActive(),false);assert.equal(generator.generatorRecordCommand(),null);
generator.generatorTarget(2,1);generator.generatorStop();chord.restoreChord(null);
globalThis.host_module_get_param=originalGet;globalThis.host_module_set_param_blocking=originalSet;
console.log('Generator duet: both actor directions, simultaneous exploration, independent controls/stop/seed, physical Record binding across focus, separate Undo passes and global Harmony Off pass');
