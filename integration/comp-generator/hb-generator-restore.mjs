import './hb-actor-generator.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const generator=await import('../dist/esm/seq/comp-generator.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const originalGet=globalThis.host_module_get_param,originalSet=globalThis.host_module_set_param_blocking;
let now=Date.now()+1000;Date.now=()=>now;
const states={1:'Exploring|5|12 110 100 37 1536|Explore saved recipe|-1|1',2:'Preview|3|8 100 127 37 1536|Preview|-1|0'};
let commands=[];
globalThis.host_module_get_param=key=>key.startsWith('generator_info_')?states[Number(key.slice(15))]??originalGet(key):originalGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 if(key==='cmd')for(const command of value.split(';')){
  commands.push(command);
  if(command.startsWith('grestore ')){
   const [,track,slot]=command.split(' '),fields=states[track].split('|');
   assert.equal(slot,fields[1],'Restore stays bound to the selected actor clip');
   fields[3]=fields[4]===track?'Finish this actor take first':'Restore saved controls: step / bar';states[track]=fields.join('|');
  }
 }
 return originalSet?.(key,value);
};
chord.restoreChord(null);chord.setChordEnabled(true);seqState.playing=true;seqState.recording=false;seqState.countingIn=false;
const select=actor=>{
 generator.generatorWrite('cg_actor',actor,generator.generatorTarget(2,1));generator.generatorTarget(2,1);
 now+=101;chord.tickChord();let page=chord.chordPage();page.goToPage(page.ctl.pages.findIndex(entry=>entry.level==='cp_comp_generator'));return page;
};
for(const [actor,track,slot] of [['Comp',2,3],['Bass',1,5]]){
 const page=select(actor);assert.equal(page.keyAt(5),'cg_restore');assert.equal(page.keyAt(7),'cp_off');
 assert.equal(generator.generatorRead('cg_restore',track),'Tap');
 seqCmdFlush();commands=[];
 chord.chordMidi([144,5,127]);chord.chordMidi([128,5,0]);seqCmdFlush();
 assert.deepEqual(commands,[`grestore ${track} ${slot}`],'physical Restore sends one transient command, without Stop, Record, clip writes or Undo');
 assert(states[track].includes('Restore saved controls'));assert.equal(generator.generatorRead('cg_explore',track),'Stop');
}
// The UI keeps recording bound to Comp while Bass restores its own audition.
states[2]='Overdub|3|8 100 127 37 1536|Recording|2|0';states[1]='Exploring|5|12 110 100 37 1536|Explore saved recipe|2|1';
seqState.recording=true;select('Bass');commands=[];
chord.chordMidi([144,5,127]);chord.chordMidi([128,5,0]);seqCmdFlush();
assert.deepEqual(commands,['grestore 1 5']);assert.equal(generator.generatorRecordTrack(),2);
select('Comp');commands=[];chord.chordMidi([144,5,127]);chord.chordMidi([128,5,0]);seqCmdFlush();
assert.deepEqual(commands,['grestore 2 3']);assert(states[2].includes('Finish this actor take first'));assert.equal(generator.generatorRecordTrack(),2);
seqState.recording=false;seqState.playing=false;chord.restoreChord(null);
globalThis.host_module_get_param=originalGet;globalThis.host_module_set_param_blocking=originalSet;
console.log('Generator Restore: shared knob-6 routing, both actors and source types, selected slots, no Stop/Record/Undo, companion recording and refusal feedback pass');
