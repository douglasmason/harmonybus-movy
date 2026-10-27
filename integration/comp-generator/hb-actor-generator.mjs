import './hb-generator-overdub.mjs';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const chord=await import('../dist/esm/seq/chord-play.js');
const generator=await import('../dist/esm/seq/comp-generator.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const {resetRecPass,recPassTick}=await import('../dist/esm/undo/rec-pass.js');
const {endEdit}=await import('../dist/esm/undo/group.js');
const originalGet=globalThis.host_module_get_param,originalSet=globalThis.host_module_set_param_blocking;
const states=new Map([[1,'Off|0|4 32 64 1 0|'],[2,'Off|0|0 32 64 1 0|'],[5,'Off|0|4 32 64 1 0|']]);
let now=Date.now()+1000,commands=[];Date.now=()=>now;
globalThis.host_module_get_param=key=>key.startsWith('generator_info_')?states.get(Number(key.slice(15))):originalGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 if(key==='cmd')for(const command of value.split(';')){
  commands.push(command);const fields=command.split(' '),track=Number(fields[1]);
  if(fields[0]==='gexplore'&&fields[1]!=='off')states.set(track,'Exploring|0|'+fields.slice(2).join(' ')+' 0|');
  if(command==='gexplore off')for(const [track,state] of states)states.set(track,state.replace(/^Exploring/,'Off').replace(/^Preview/,'Recorded'));
  if(fields[0]==='gpreview'){
   const parts=states.get(track).split('|'),values=parts[2].split(' ');
   if(fields.length===5)values[Number(fields[3])===2?0:Number(fields[3])+1]=fields[4];
   states.set(track,'Preview|'+fields[2]+'|'+values.join(' ')+'|');
  }
 }
 return originalSet?.(key,value);
};
seqState.recording=false;seqState.countingIn=false;seqState.playing=false;endEdit();resetRecPass();seqCmdFlush();commands=[];
const visit=level=>{let page=chord.chordPage();page.goToPage(page.ctl.pages.findIndex(candidate=>candidate.level===level));return page;};
const flush=()=>{for(let index=0;index<8;index++){now+=101;chord.tickChord();chord.chordPage().tick();}seqCmdFlush();};
const capture=(name,blankSlots)=>{
 const pixels=new Uint8Array(128*64);globalThis.clear_screen=()=>pixels.fill(0);
 globalThis.fill_rect=(x,y,width,height,color)=>{for(let row=Math.max(0,y);row<Math.min(64,y+height);row++)for(let col=Math.max(0,x);col<Math.min(128,x+width);col++)pixels[row*128+col]=color?255:0;};
 now+=4000;flush();chord.chordPage().ctl.state.peek=null;chord.renderChord();
 for(const slot of blankSlots)for(let row=32;row<55;row++)for(let col=(slot%4)*32;col<(slot%4+1)*32;col++)assert.equal(pixels[row*128+col],0,'unused cell must stay blank');
 const png=new PNG({width:512,height:256});for(let row=0;row<256;row++)for(let col=0;col<512;col++){const offset=(row*512+col)*4,value=pixels[Math.floor(row/4)*128+Math.floor(col/4)];png.data[offset]=png.data[offset+1]=png.data[offset+2]=value;png.data[offset+3]=255;}
 mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/'+name+'.png',PNG.sync.write(png));
};
let page=visit('cp_generator_browser');
assert.deepEqual(Array.from({length:4},(_,knob)=>page.keyAt(knob)),generator.generatorBrowseKeys);
chord.chordMidi([176,71,4]);flush();
assert.equal(generator.generatorActor(),'Bass');assert.equal(generator.generatorTarget(2,1),1);
assert.match(chord.chordPage().ctl.page.name,/Bass T2 Browse/);capture('bass-generator-browser',[4,5,6]);
const port=chord.chordPanelPort(3);port.getParam('midi_fx1:chain_params');commands=[];
port.setParam('midi_fx1:cg_genre','Jazz');flush();
assert.equal(generator.generatorRead('cg_style',1),'Root / Fifth','filtering never changes the sounding selection');
assert(generator.generatorParameters().find(meta=>meta.key==='cg_family').options.includes('Sync'));
assert.equal(commands.length,0,'genre is navigation only');
port.setParam('midi_fx1:cg_family','Sync');port.setParam('midi_fx1:cg_complexity','85');
assert.equal(generator.generatorRead('cg_style',1),'Sparse');
assert.deepEqual(generator.generatorParameters().find(meta=>meta.key==='cg_style').options,['Sparse']);
page=visit('cp_comp_generator');assert.match(page.ctl.page.name,/Bass T2 Generator/);capture('bass-generator-controls',[5,6]);
chord.chordMidi([144,3,127]);chord.chordMidi([128,3,0]);seqCmdFlush();
assert(commands.some(command=>command.startsWith('gexplore 1 6 ')));
assert(!commands.some(command=>/^(pload|clipfill|launch|aset|alabel)\b/.test(command)));
commands=[];chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);seqCmdFlush();
assert(commands.includes('rec 1'));assert(!commands.some(command=>/^(jrec|rec 0|rec 2)\b/.test(command)));
seqState.recording=true;recPassTick();commands=[];
assert.equal(generator.generatorWrite('cg_actor','Comp',1),false);assert.equal(generator.generatorActor(),'Bass');assert.equal(commands.length,0);
seqState.recording=false;seqState.countingIn=false;recPassTick();endEdit();resetRecPass();
generator.generatorWrite('cg_actor','Comp',1);flush();assert(commands.includes('gexplore off'));
generator.generatorWrite('cg_actor','Bass',2);flush();
assert.equal(generator.generatorRead('cg_complexity',1),'85');assert.equal(generator.generatorRead('cg_genre',1),'Jazz');
// Recalled Bass recipes and ordinary Record target Bass, including one Undo pass.
states.set(1,'Recorded|0|7 42 81 93 768|');now+=101;
assert.equal(generator.generatorRead('cg_style',1),'Syncopated');assert.equal(generator.generatorRead('cg_seed',1),'93');
page=visit('cp_comp_generator');commands=[];
chord.chordMidi([176,71,4]);flush();assert(commands.some(command=>command.startsWith('gpreview 1 0 0 ')));
chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);seqCmdFlush();assert(commands.includes('rec 1'));
seqState.recording=true;recPassTick();seqState.curStep=63;recPassTick();seqState.curStep=0;recPassTick();
seqState.recording=false;recPassTick();seqCmdFlush();
assert.equal(commands.filter(command=>command.startsWith('usnap ')).length,1);
assert.equal(commands.filter(command=>command.startsWith('ucommit ')).length,1);
generator.generatorStop();endEdit();resetRecPass();seqCmdFlush();
// Reassigning Bass uses the configured destination and a separate draft.
port.setParam('midi_fx1:cp_bass_track','6');flush();
assert.equal(chord.chordSnapshot().bass,5);assert.equal(generator.generatorTarget(2,5),5);
assert.equal(generator.generatorRead('cg_complexity',5),'25');
page=visit('cp_comp_generator');commands=[];
chord.chordMidi([144,3,127]);chord.chordMidi([128,3,0]);seqCmdFlush();assert(commands.some(command=>command.startsWith('gexplore 5 4 ')));
generator.generatorStop();chord.restoreChord(null);generator.generatorWrite('cg_actor','Comp',5);flush();
globalThis.host_module_get_param=originalGet;globalThis.host_module_set_param_blocking=originalSet;
console.log('Actor generator: physical actor navigation, genre filtering without mutation, independent drafts, Bass Record/overdub Undo and reassigned destinations pass');
