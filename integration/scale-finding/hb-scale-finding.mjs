import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installEnv} from './env.mjs';
installEnv();
await import('../dist/esm/app/globals.js');
const {installMockEngine}=await import('./mock-engine.mjs');
installMockEngine();
const {seqEngineTick}=await import('../dist/esm/seq/engine.js');
seqEngineTick();
const {appState,VIEW_KNOBS}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {keyboardState}=await import('../dist/esm/keyboard/state.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {seqHandleMidi}=await import('../dist/esm/seq/router.js');
const {padsPlayNotes}=await import('../dist/esm/seq/router-pads.js');
const {ledFrameReset}=await import('../dist/esm/seq/led-cache.js');
const buttons=await import('../dist/esm/seq/router-buttons.js');
const scale=await import('../dist/esm/seq/scale-finding.js');
const chord=await import('../dist/esm/seq/chord-play.js');
const metadata=JSON.parse(readFileSync(process.env.HB_MODULE,'utf8'));
const writes=[];
for(let track=0;track<16;track++){
    const port=portFor(track);
    const values=new Map(metadata.capabilities.chain_params.map(entry=>[
        entry.key,String(entry.default??entry.options?.[0]??'0')]));
    port.getParam=key=>{
        if(key==='midi_fx1_module')return 'harmonybus';
        const bare=key.split(':').at(-1);
        if(bare==='chain_params')return JSON.stringify(metadata.capabilities.chain_params);
        if(bare==='ui_hierarchy')return JSON.stringify(metadata.capabilities.ui_hierarchy);
        return values.get(bare)??'';
    };
    port.getMany=keys=>keys.map(key=>port.getParam(key));
    port.setParam=(key,value)=>{writes.push([track,key,value]);values.set(key.split(':').at(-1),value);return true;};
}
selectTrack(3);seqState.sessionMode=false;appState.currentView=VIEW_KNOBS;
chord.setChordEnabled(false);
keyboardState.columnOffset=0;
scale.setScaleFindingEnabled(true);
assert(scale.scaleFindingActive());
assert.equal(buttons.sessionPlayMode(),8);
assert.equal(padsPlayNotes(),false,'Scale Finding replaces instrumental pad notes');
assert.deepEqual(scale.scaleFindingColors().filter((color,index)=>index%8===0),
    [120,120,120,120],'white tonic appears in all four rows continuously');
const fifthPad=24+4; // top Major row, fifth degree G
let choice=scale.scalePadSelection(fifthPad);
assert.equal(choice.tonic,7);
assert.equal(choice.scale,'Mixolydian');
assert.equal(choice.display,'G Mixolydian');
assert.equal(choice.supported,true);
const priorWrites=writes.length;
assert(scale.selectScaleFindingPad(fifthPad));
assert.equal(writes.length,priorWrites,'unarmed selection is strictly visual');
assert.equal(scale.scaleFindingColors()[fifthPad],11,'chosen pad is play-green');
assert.equal(scale.scaleFindingColors()[24],120,'the other reference-tonic column pad is white');
assert(scale.scaleFindingMidi([144,6,127]),'K7 touch arms selection');
assert.equal(scale.scaleFindingSnapshot().armed,true);
seqHandleMidi([144,24+68-24+4,100]); // MIDI pad note 68+28
assert.deepEqual(writes.slice(-3),[
    [0,'midi_fx1:key_center_tonic','G'],
    [0,'midi_fx1:key_center_explicit_scale','Mixolydian'],
    [0,'midi_fx1:key_center_apply','Apply']
],'commit uses the existing shared HB key-center operation, not follower settings');
assert.equal(scale.scaleFindingSnapshot().committedPad,fifthPad);
assert.equal(scale.scaleFindingSnapshot().armed,false);
const selectedWrites=writes.length;
seqHandleMidi([128,68+fifthPad,0]);
assert.equal(writes.length,selectedWrites,'release cannot retrigger key commit');
for(const columnOffset of [-7,-1,0,1,7]){
    keyboardState.columnOffset=columnOffset;
    const column=scale.scaleTonicColumn();
    assert(column>=0&&column<8);
    for(let row=0;row<4;row++)assert.equal(scale.scaleFindingColors()[row*8+column],
        row*8+column===fifthPad?11:120,'tonic column remains white with shifting position');
}
keyboardState.columnOffset=0;
const frames=[];
globalThis.move_midi_internal_send=packet=>{frames.push([...packet]);return true;};
ledFrameReset();
assert(scale.paintScaleFinding(true),'accepted frame completes');
assert(frames.some(packet=>packet.length>=4),'real Move LED packets produced');
const unchanged=writes.length;
scale.renderScaleFinding();
assert.equal(writes.length,unchanged,'rendering never writes native parameters');
scale.setScaleFindingEnabled(false);
assert(!scale.scaleFindingActive());
assert(padsPlayNotes(),'normal note ownership resumes after leaving');
console.log('Scale Finding: no notes, 4x white tonic, green selection, G Mixolydian shared-key Apply, release, shift, LED packet and mode exit pass');
