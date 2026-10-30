import './hb-generator-phrases.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const generator=await import('../dist/esm/seq/comp-generator.js');
const library=await import('../dist/esm/seq/part-library.js');
const storage=await import('../dist/esm/seq/part-storage.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const {resetRecPass,recPassTick}=await import('../dist/esm/undo/rec-pass.js');
const {endEdit}=await import('../dist/esm/undo/group.js');
const oldGet=globalThis.host_module_get_param,oldSet=globalThis.host_module_set_param_blocking,oldRead=globalThis.host_read_file,oldWrite=globalThis.host_write_file;
let now=Date.now()+1000,owner=-1,commands=[],stored='',exportPayload='70617274320a00';Date.now=()=>now;
const states=new Map([[1,'Off|0|12 32 64 37 1536||-1|0'],[2,'Off|0|8 32 64 37 1536||-1|0']]);
globalThis.host_read_file=()=>stored;globalThis.host_write_file=(_path,text)=>{stored=text;};
globalThis.host_module_get_param=key=>key.startsWith('generator_info_')?states.get(Number(key.slice(15))):key.startsWith('part_export_')?exportPayload:key.startsWith('motif_clip_info_')?'0,abc,64,0,0,1':oldGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 if(key==='cmd')for(const command of value.split(';')){
  commands.push(command);const fields=command.split(' '),track=Number(fields[1]);
  if(fields[0]==='guser'){
   if(fields[2]==='edit'){const parts=states.get(track).split('|'),config=parts[2].split(' ');config[Number(fields[3])===2?0:Number(fields[3])+1]=fields[4];parts[2]=config.join(' ');states.set(track,parts.join('|'));}
   else states.set(track,'Exploring|0|'+(fields[2]==='bass'?12:8)+' 32 64 37 1536|Explore saved recipe - Rec saves to an empty clip|'+owner+'|1');
  }
  if(fields[0]==='gexplore'&&fields[1]==='off'){owner=-1;for(const [track,state] of states)states.set(track,state.replace(/^Exploring/,'Off').replace(/\|1$/,'|0'));}
  if(fields[0]==='rec'){
   if(owner<0){owner=track;states.set(track,states.get(track).replace(/^Exploring/,'Overdub').replace(/\|-1\|1$/,'|'+owner+'|0'));}
   else {states.set(owner,states.get(owner).replace(/^Overdub/,'Recorded').replace(/\|[0-9]+\|0$/,'|-1|0'));owner=-1;}
  }
 }
 return oldSet?.(key,value);
};
const refresh=()=>{now+=101;chord.tickChord();chord.chordPage().tick();seqCmdFlush();};
const visit=level=>{const page=chord.chordPage();page.goToPage(page.ctl.pages.findIndex(item=>item.level===level));return page;};
const applyReview=()=>{library.partModalTouch(1,true);library.partModalTouch(1,false);assert(library.drawPartReview());library.partModalTouch(0,true);library.partModalTouch(0,false);};
chord.restoreChord(null);chord.setChordEnabled(true);generator.generatorTarget(2,1);
for(const [kind,actor,track,style] of [['comp','Comp',2,8],['bass','Bass',1,12]]){
 seqState.recording=false;seqState.countingIn=false;seqState.playing=false;endEdit();resetRecPass();generator.generatorStop();refresh();
 const context={track,conductor:0,kind,activate:()=>{throw new Error('temporary recipe must not activate a persistent library load');}};
 states.set(track,'Recorded|0|'+style+' 32 64 37 1536||-1|0');refresh();commands=[];
 library.preparePart(context,0,7);applyReview();
 assert.equal(storage.userParts(kind)[7].generator,actor);assert.equal(storage.userParts(kind)[7].payload,exportPayload);
 assert.equal(JSON.parse(stored)[kind][7].generator,actor,'global user file retains recipe identity');
 assert(!commands.some(command=>/^(pload|gbake|clipfill|guser|usnap)\b/.test(command)),'Save changes only the existing global user slot');
 states.set(track,'Off|0|'+style+' 32 64 37 0||-1|0');refresh();commands=[];
 generator.generatorWrite('cg_actor',actor,generator.generatorTarget(2,1));generator.generatorTarget(2,1);
 generator.generatorWrite('cg_genre','All',track);generator.generatorWrite('cg_family','User',track);generator.generatorWrite('cg_style','User 8',track);
 assert.equal(generator.generatorRead('cg_family',track),'User');assert.equal(generator.generatorRead('cg_style',track),'User 8');assert.equal(commands.length,0);
 // Existing library Load becomes an explicit temporary Explore review for a recipe.
 library.preparePart(context,library.partStockCount(kind)+7);applyReview();refresh();
 assert.equal(generator.generatorActor(),actor);assert.equal(generator.generatorTarget(2,1),track);
 assert(commands.some(command=>command==='guser '+track+' '+kind+' '+exportPayload));
 assert(!commands.some(command=>/^(pload|clipfill|aset|alabel|usnap)\b/.test(command)));
 assert.equal(generator.generatorWrite('cg_seed','2',track),false);
 assert(generator.generatorWrite('cg_complexity','90',track));assert(generator.generatorWrite('cg_intensity','70',track));seqCmdFlush();
 assert(commands.some(command=>command.startsWith('guser '+track+' edit 0 ')));
 visit('cp_comp_generator');chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);seqCmdFlush();refresh();
 assert.equal(owner,track);seqState.recording=true;recPassTick();
 assert.notEqual(generator.generatorRead('cg_family',track),'User','adopted recipe returns to ordinary recorded controls');
 chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);seqCmdFlush();seqState.recording=false;recPassTick();seqCmdFlush();
 assert.equal(commands.filter(command=>command.startsWith('usnap ')).length,1);assert.equal(commands.filter(command=>command.startsWith('ucommit ')).length,1);
}
const reloaded=await import('../dist/esm/seq/part-storage.js?recipe-reload');assert.equal(reloaded.userParts('comp')[7].generator,'Comp');assert.equal(reloaded.userParts('bass')[7].generator,'Bass');
// Recipe identity comes from its payload even if optional display metadata is absent.
delete storage.userParts('comp')[7].generator;generator.generatorStop();refresh();commands=[];
library.preparePart({track:2,kind:'comp',conductor:0,activate:()=>{throw new Error('recipe metadata must not control persistence');}},library.partStockCount('comp')+7);applyReview();
assert(commands.some(command=>command.startsWith('guser 2 comp ')));assert(!commands.some(command=>command.startsWith('pload ')));
// Old note-style payloads stay ordinary entries, and actor mismatches cannot be saved.
exportPayload='abcd';library.preparePart({track:2,kind:'comp',conductor:0,activate:()=>{}},0,6);applyReview();assert.equal(storage.userParts('comp')[6].generator,undefined);
const before=stored;exportPayload='70617274320a00';states.set(2,'Recorded|0|12 32 64 37 1536||-1|0');
library.preparePart({track:2,kind:'comp',conductor:0,activate:()=>{}},0,6);applyReview();assert.equal(stored,before);
generator.generatorStop();chord.restoreChord(null);generator.generatorWrite('cg_actor','Comp',1);endEdit();resetRecPass();
globalThis.host_module_get_param=oldGet;globalThis.host_module_set_param_blocking=oldSet;globalThis.host_read_file=oldRead;globalThis.host_write_file=oldWrite;
console.log('Generator user library: both actors save without Bake, metadata reload, temporary library review/browser, physical Record and one Undo pass');
