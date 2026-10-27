import './hb-comp-generator.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const generator=await import('../dist/esm/seq/comp-generator.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const {recPassTick,resetRecPass}=await import('../dist/esm/undo/rec-pass.js');
const {endEdit}=await import('../dist/esm/undo/group.js');
const {stepRecActive}=await import('../dist/esm/seq/step-rec.js');
const originalGet=globalThis.host_module_get_param,originalSet=globalThis.host_module_set_param_blocking;
let now=Date.now()+1000;Date.now=()=>now;
let state='Recorded|1|3 90 48 19 768|',baseline=state,deny=false,commands=[];
globalThis.host_module_get_param=key=>key==='generator_info_2'?state:originalGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 if(key==='cmd')for(const command of value.split(';')){
  commands.push(command);
  if(command.startsWith('gpreview 2 ')){
   if(deny){state=baseline+'Play the selected Comp clip first';continue;}
   const fields=command.split(' '),parts=state.split('|'),values=parts[2].split(' ');
   if(fields.length===5)values[Number(fields[3])===2?0:Number(fields[3])+1]=fields[4];
   state=(parts[0]==='Overdub'?'Overdub':'Preview')+'|'+fields[2]+'|'+values.join(' ')+'|';
  }
  if(command==='rec 2'){state=state.replace(/^Preview/,'Overdub');if(seqState.recording)state=state.replace(/^Overdub/,'Recorded');}
  if(command==='gexplore off')state=baseline;
 }
 return originalSet?.(key,value);
};
endEdit();resetRecPass();seqCmdFlush();commands=[];
seqState.recording=false;seqState.countingIn=false;seqState.playing=true;
assert.equal(generator.generatorRead('cg_style',2),'3-3-2');
assert.equal(generator.generatorRead('cg_intensity',2),'38');
assert.equal(generator.generatorRead('cg_seed',2),'19');
assert.deepEqual(generator.generatorParameters().find(meta=>meta.key==='cg_style').options,['Sparse','3-3-2']);
state=baseline='Recorded|2|0 32 64 27 1536|';now+=101;
assert.equal(generator.generatorRead('cg_style',2),'Quarters');
assert.equal(generator.generatorRead('cg_seed',2),'27');
assert.equal(commands.length,0,'selecting a recipe only reads its controls');
chord.tickChord();let page=chord.chordPage();page.goToPage(page.ctl.pages.findIndex(candidate=>candidate.level==='cp_comp_generator'));
const flush=()=>{for(let index=0;index<8;index++){now+=100;chord.tickChord();page=chord.chordPage();page.tick();}seqCmdFlush();};
chord.chordMidi([176,71,4]);flush();
assert(commands.some(command=>command.startsWith('gpreview 2 2 0 ')),'physical Complexity knob auditions the selected recipe');
assert(!commands.some(command=>/^(rec|jrec|aset|alabel|pload|clipfill|ucommit)\b/.test(command)));
assert.equal(generator.generatorWrite('cg_seed','99',2),false,'existing takes retain their deterministic seed');
commands=[];
chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);seqCmdFlush();
assert(commands.includes('rec 2'));assert(!commands.some(command=>command.startsWith('jrec')));assert(!stepRecActive());
seqState.recording=true;recPassTick();seqCmdFlush();
const firstSnapshot=commands.findIndex(command=>command.startsWith('usnap '));assert(firstSnapshot>=0&&firstSnapshot<commands.indexOf('rec 2'));
chord.chordMidi([176,72,5]);flush();assert(commands.some(command=>command.startsWith('gpreview 2 2 1 ')));
seqState.curStep=60;recPassTick();seqState.curStep=0;recPassTick();seqState.curStep=50;recPassTick();seqState.curStep=0;recPassTick();seqCmdFlush();
assert.equal(commands.filter(command=>command.startsWith('usnap ')).length,1,'one Record pass, even when the watched melody or Comp loops');
chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);seqCmdFlush();seqState.recording=false;recPassTick();seqCmdFlush();
assert.equal(commands.filter(command=>command.startsWith('ucommit ')).length,1,'the second physical Record press closes the same Undo');
// Record works without first moving a control or tapping Explore.
now+=101;state=baseline;commands=[];
chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);seqCmdFlush();
assert(commands.includes('gpreview 2 2')&&commands.includes('rec 2'));
generator.generatorStop();seqState.recording=false;seqState.countingIn=false;endEdit();resetRecPass();seqCmdFlush();
// A refused source cannot fall through to conductor recording or step entry.
now+=101;deny=true;state=baseline;commands=[];
chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);seqCmdFlush();
assert(commands.includes('gpreview 2 2'));assert(!commands.some(command=>/^(rec|jrec|usnap)\b/.test(command)));assert(!stepRecActive());
globalThis.host_module_get_param=originalGet;globalThis.host_module_set_param_blocking=originalSet;
console.log('Generator overdub: selected-recipe recall, physical controls/Record, temporary audition, one Undo across loops and refused-source isolation pass');
