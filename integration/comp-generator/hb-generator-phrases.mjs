// Real shared controls: browse each phrase and capture with the ordinary Record path.
import './hb-generator-duet.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const generator=await import('../dist/esm/seq/comp-generator.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const {resetRecPass,recPassTick}=await import('../dist/esm/undo/rec-pass.js');
const {endEdit}=await import('../dist/esm/undo/group.js');
const originalGet=globalThis.host_module_get_param,originalSet=globalThis.host_module_set_param_blocking;
const states=new Map([[1,'Off|0|4 32 64 1 0|'],[2,'Off|0|0 32 64 1 0|']]);
let commands=[],owner=-1,now=Date.now()+1000;Date.now=()=>now;
globalThis.host_module_get_param=key=>key.startsWith('generator_info_')?states.get(Number(key.slice(15)))+'|'+owner:originalGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 if(key==='cmd')for(const command of value.split(';')){
  commands.push(command);const fields=command.split(' '),track=Number(fields[1]);
  if(fields[0]==='gexplore'&&fields[1]!=='off')states.set(track,'Exploring|0|'+fields.slice(2).join(' ')+' 0|');
  if(command==='gexplore off'){owner=-1;for(const [track,state] of states)states.set(track,state.replace(/^Exploring/,'Off'));}
  if(fields[0]==='rec')owner=owner<0?track:-1;
 }
 return originalSet?.(key,value);
};
const refresh=()=>{now+=101;chord.tickChord();chord.chordPage().tick();seqCmdFlush();};
const visit=level=>{const page=chord.chordPage();page.goToPage(page.ctl.pages.findIndex(item=>item.level===level));return page;};
const record=()=>{chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);seqCmdFlush();refresh();};
chord.restoreChord(null);chord.setChordEnabled(true);generator.generatorTarget(2,1);
for(const [actor,track,first] of [['Comp',2,8],['Bass',1,12]]){
 generator.generatorWrite('cg_actor',actor,generator.generatorTarget(2,1));refresh();
 for(const [index,[genre,name]] of [['Pop','Pop Answer 2b'],['Funk','Funk Pocket 2b'],['Bossa','Bossa 2b'],['Soul','Soul Space 4b']].entries()){
  generator.generatorStop();seqState.playing=false;seqState.recording=false;endEdit();resetRecPass();refresh();
  visit('cp_generator_browser');commands=[];
  assert(generator.generatorWrite('cg_genre',genre,track));seqCmdFlush();assert.equal(commands.length,0);
  assert(generator.generatorWrite('cg_family','Phrase',track));
  assert.deepEqual(generator.generatorParameters().find(meta=>meta.key==='cg_style').options,[name]);
  assert(generator.generatorWrite('cg_style',name,track));assert.equal(generator.generatorRead('cg_style',track),name);
  const meta=generator.generatorParameters().find(meta=>meta.key==='cg_style');assert(meta.short_options[0].endsWith(index===3?'4b':'2b'));
  assert.equal(commands.length,0,'browsing a stopped draft writes no clip');
  visit('cp_comp_generator');chord.chordMidi([144,3,127]);chord.chordMidi([128,3,0]);seqCmdFlush();refresh();
  assert(commands.some(command=>command.startsWith('gexplore '+track+' '+(first+index)+' ')));
  assert(!commands.some(command=>/^(pload|clipfill|launch|aset|alabel)\b/.test(command)));
  record();assert.equal(owner,track);assert(commands.includes('rec '+track));
  seqState.recording=true;recPassTick();
  generator.generatorWrite('cg_complexity','80',track);generator.generatorWrite('cg_intensity','65',track);seqCmdFlush();
  record();seqState.recording=false;recPassTick();seqCmdFlush();
  assert.equal(commands.filter(command=>command.startsWith('usnap ')).length,1);
  assert.equal(commands.filter(command=>command.startsWith('ucommit ')).length,1);
 }
}
generator.generatorStop();chord.restoreChord(null);generator.generatorWrite('cg_actor','Comp',1);endEdit();resetRecPass();
globalThis.host_module_get_param=originalGet;globalThis.host_module_set_param_blocking=originalSet;
console.log('Actor phrases: all eight genre/family choices, length labels, temporary auditions, physical Record and one Undo per pass');
