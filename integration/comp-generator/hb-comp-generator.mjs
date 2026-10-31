import './hb-part-library.mjs';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const chord=await import('../dist/esm/seq/chord-play.js');
const generator=await import('../dist/esm/seq/comp-generator.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {stepRecActive}=await import('../dist/esm/seq/step-rec.js');
const {applyLaneMapping}=await import('../dist/esm/seq/lane-mapping.js');
const {validateLane}=await import('../dist/esm/seq/automation.js');
const {panelSpec}=await import('../dist/esm/renderer/panel-catalog.js');
const originalGet=globalThis.host_module_get_param,originalSet=globalThis.host_module_set_param_blocking;
let state='Off|0|0 32 64 1 0|',commands=[];
globalThis.host_module_get_param=key=>key==='generator_info_2'?state:originalGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 commands.push([key,value]);
 if(key==='cmd')for(const command of value.split(';')){
  if(command.startsWith('gexplore 2 '))state='Exploring|0|'+command.slice(11)+' 0|Explore';
  if(command==='gexplore off')state='Off|0|0 32 64 1 0|Stopped';
  if(command.startsWith('gbake 2 0'))state='Off|0|0 32 64 1 0|Baked - Undo available';
 }
 return originalSet?.(key,value);
};
chord.restoreChord(null);chord.setChordEnabled(true);seqState.recording=false;seqState.countingIn=false;seqState.playing=false;
let page=chord.chordPage();let index=page.ctl.pages.findIndex(entry=>entry.level==='cp_comp_generator');assert(index>=0);page.goToPage(index);
assert.equal(panelSpec('Chord Play',page.ctl.page).group,'Libraries');
assert.equal(panelSpec('Chord Play',page.ctl.page).owner,'Comp');
assert.deepEqual(Array.from({length:generator.generatorKeys.length},(_,knob)=>page.keyAt(knob)),generator.generatorKeys);assert.equal(page.keyAt(7),'cp_off');
const port=chord.chordPanelPort(3);port.getParam('midi_fx1:chain_params');
commands=[];port.setParam('midi_fx1:cg_family','Sync');port.setParam('midi_fx1:cg_style','3-3-2');port.setParam('midi_fx1:cg_complexity','80');
assert.equal(generator.generatorRead('cg_style',2),'3-3-2');
assert.deepEqual(generator.generatorParameters().find(meta=>meta.key==='cg_style').options,['Sparse','3-3-2']);
assert.equal(commands.length,0,'browsing leaves clips and parameters untouched');
// Real capacitive touch starts only an ephemeral source. It never fills/launches.
chord.chordMidi([0x90,3,127]);chord.chordMidi([0x80,3,0]);
assert(commands.some(([key,value])=>key==='cmd'&&value.includes('gexplore 2 3')));
assert(!commands.some(([,value])=>/\b(pload|clipfill|launch|aset|alabel)\b/.test(value)));
assert.equal(generator.generatorRecordCommand(),'rec 2');
commands=[];chord.chordMidi([0xb0,86,127]);chord.chordMidi([0xb0,86,0]);
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');seqCmdFlush();
assert(commands.some(([key,value])=>key==='cmd'&&/(^|;)rec 2(;|$)/.test(value)),JSON.stringify(commands));
assert(!commands.some(([,value])=>value.includes('jrec')),'generator record cannot overwrite conductor');
assert(!stepRecActive(),'stopped generator Record uses count-in, not chord step entry');
commands=[];generator.generatorStop();seqCmdFlush();assert(commands.some(([,value])=>value.includes('gexplore off')));
// Internal lanes survive the standard registry without being mapped to a synth.
let writes=0;assert(applyLaneMapping(()=>{writes++;return true;},1,'generator:intensity'));assert.equal(writes,0);
assert.deepEqual(validateLane('generator:complexity',null,()=>null),{min:0,max:127,type:'int'});
// Recorded take Bake is one ordinary Undo edit.
state='Recorded|0|3 100 64 1 768|Recorded';commands=[];generator.generatorTouch('cg_bake',2,true);seqCmdFlush();
assert(commands.some(([,value])=>value.includes('gbake 2 0')));
assert(commands.some(([,value])=>value.includes('ucommit')));
// Record and Explore use the shared small-screen renderer.
chord.setChordEnabled(false);chord.setChordEnabled(true);page=chord.chordPage();page.goToPage(page.ctl.pages.findIndex(entry=>entry.level==='cp_comp_generator'));
const pixels=new Uint8Array(128*64);globalThis.clear_screen=()=>pixels.fill(0);globalThis.fill_rect=(x,y,width,height,color)=>{for(let row=Math.max(0,y);row<Math.min(64,y+height);row++)for(let col=Math.max(0,x);col<Math.min(128,x+width);col++)pixels[row*128+col]=color?255:0;};
chord.renderChord();const png=new PNG({width:512,height:256});for(let row=0;row<256;row++)for(let col=0;col<512;col++){const offset=(row*512+col)*4,value=pixels[Math.floor(row/4)*128+Math.floor(col/4)];png.data[offset]=png.data[offset+1]=png.data[offset+2]=value;png.data[offset+3]=255;}
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/comp-generator.png',PNG.sync.write(png));
globalThis.host_module_get_param=originalGet;globalThis.host_module_set_param_blocking=originalSet;
console.log('Comp generator: actor/family/style controls, temporary exploration, physical Record routing, lane recall and one-Undo Bake pass');
