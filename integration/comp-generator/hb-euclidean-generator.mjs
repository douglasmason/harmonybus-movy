import './hb-comp-generator.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const generator=await import('../dist/esm/seq/comp-generator.js');
const storage=await import('../dist/esm/seq/part-storage.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const {resetRecPass}=await import('../dist/esm/undo/rec-pass.js');
const {endEdit}=await import('../dist/esm/undo/group.js');
const originalGet=globalThis.host_module_get_param,originalSet=globalThis.host_module_set_param_blocking;
const states=new Map([[2,'Off|0|0 32 64 1 0||-1|0'],[1,'Off|0|4 32 64 1 0||-1|0']]);
let now=Date.now()+2000,commands=[];Date.now=()=>now;
globalThis.host_module_get_param=key=>key.startsWith('generator_info_')?states.get(Number(key.slice(15))):originalGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 if(key==='cmd')for(const command of value.split(';')){
  commands.push(command);const fields=command.split(' '),track=Number(fields[1]);
  if(fields[0]==='gexplore'&&fields.length===11)states.set(track,'Exploring|0|'+fields.slice(2).join(' ')+'|Explore|-1|0');
  if(fields[0]==='gexplore'&&fields[2]==='off')states.set(track,states.get(track).replace(/^Exploring/,'Off').replace(/^Preview/,'Recorded'));
  if(fields[0]==='gpreview'){
   const state=states.get(track).split('|'),values=state[2].split(' ');if(fields.length===5)values[Number(fields[3])<4?5+Number(fields[3]):2]=fields[4];
   states.set(track,'Preview|0|'+values.join(' ')+'|Preview|-1|0');
  }
 }
 return originalSet?.(key,value);
};
const flush=()=>{for(let index=0;index<6;index++){now+=101;chord.tickChord();chord.chordPage().tick();}seqCmdFlush();};
chord.restoreChord(null);chord.setChordEnabled(true);seqState.recording=false;seqState.countingIn=false;seqState.playing=false;endEdit();resetRecPass();
for(const [actor,track,style] of [['Comp',2,19],['Bass',1,20]]){
 generator.generatorWrite('cg_actor',actor,generator.generatorSelectedTrack());generator.generatorTarget(2,1);now+=101;
 assert(generator.generatorWrite('cg_genre','All',track));assert(generator.generatorWrite('cg_source_style','Euclidean',track));flush();
 let page=chord.chordPage();page.goToPage(page.ctl.pages.findIndex(entry=>entry.level==='cp_comp_generator'));flush();page=chord.chordPage();
 assert.deepEqual(Array.from({length:8},(_,index)=>page.keyAt(index)),generator.euclideanKeys);
 assert.equal(page.keyAt(7),'cg_restore','Euclidean uses the eighth control without a duplicate Harmony Off');
 commands=[];assert(generator.generatorWrite('cg_euclid_steps','7',track));assert(generator.generatorWrite('cg_euclid_rotation','2',track));
 assert(generator.generatorWrite('cg_euclid_rate','1/8',track));assert(generator.generatorWrite('cg_intensity','80',track));
 assert.equal(generator.generatorRead('cg_euclid_rate',track),'1/8');assert.equal(commands.length,0,'draft controls never write or launch a clip');
 assert.equal(generator.generatorWrite('cg_euclid_rate','bad',track),false);
 chord.chordMidi([144,5,127]);chord.chordMidi([128,5,0]);seqCmdFlush();
 const explore=commands.find(command=>command.startsWith(`gexplore ${track} ${style} `));assert(explore);
 assert.deepEqual(explore.split(' ').slice(-4),['3','7','2','1']);
 assert(!commands.some(command=>/^(pload|clipfill|launch|aset|alabel)\b/.test(command)));
 commands=[];chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);seqCmdFlush();
 assert(commands.includes(`rec ${track}`),'physical Record stays with the selected actor');assert(!commands.some(command=>command.startsWith('jrec')));
 seqState.recording=false;seqState.countingIn=false;endEdit();resetRecPass();
 states.set(track,`Recorded|0|${style} 32 64 1 1536 3 7 2 1|Recorded|-1|0`);now+=101;
 assert.equal(generator.generatorRead('cg_euclid_steps',track),'7');commands=[];
 assert(generator.generatorWrite('cg_euclid_rotation','4',track));assert(commands.includes(`gpreview ${track} 0 2 4`));
 assert(generator.generatorWrite('cg_intensity','100',track));assert(commands.includes(`gpreview ${track} 0 4 127`),'intensity keeps its own Euclidean lane');
 assert.equal(generator.generatorWrite('cg_source_style','Quarters',track),false,'saved recipes cannot silently change their source schema');
 commands=[];chord.chordMidi([144,7,127]);chord.chordMidi([128,7,0]);seqCmdFlush();
 assert(commands.includes(`grestore ${track} 0`));assert(!commands.some(command=>/harmony|chord_select/.test(command)));
 generator.generatorStop(track);states.set(track,`Off|0|${style} 32 64 1 0 3 7 2 1||-1|0`);now+=101;
}
const originalRead=globalThis.host_read_file,originalWrite=globalThis.host_write_file,files=new Map();
globalThis.host_write_file=(path,value)=>files.set(path,value);globalThis.host_read_file=path=>files.get(path)??originalRead(path);
assert(storage.saveUserPart(7,{payload:'70617274320a',synth:'plaits',generator:'Comp',euclidean:true,automation:31,steps:32,name:'Euclid test'},'comp'));
assert.equal(storage.userParts('comp')[7].automation,31);assert.match(storage.userPartDetails(storage.userParts('comp')[7]),/Auto HSRTI/);
globalThis.host_read_file=originalRead;globalThis.host_write_file=originalWrite;
globalThis.host_module_get_param=originalGet;globalThis.host_module_set_param_blocking=originalSet;
console.log('Euclidean: both actors, shared eight-knob panel, temporary exploration, Record routing, preview, Restore and saved metadata pass');
