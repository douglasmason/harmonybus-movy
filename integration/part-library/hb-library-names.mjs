import './hb-generator-library.mjs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {PNG} from 'pngjs';
const chord=await import('../dist/esm/seq/chord-play.js');
const generator=await import('../dist/esm/seq/comp-generator.js');
const library=await import('../dist/esm/seq/part-library.js');
const storage=await import('../dist/esm/seq/part-storage.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const {partRead,partWrite}=await import('../dist/esm/seq/part-controls.js');
const oldGet=globalThis.host_module_get_param,oldSet=globalThis.host_module_set_param_blocking,oldRead=globalThis.host_read_file,oldWrite=globalThis.host_write_file;
let now=Date.now()+1000,stored='',commands=[];Date.now=()=>now;
const summaries=new Map([[2,'ps1|64|8,9,11|7|Comp-Generator'],[1,'ps1|32|12|0|Bass-Generator']]);
const states=new Map([[2,'Recorded|0|8 64 80 1 1536||-1|0'],[1,'Recorded|0|12 64 80 1 768||-1|0']]);
const payload='70617274320a00';
globalThis.host_read_file=()=>stored;globalThis.host_write_file=(_path,text)=>{stored=text;};
globalThis.host_module_get_param=key=>key.startsWith('part_summary_')?summaries.get(Number(key.slice(13))):key.startsWith('generator_info_')?states.get(Number(key.slice(15))):key.startsWith('part_export_')?payload:key.startsWith('motif_clip_info_')?'0,abc,64,0,0,1':oldGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>{
 if(key==='cmd')for(const command of value.split(';')){
  commands.push(command);const fields=command.split(' '),track=Number(fields[1]);
  if(fields[0]==='guser'&&fields[2]!=='edit')states.set(track,'Exploring|0|'+(fields[2]==='bass'?12:8)+' 64 80 1 1536|Explore saved recipe - Rec saves to an empty clip|-1|1');
  if(fields[0]==='gexplore'&&fields[1]==='off')for(const track of [1,2])states.set(track,'Off|0|'+(track===1?12:8)+' 64 80 1 0||-1|0');
 }
 return oldSet?.(key,value);
};
seqState.recording=false;seqState.countingIn=false;seqState.playing=false;
chord.restoreChord(null);chord.setChordEnabled(true);chord.chordPage();generator.generatorTarget(2,1);
const refresh=()=>{now+=150;chord.tickChord();seqCmdFlush();};
const touch=index=>{chord.chordMidi([144,index,127]);chord.chordMidi([128,index,0]);seqCmdFlush();};
const context=(kind,track)=>({kind,track,conductor:0,activate:()=>{throw new Error('metadata editing must not load a clip');}});
const prepare=(kind,track,slot=0,save=false)=>{library.preparePart(context(kind,track),save?0:library.partStockCount(kind)+slot,save?slot:null);library.partModalTouch(6,true);library.partModalTouch(6,false);assert(library.partModalActive());};
for(const [kind,track] of [['comp',2],['bass',1]]){prepare(kind,track,0,true);touch(0);}
assert.equal(storage.userParts('comp')[0].name,'Pop Answer Mix');assert.deepEqual(storage.userParts('comp')[0].genres,['Pop','Funk','Soul']);
assert.equal(storage.userParts('comp')[0].steps,64);assert.equal(storage.userParts('comp')[0].automation,7);
assert.equal(storage.userParts('bass')[0].name,'Pop Answer');assert.equal(storage.userParts('bass')[0].automation,0);
assert.equal(storage.userPartDetails(storage.userParts('comp')[0]),'4 bars / Auto CIS');
assert.equal(storage.userPartDetails(storage.userParts('bass')[0]),'2 bars / Fixed controls');
assert(!commands.some(command=>/^(guser|pload|clipfill|rec|usnap)\b/.test(command)));
storage.saveUserPart(1,{...storage.userParts('comp')[0],name:'Pop only',genres:['Pop']},'comp');
generator.generatorStop();refresh();commands=[];
generator.generatorWrite('cg_actor','Comp',generator.generatorTarget(2,1));generator.generatorTarget(2,1);
assert(generator.generatorWrite('cg_genre','Funk',2));assert(generator.generatorWrite('cg_family','User',2));
assert.equal(generator.generatorRead('cg_style',2),'User 1: Pop Answer Mix');
const styleOptions=()=>generator.generatorParameters().find(parameter=>parameter.key==='cg_style').options;
assert(styleOptions().includes('User 1: Pop Answer Mix'));assert(!styleOptions().includes('User 2: Pop only'));
assert.equal(library.partNamesFor('comp')[library.partStockCount('comp')],generator.generatorRead('cg_style',2));
assert(partWrite('cp_style','User 1: Pop Answer Mix',2));assert.equal(partRead('cp_style',2),'User 1: Pop Answer Mix');
assert.equal(commands.length,0,'filtering and metadata browsing never edit or audition');
generator.generatorTouch('cg_explore',2,true);refresh();assert.equal(generator.generatorRead('cg_genre',2),'Funk');
assert(commands.some(command=>command.startsWith('guser 2 comp ')));
commands=[];assert(generator.generatorWrite('cg_genre','Rock',2));assert(styleOptions().includes('User 1: Pop Answer Mix'),'filter preserves selected source');assert.equal(commands.length,0);
// Real jog/click keyboard, reached through the same Chord Play MIDI route.
prepare('comp',2);touch(2);assert(library.drawPartReview());
commands=[];chord.chordMidi([176,86,127]);chord.chordMidi([176,86,0]);chord.chordMidi([144,16,127]);chord.chordMidi([128,16,0]);seqCmdFlush();
assert(!commands.some(command=>/^(rec|jrec|chord_select|guser)\b/.test(command)),'keyboard owns Record and step presses');
chord.chordMidi([176,14,1]);chord.chordMidi([176,3,127]);chord.chordMidi([176,3,0]); // append b
chord.chordMidi([176,14,63]);chord.chordMidi([176,3,127]);chord.chordMidi([176,3,0]); // confirm
assert.equal(storage.userParts('comp')[0].name,'Pop Answer Mix','name remains staged until Save info');
chord.chordMidi([176,74,1]); // explicit Untagged
touch(4);assert(!library.partModalActive());assert.equal(storage.userParts('comp')[0].name,'Pop Answer Mixb');assert.deepEqual(storage.userParts('comp')[0].genres,[]);
assert.equal(storage.userParts('comp')[0].payload,payload);assert.equal(storage.userParts('comp')[0].steps,64);assert.equal(storage.userParts('comp')[0].automation,7);
assert.equal(commands.length,0,'Save info changes only global metadata');refresh();
assert.equal(generator.generatorRead('cg_style',2),'User 1: Pop Answer Mixb');assert.equal(partRead('cp_style',2),'User 1: Pop Answer Mixb');
// Cancel, failed write and replacement of the reviewed entry cannot overwrite metadata.
const before=stored;prepare('comp',2);chord.chordMidi([176,74,2]);touch(1);assert.equal(stored,before);
prepare('comp',2);chord.chordMidi([176,74,2]);globalThis.host_write_file=()=>{};touch(4);assert(library.partModalActive());assert.equal(stored,before);library.cancelPartReview();globalThis.host_write_file=(_path,text)=>{stored=text;};
prepare('comp',2);chord.chordMidi([176,74,2]);storage.saveUserPart(0,{...storage.userParts('comp')[0],name:'Replacement'},'comp');const replaced=stored;touch(4);assert.equal(stored,replaced);library.cancelPartReview();
// Device-size rendering, including the new details and editing affordances.
storage.saveUserPart(0,{...storage.userParts('comp')[0],name:'Pop Answer Mix',genres:['Pop','Funk','Soul']},'comp');prepare('comp',2);
const pixels=new Uint8Array(128*64);globalThis.clear_screen=()=>pixels.fill(0);globalThis.fill_rect=(x,y,width,height,color)=>{for(let row=Math.max(0,y);row<Math.min(64,y+height);row++)for(let column=Math.max(0,x);column<Math.min(128,x+width);column++)pixels[row*128+column]=color?255:0;};
library.drawPartReview();const png=new PNG({width:512,height:256});for(let row=0;row<256;row++)for(let column=0;column<512;column++){const offset=(row*512+column)*4,value=pixels[Math.floor(row/4)*128+Math.floor(column/4)];png.data[offset]=png.data[offset+1]=png.data[offset+2]=value;png.data[offset+3]=255;}
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/library-names.png',PNG.sync.write(png));library.cancelPartReview();
// A fresh module instance models disk reload, including malformed optional metadata.
const storageCode=transformSync(readFileSync('src/seq/part-storage.ts','utf8'),{loader:'ts',format:'esm'}).code;
const fresh=await import('data:text/javascript;base64,'+Buffer.from(storageCode+'\n// names reload').toString('base64'));
assert.equal(fresh.userParts('comp')[0].name,'Pop Answer Mix');assert.equal(fresh.userParts('bass')[0].steps,32);assert.equal(fresh.userParts('comp')[7].payload,payload);
stored=JSON.stringify({version:2,comp:[{payload:'abcd',synth:'probe',name:'\n bad\t name ',genres:['Pop',42,'bad\n'],steps:-1,automation:99}],bass:[]});
const malformed=await import('data:text/javascript;base64,'+Buffer.from(storageCode+'\n// malformed metadata').toString('base64'));
assert.deepEqual(malformed.userParts('comp')[0],{payload:'abcd',synth:'probe',name:'bad name',genres:['Pop']});
generator.generatorStop();chord.restoreChord(null);globalThis.host_module_get_param=oldGet;globalThis.host_module_set_param_blocking=oldSet;globalThis.host_read_file=oldRead;globalThis.host_write_file=oldWrite;
console.log('Library names: source defaults, genre filters, stable slots, shared labels, real rename keyboard, metadata-only saves/cancellation/failures, reload and validation pass');
