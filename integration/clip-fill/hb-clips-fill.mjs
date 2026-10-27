import './hb-part-library.mjs';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const fill=await import('../dist/esm/seq/clips-fill.js');
const view=await import('../dist/esm/seq/clips-view.js');
const layout=await import('../dist/esm/seq/clips-layout.js');
const {sessionPad}=await import('../dist/esm/seq/session.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {appState,VIEW_KNOBS}=await import('../dist/esm/app/state.js');
const originalGet=globalThis.host_module_get_param,originalWrite=globalThis.host_module_set_param_blocking;
let reads=0,result='Filled - Undo available',drumPreview=false,stalePreview=false;const commands=[],previewRequests=[];
globalThis.host_module_get_param=key=>{
 if(key.startsWith('fill_preview_'))previewRequests.push(key.slice(13));
 if(key.startsWith('fill_preview_')){reads++;return drumPreview?'abc|384|5|0,24,36,117;0,24,38,73;96,48,42,41;192,24,46,100;288,24,49,90|drums|36,38,42,46,49':(stalePreview?'bcd':'abc')+'|384|3|0,24,60,100;96,48,64,90;288,24,67,80|melodic|60,64,67';}
 if(key.startsWith('fill_target_'))return 'def';
 if(key==='part_result')return result;
 return originalGet(key);
};
globalThis.host_module_set_param_blocking=(key,value)=>{commands.push([key,value]);return originalWrite?.(key,value);};
seqState.sessionMode=true;seqState.recording=false;seqState.countingIn=false;appState.currentView=VIEW_KNOBS;appState.focusGroup=0;
layout.setClipsPage(1);view.clipsMidi([176,75,1]);assert(fill.fillActive());assert.equal(layout.clipsPage,0);assert.equal(reads,1);
for(let count=0;count<10;count++){fill.renderFill();fill.fillTick();}assert.equal(reads,1,'drawing and ticking do not reread sources');
view.clipsMidi([176,72,1]);assert.equal(reads,1,'turns are coalesced');
const previousNow=Date.now;Date.now=()=>previousNow()+80;fill.fillTick();Date.now=previousNow;assert.equal(reads,2);assert(commands.every(([,value])=>!value.includes('clipfill')),'browsing is read-only');
sessionPad(68,68);
const write=commands.find(([key,value])=>key==='cmd'&&value.includes('clipfill'))?.[1];
assert(write?.includes('clipfill 3 0 def 1_1_2_0_1_0 abc '),write);
assert(commands.filter(([key])=>key==='cmd').map(([,value])=>value).join(';').includes('ucommit'),'single Undo edit');
assert(!commands.some(([,value])=>/\blaunch\b/.test(value)),'filling never launches');assert(seqState.session[3].exist&1);
// Shift+K1/K3 independently vary pitch-group order and rhythm phase. The
// selected donor clips are unchanged, and browsing never writes MIDI or clips.
commands.length=0;appState.shiftHeld=true;
view.clipsMidi([176,71,1]);view.clipsMidi([176,73,1]);appState.shiftHeld=false;
const readsBeforeVariant=reads;
fill.renderFill();fill.fillTick();assert.equal(reads,readsBeforeVariant,'variation browsing is coalesced');
fill.fillCell(3,0);assert(!commands.some(([,value])=>value.includes('clipfill')),'pending variation cannot write');
Date.now=()=>previousNow()+80;fill.fillTick();Date.now=previousNow;
assert.equal(reads,readsBeforeVariant+1);
commands.length=0;sessionPad(68,68);
assert(commands.some(([,value])=>value.includes('clipfill 3 0 def 1_1_2_0_1_0_1_1 abc ')),
    'phase and pitch variants use the same preview/write/Undo path');
assert(commands.some(([,value])=>value.includes('ucommit')),'variation writes are undoable');

// Two A/B memories capture both source picks and independent phase controls,
// but recall remains a read-only preview until the ordinary pad write.
commands.length=0;appState.shiftHeld=true;view.clipsMidi([176,75,1]);appState.shiftHeld=false;// save A (P1 R1)
const beforeSaveReads=reads;fill.renderFill();assert.equal(reads,beforeSaveReads,'save A makes no native reads');
appState.shiftHeld=true;view.clipsMidi([176,71,1]);appState.shiftHeld=false;// draft P2 R1
appState.shiftHeld=true;view.clipsMidi([176,76,1]);appState.shiftHeld=false;// save B too early
Date.now=()=>previousNow()+80;fill.fillTick();Date.now=previousNow;
appState.shiftHeld=true;view.clipsMidi([176,76,1]);appState.shiftHeld=false;// save valid B
stalePreview=true;
const beforeStaleRead=reads;appState.shiftHeld=true;view.clipsMidi([176,77,1]);appState.shiftHeld=false;// attempt recall A
assert.equal(reads,beforeStaleRead+1,'recall checks donor fingerprint exactly once');
stalePreview=false;
commands.length=0;sessionPad(68,68);
assert(commands.some(([,value])=>value.includes('clipfill 3 0 def 1_1_2_0_1_0_2_1 abc ')),
    'stale bookmark refusal keeps the current draft untouched');
commands.length=0;appState.shiftHeld=true;view.clipsMidi([176,77,1]);appState.shiftHeld=false;// recall A
sessionPad(68,68);
assert(commands.some(([,value])=>value.includes('clipfill 3 0 def 1_1_2_0_1_0_1_1 abc ')),
    'recall A commits exactly the original source and variation');
commands.length=0;appState.shiftHeld=true;view.clipsMidi([176,78,1]);appState.shiftHeld=false;// recall B
sessionPad(68,68);
assert(commands.some(([,value])=>value.includes('clipfill 3 0 def 1_1_2_0_1_0_2_1 abc ')),
    'recall B preserves the separate draft variation');
appState.shiftHeld=true;view.clipsMidi([176,77,1]);appState.shiftHeld=false;// back to P1 R1
commands.length=0;appState.shiftHeld=true;
view.clipsMidi([176,71,127]);view.clipsMidi([176,73,127]);appState.shiftHeld=false;
Date.now=()=>previousNow()+80;fill.fillTick();Date.now=previousNow;
commands.length=0;sessionPad(68,68);
assert(commands.some(([,value])=>value.includes('clipfill 3 0 def 1_1_2_0_1_0 abc ')),
    'zero offsets restore exact original six-field request');
commands.length=0;seqState.recording=true;sessionPad(69,68);assert(!commands.some(([,value])=>value.includes('clipfill')));seqState.recording=false;
result='error:Source changed - preview again';seqState.session[3].exist=0;sessionPad(68,68);assert.equal(seqState.session[3].exist,0,'failed writes cannot claim success');
const pixels=new Uint8Array(128*64);globalThis.clear_screen=()=>pixels.fill(0);globalThis.fill_rect=(x,y,width,height,color)=>{for(let row=Math.max(0,y);row<Math.min(64,y+height);row++)for(let col=Math.max(0,x);col<Math.min(128,x+width);col++)pixels[row*128+col]=color?255:0;};
fill.renderFill();const png=new PNG({width:512,height:256});for(let row=0;row<256;row++)for(let col=0;col<512;col++){const offset=(row*512+col)*4,value=pixels[Math.floor(row/4)*128+Math.floor(col/4)];png.data[offset]=png.data[offset+1]=png.data[offset+2]=value;png.data[offset+3]=255;}
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/clip-fill.png',PNG.sync.write(png));
commands.length=0;result='Filled - Undo available';
view.clipsMidi([176,76,1]);view.clipsMidi([176,76,1]);
Date.now=()=>previousNow()+80;fill.fillTick();Date.now=previousNow;
fill.fillCell(0,5);
assert(commands.some(([,value])=>value.includes('clipfill 0 5 def 1_1_2_0_1_2 abc ')),'Original phrase uses same preview/write path and actual conductor cell');
assert(!commands.some(([,value])=>/\blaunch\b/.test(value)),'conductor fill does not launch');

// Drum sources automatically use Original, and do not require an HB destination.
drumPreview=true;seqState.drumOutputs=(1<<4)|(1<<8);commands.length=0;
view.clipsMidi([176,71,1]);view.clipsMidi([176,71,1]);view.clipsMidi([176,71,1]);
Date.now=()=>previousNow()+80;fill.fillTick();Date.now=previousNow;
const readsBeforeDrumDraw=reads;fill.renderFill();
assert(pixels.slice(14*128+21,18*128).some(Boolean),'first drum lane is plotted');
const firstLanePage=pixels.slice();view.clipsMidi([176,76,1]);fill.renderFill();
assert.notDeepEqual(pixels,firstLanePage,'knob 6 pages distinct drum lanes');
assert.equal(reads,readsBeforeDrumDraw,'lane paging and drawing use the cached preview');
const drumPng=new PNG({width:512,height:256});
view.clipsMidi([176,76,127]);fill.renderFill();
for(let row=0;row<256;row++)for(let col=0;col<512;col++){const offset=(row*512+col)*4,value=pixels[Math.floor(row/4)*128+Math.floor(col/4)];drumPng.data[offset]=drumPng.data[offset+1]=drumPng.data[offset+2]=value;drumPng.data[offset+3]=255;}
writeFileSync('artifacts/drum-clip-fill.png',PNG.sync.write(drumPng));
fill.fillCell(8,5);
assert(commands.some(([,value])=>value.includes('clipfill 8 5 def 4_1_2_0_1_2 abc drums own')),'drums use raw kit addresses and the same undoable command');
assert(seqState.session[8].exist&(1<<5));assert(!commands.some(([,value])=>/\blaunch\b/.test(value)));
commands.length=0;fill.fillCell(2,5);assert(!commands.some(([,value])=>value.includes('clipfill')),'drums cannot replace melodic content');
result='error:Source changed - preview again';seqState.session[8].exist=0;fill.fillCell(8,5);assert.equal(seqState.session[8].exist,0);
view.clipsMidi([176,72,1]);commands.length=0;fill.fillCell(8,5);assert(!commands.some(([,value])=>value.includes('clipfill')),'pending source preview blocks writes');
seqState.drumOutputs=0;drumPreview=false;
view.clipsMidi([176,51,127]);assert(!fill.fillActive());
fill.setFillActive(true);seqState.sessionMode=false;fill.fillTick();seqState.sessionMode=true;assert(!fill.fillActive(),'mode changes disarm writes');
// Actor libraries use the same grid, native preview and single write boundary.
const {partStockCount}=await import('../dist/esm/seq/part-library.js');
const {saveUserPart}=await import('../dist/esm/seq/part-storage.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const settle=()=>{Date.now=()=>previousNow()+80;fill.fillTick();Date.now=previousNow;};
const turn=(index,direction=1)=>view.clipsMidi([176,71+index,direction>0?1:127]);
fill.setFillActive(true);commands.length=0;result='Filled - Undo available';
for(let index=0;index<12;index++)turn(0);
settle();assert.equal(previewRequests.at(-1),'16_0_2_0_0_2','Comp library defaults to its own phrasing and length');
assert(!commands.some(([,value])=>value.includes('clipfill')||value.includes('pload')),'browsing never loads a temporary source clip');
fill.fillCell(2,6);
assert(commands.some(([,value])=>value.includes('clipfill 2 6 def 16_0_2_0_0_2 abc ')));
turn(1);turn(4);turn(4);settle();
assert.equal(previewRequests.at(-1),'16_1_2_0_2_2');
appState.shiftHeld=true;turn(4);appState.shiftHeld=false;
turn(0);settle();assert.equal(previewRequests.at(-1),'17_0_2_0_0_2','Bass owns its own actor list');
appState.shiftHeld=true;turn(5);turn(6);appState.shiftHeld=false;
assert.equal(previewRequests.at(-1),'16_1_2_0_2_2','A/B restores the actor, entry and length together');
for(let index=1;index<partStockCount('comp');index++)turn(1);
settle();assert.equal(previewRequests.at(-1),`16_${partStockCount('comp')}_2_0_0_2`);
assert(commands.some(([,value])=>value.includes(`filllibrary 16 ${partStockCount('comp')} abcd`)),'saved payload is staged without occupying a clip');
const libraryReads=reads,libraryCommands=commands.length;
for(let index=0;index<12;index++){fill.renderFill();fill.fillTick();}
assert.equal(reads,libraryReads);assert.equal(commands.length,libraryCommands,'rendering never transfers or decodes saved entries');
const libraryPng=new PNG({width:512,height:256});
for(let row=0;row<256;row++)for(let col=0;col<512;col++){const offset=(row*512+col)*4,value=pixels[Math.floor(row/4)*128+Math.floor(col/4)];libraryPng.data[offset]=libraryPng.data[offset+1]=libraryPng.data[offset+2]=value;libraryPng.data[offset+3]=255;}
writeFileSync('artifacts/fill-library.png',PNG.sync.write(libraryPng));
const targetPort=portFor(2),originalParam=targetPort.getParam.bind(targetPort);let synth='wrong';
targetPort.getParam=key=>key==='synth_module'?synth:originalParam(key);
commands.length=0;fill.fillCell(2,6);assert(!commands.some(([,value])=>value.includes('clipfill')),'saved instrument requirement remains enforced');
synth='probe';fill.fillCell(2,6);assert(commands.some(([,value])=>value.includes('clipfill')),'matching instrument may load the saved recipe');
appState.shiftHeld=true;turn(4);appState.shiftHeld=false;
const oldReadFile=globalThis.host_read_file,oldWriteFile=globalThis.host_write_file;let libraryText='';
globalThis.host_write_file=(_path,text)=>{libraryText=text;};globalThis.host_read_file=()=>libraryText;
assert(saveUserPart(0,{payload:'5678',synth:'probe'},'comp'));
globalThis.host_read_file=oldReadFile;globalThis.host_write_file=oldWriteFile;
commands.length=0;const beforeStaleRecall=reads;
appState.shiftHeld=true;turn(6);appState.shiftHeld=false;fill.fillCell(2,6);
assert.equal(reads,beforeStaleRecall,'a replaced user slot cannot silently replace a bookmarked source');
assert(!commands.some(([,value])=>value.includes('clipfill')));
turn(1);settle();commands.length=0;fill.fillCell(2,6);
assert(!commands.some(([,value])=>value.includes('clipfill')),'empty user slots cannot write');
targetPort.getParam=originalParam;fill.setFillActive(false);
globalThis.host_module_get_param=originalGet;globalThis.host_module_set_param_blocking=originalWrite;
console.log('Clip Fill: source picks, read-only preview, actual grid destination, Undo, no launch, recording and failure guards pass');
console.log('Fill libraries: actor/style selection, saved previews, original length, A/B identity, instrument and stale-slot guards pass');
