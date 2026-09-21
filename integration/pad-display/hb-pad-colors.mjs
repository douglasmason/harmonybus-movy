import assert from 'node:assert/strict';
import { installEnv } from './env.mjs';
installEnv();
const { colorHarmonyPitch, harmonyPulse, parseHarmonySnapshot, refreshHarmonyPads, padColor } = await import('../dist/esm/seq/pads.js');
const { portFor } = await import('../dist/esm/track/registry.js');
let testTime = 0;
function setMode(mode, track=0) {
    portFor(track).getParam = () => '145,580,2741,1,580,'+mode+',3,0,4,2';
    refreshHarmonyPads(track,testTime+=100);
}
const { trackColor, C_LIGHTGREY } = await import('../dist/esm/seq/colors.js');
const scale = 0xAB5, chord = (1<<0)|(1<<4)|(1<<7), future = (1<<2)|(1<<6)|(1<<9);
const render = (note,phase,current=chord,next=future) => colorHarmonyPitch(note,0,0,scale,current,next,3,phase,0,127,125,true);
for(let note=36;note<84;note++)for(const phase of [0,0.125,0.25,0.5,0.75])
    assert.equal(render(note,phase),render(note+12,phase),'Pitch classes match in every octave');
assert.equal(render(60,0.5),trackColor(0),'Input root returns to track background');
assert.equal(render(64,0.5),C_LIGHTGREY,'Scale member returns to half-white');
assert.equal(render(61,0),0,'Nonmember stays dark');
assert.equal(render(66,0.5),125,'Altered future chord tone overrides dark background');
assert.equal(render(60,0),127,'Current chord pulse peak');
assert.equal(render(60,0.5,chord,chord),125,'Shared tone shows opposite pulse');
assert(Math.abs(harmonyPulse(0.25,0)+harmonyPulse(0.75,0)-0.5)<1e-9,'Smooth permits background between peaks');
assert.equal(harmonyPulse(0.25,2)+harmonyPulse(0.75,2),0,'Square permits a gap');
assert.equal(parseHarmonySnapshot('bad'),null);
assert.deepEqual(parseHarmonySnapshot('145,580,2741,1,580,3,3,0,4,2'),{current:145,effective:580,lookahead:580,scale:2741,ready:true,settings:[3,3,0,4,2]});
setMode(1);
assert.equal(padColor(68,68,0,true),padColor(68,68,0,false),'Playing white/green cannot override harmony colors');
setMode(0);
assert.notEqual(padColor(68,68,0,true),padColor(68,68,0,false),'Standard feedback remains available');
console.log('Harmony pads: pitch classes, root backgrounds, overlap, independent shapes and Standard pass');

const port = portFor(4), originalGet = port.getParam;
let reads = 0;
port.getParam = key => { assert.equal(key,'midi_fx1:pad_view'); reads++; return '145,580,2741,1,580,3,3,0,4,2'; };
refreshHarmonyPads(4,0);
for(let now=1;now<50;now++) refreshHarmonyPads(4,now);
assert.equal(reads,1,'No per-pad or per-frame polling');
refreshHarmonyPads(4,50);assert.equal(reads,2);
refreshHarmonyPads(4,99);assert.equal(reads,2,'Snapshot reads remain bounded');
port.getParam=originalGet;
console.log('Harmony pad polling: one bounded snapshot, global settings read from HB pass');

const { noteOn, noteOff } = await import('../dist/esm/keyboard/handler.js');
const previousLED = globalThis.setLED;
let immediateColor = -1;
globalThis.setLED = (pad, color) => { immediateColor = color; };
setMode(1);
noteOn(68,68,0,100);
assert.equal(immediateColor,padColor(68,68,0,false),'Immediate note-down cannot override harmony background');
noteOff(68,68);
setMode(0);
noteOn(68,68,0,100);
assert.equal(immediateColor,11,'Standard keeps immediate green feedback');
noteOff(68,68);
globalThis.setLED = previousLED;
console.log('Immediate pad touch honors harmony colors and Standard feedback');

assert.equal(colorHarmonyPitch(60,0,0,scale,chord,0,4,0,0,127,125,true),trackColor(0),'Lookahead only never paints current harmony');
assert.equal(parseHarmonySnapshot('145,580,2741,1'),null,'Reject old pitch-mask protocol instead of miscoloring inputs');

// Retained inputs are exact MIDI keys, never rendered chord tones or octave copies.
portFor(0).getParam = () => '0,0,0,0,0,0,3,0,4,2|arp1,1,60';
refreshHarmonyPads(0,testTime+=100);
const {harmonyPadColor}=await import('../dist/esm/seq/pads.js');
assert.equal(harmonyPadColor(60,0),11);
assert.notEqual(harmonyPadColor(72,0),11);
assert.notEqual(harmonyPadColor(64,0),11);
portFor(0).getParam = () => '0,0,0,0,0,0,3,0,4,2|arp1,1';
refreshHarmonyPads(0,testTime+=100);
assert.notEqual(harmonyPadColor(60,0),11,'Clear/toggle-off removes retained input feedback');
console.log('Arp pad view: exact raw inputs, no output/octave ghosts, empty pool clears highlights');

// All layouts color the actual input map, never pad index or rendered pitch.
const { keyboardState, padMapFor } = await import('../dist/esm/keyboard/state.js');
const { C_DARKGREY, C_WHITE } = await import('../dist/esm/seq/colors.js');
const { setFollowerInputScale, setFollowerInputRoot } = await import('../dist/esm/seq/pads.js');
let rawView = '0,0,0,0,0,0,3,0,4,2|arp1,0|input1,0,1,1,2741,145';
const writes=[];
portFor(0).getParam = () => rawView;
portFor(0).setParam = (key,value) => writes.push([key,value]);
keyboardState.octave[0]=4;
for (const [mode,layout] of [[0,0],[0,1],[1,0],[1,1]]) {
    keyboardState.mode=mode; keyboardState.layout=layout;
    refreshHarmonyPads(0,testTime+=100);
    const map=padMapFor(0);
    for(let index=0;index<32;index++) {
        const pitch=map[index], color=padColor(index,0,0,false,[]);
        if(pitch<0) { assert.equal(color,0,'Piano gaps stay dead'); continue; }
        if(pitch%12===0) assert.equal(color,trackColor(0),'Every octave root gets track color');
        else if([4,7].includes(pitch%12)) {
            assert.notEqual(color,C_LIGHTGREY,'Chord-role inputs get tinted grey');
            assert.equal(color,harmonyPadColor(pitch+12,0),'Repeated input notes share role color');
        } else if(!(2741 & (1 << (pitch%12)))) assert.equal(color,mode===0&&layout===1?C_DARKGREY:0);
        else assert.equal(color,C_LIGHTGREY);
    }
}
assert.equal(padMapFor(0)[24]-padMapFor(0)[0],36,'Inline starts successive rows an octave apart');
assert.equal(harmonyPadColor(64,0,true),C_WHITE,'Held input feedback is white');
rawView='0,0,0,0,0,0,3,0,4,2|arp1,0|input1,0,0,4,1451,137';
refreshHarmonyPads(0,testTime+=100);
assert.equal(keyboardState.scale,3,'HB inferred Phrygian updates keyboard');
assert.equal(writes.length,0,'Inference does not write back or disable Auto');
setFollowerInputScale(0,0);
assert.deepEqual(writes.pop(),['midi_fx1:follower_scale','Major']);
setFollowerInputRoot(0,2);
assert.deepEqual(writes.splice(0),[['midi_fx1:follower_root_policy','Explicit'],['midi_fx1:follower_explicit_root','D']]);
assert.equal(parseHarmonySnapshot('0,0,0,0,0,0,3,0,4,2|arp1,0|input1,0,1,1,2741,2'),null,'Reject chord roles outside input scale');
console.log('Follower input colors: fourths, piano, inline, inferred scale, and user scale/root writes pass');

// Conductor selection and editing use the same global input collection.
rawView='0,0,0,0,0,0,3,0,4,2|arp1,0|key1,4,4';
portFor(1).getParam=()=>rawView;
portFor(1).setParam=(key,value)=>writes.push([key,value]);
refreshHarmonyPads(1,testTime+=100);
assert.equal(keyboardState.scale,3,'Conductor inherits the global Phrygian input scale');
setFollowerInputScale(1,0);
assert.deepEqual(writes.pop(),['midi_fx1:follower_scale','Major'],'Conductor Key control edits shared follower scale');
rawView='0,0,0,0,0,0,3,0,4,2|arp1,0|input1,0,1,1,2741,145|key1,1,1';
refreshHarmonyPads(0,testTime+=100);assert.equal(keyboardState.scale,0);
refreshHarmonyPads(1,testTime+=100);assert.equal(keyboardState.scale,0,'Track switch preserves the shared scale');
console.log('Global keyboard scale: conductor and follower selection, shared edits, no per-track layout changes pass');
