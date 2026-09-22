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
assert.equal(padColor(68,68,0,true),11,'Playback input green takes priority over harmony colors');
setMode(0);
assert.notEqual(padColor(68,68,0,true),padColor(68,68,0,false),'Standard feedback remains available');
console.log('Harmony pads: pitch classes, root backgrounds, overlap, independent shapes and Standard pass');

const port = portFor(4), originalGet = port.getParam;
let reads = 0;
port.getParam = key => { assert.match(key,/^midi_fx1:pad_view@[0-9a-f]{64}$/); reads++; return '145,580,2741,1,580,3,3,0,4,2'; };
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
assert.equal(immediateColor,11,'Immediate raw input feedback stays green over harmony colors');
noteOff(68,68);
setMode(0);
noteOn(68,68,0,100);
assert.equal(immediateColor,11,'Standard keeps immediate green feedback');
noteOff(68,68);
globalThis.setLED = previousLED;
console.log('Immediate raw pad touch remains green in every color mode');

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
let rawView = '0,0,2741,0,0,0,3,0,4,2|arp1,0|input1,0,1,1,2741,145';
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
assert.equal(parseHarmonySnapshot('0,0,0,0,0,0,3,0,4,2|arp1,0|input1,0,1,1,2741,2').input.chord,2,'A chromatic input can render a chord tone');
console.log('Follower input colors: fourths, piano, inline, inferred scale, and user scale/root writes pass');

// Conductor selection and editing use the same global input collection.
rawView='0,0,0,0,0,0,3,0,4,2|arp1,0|key1,4,4';
portFor(1).getParam=()=>rawView;
portFor(1).setParam=(key,value)=>writes.push([key,value]);
refreshHarmonyPads(1,testTime+=100);
assert.equal(keyboardState.scale,3,'Conductor inherits the global Phrygian input scale');
setFollowerInputScale(1,0);
assert.deepEqual(writes.pop(),['midi_fx1:follower_scale','Major'],'Conductor Key control edits shared follower scale');
rawView='0,0,2741,0,0,0,3,0,4,2|arp1,0|input1,0,1,1,2741,145|key1,1,1';
refreshHarmonyPads(0,testTime+=100);assert.equal(keyboardState.scale,0);
refreshHarmonyPads(1,testTime+=100);assert.equal(keyboardState.scale,0,'Track switch preserves the shared scale');
console.log('Global keyboard scale: conductor and follower selection, shared edits, no per-track layout changes pass');

// Sequencer activity is exact input pitch, independent of rendered harmony masks.
const { activeFromStr, activeHasNote } = await import('../dist/esm/seq/state.js');
keyboardState.rootPc=0; keyboardState.scale=0; keyboardState.octave[0]=4;
for (const [mode,layout] of [[0,0],[0,1],[1,0],[1,1]]) {
    keyboardState.mode=mode; keyboardState.layout=layout;
    const map=padMapFor(0), inputPitch=map.find(pitch=>pitch>=0);
    for(let colorMode=0;colorMode<=6;colorMode++) {
        portFor(0).getParam=()=>`0,0,2741,0,0,${colorMode},3,0,4,2|arp1,0|input1,0,1,1,2741,145`;
        refreshHarmonyPads(0,testTime+=100);
        activeFromStr(`${inputPitch},,,,,,,,,,,,,,,`);
        for(let index=0;index<32;index++) {
            const pitch=map[index];
            const color=padColor(index,0,0,activeHasNote(0,pitch),[]);
            if(pitch<0) assert.equal(color,0,'Piano gaps remain black');
            else if(pitch===inputPitch) assert.equal(color,11,'Recorded input lights green in every layout and harmony mode');
            else assert.equal(color,padColor(index,0,0,false,[]),'Other pitches retain their harmony background');
        }
        activeFromStr(',,,,,,,,,,,,,,,');
        const inputIndex=map.indexOf(inputPitch);
        assert.equal(padColor(inputIndex,0,0,activeHasNote(0,inputPitch),[]),
            padColor(inputIndex,0,0,false,[]),'Note-off restores harmony background');
        activeFromStr(`,${inputPitch},,,,,,,,,,,,,,`);
        assert.equal(activeHasNote(0,inputPitch),false,'Other-track playback does not light selected input');
    }
}
console.log('Recorded input highlights: every layout/color mode, exact pitch, note-off and track isolation pass');

assert.equal(parseHarmonySnapshot('145,580,2741,1,580,2,0,0,8,8|colors2,8').effectiveColor,8);
assert.equal(parseHarmonySnapshot('145,580,2741,1,580,2,0,0,8,8|colors2,9'),null);
const effectivePort=portFor(2);
const drawEffective=(mode,color) => {
    effectivePort.getParam=()=>`145,145,2741,0,0,${mode},0,0,4,2|colors2,${color}|input1,0,1,1,2741,145`;
    refreshHarmonyPads(2,testTime+=100);
    return harmonyPadColor(64,2,false);
};
assert.equal(drawEffective(0,8),drawEffective(2,8),'Standard equals Effective, pulse Off, Track color');
assert.notEqual(drawEffective(2,0),drawEffective(2,5),'Effective color changes visible output');
console.log('Effective pad preset, Track option and explicit color selection pass');

// Equivalent rendered chord tones must not gain saturation from being outside
// the input scale. Cover both thirds, upward #4/5, and the scale reversal.
for (const mode of [0, 2]) {
    for (const scaleMask of [2741, 1453]) {
        for (const color of [0, 5, 8]) {
            effectivePort.getParam = () => `217,217,4095,0,0,${mode},0,0,4,2|colors2,${color}|input1,0,1,1,${scaleMask},217`;
            refreshHarmonyPads(2, testTime += 100);
            assert.equal(harmonyPadColor(63, 2), harmonyPadColor(64, 2), 'Minor/major third inputs receive equal harmony tint');
            assert.equal(harmonyPadColor(66, 2), harmonyPadColor(67, 2), 'Upward #4/fifth inputs receive equal harmony tint');
            assert.equal(harmonyPadColor(60, 2), harmonyPadColor(64, 2), 'Harmony overlays the input-root background');
            assert.equal(harmonyPadColor(62, 2), C_LIGHTGREY, 'Non-chord scale input remains grey');
        }
    }
}
console.log('Equivalent chord-tone inputs retain equal tint across major/minor scales');

// Output-scale membership owns grey; only input roots get track-color backgrounds.
for (const mode of [0, 1, 2, 3, 4, 5, 6]) {
    effectivePort.getParam = () => `145,145,4095,1,145,${mode},0,0,4,2|colors2,8|tonic1,2048|full1,1,145|input1,0,1,1,2741,145`;
    refreshHarmonyPads(2, testTime += 100);
    assert.equal(harmonyPadColor(61, 2), C_LIGHTGREY, 'Chromatic input rendering a scale non-chord tone is grey');
    assert.equal(harmonyPadColor(71, 2), C_LIGHTGREY, 'Output tonic does not paint other input pads with track color');
    assert.equal(harmonyPadColor(60, 2), harmonyPadColor(64, 2), 'Non-tonic chord inputs share pure harmony color');
    effectivePort.getParam = () => `145,145,4091,1,145,${mode},0,0,4,2|colors2,8|tonic1,1|full1,1,145|input1,0,1,1,2741,145`;
    refreshHarmonyPads(2, testTime += 100);
    assert.notEqual(harmonyPadColor(62, 2), C_LIGHTGREY, 'Scale input rendering outside output scale does not retain grey');
}
assert.equal(parseHarmonySnapshot('0,0,0,0,0,0,0,0,4,2|tonic1,4096'), null);
console.log('Output-scale backgrounds respect input-root track color');

// Harmony overlays do not mix grey, even partway through a smooth pulse.
for (const phase of [0, 0.125, 0.25]) {
    assert.equal(colorHarmonyPitch(64,0,2,2741,16,0,1,phase,0,127,125,true,1),127);
    assert.equal(colorHarmonyPitch(64,0,2,0,16,0,1,phase,0,127,125,true,1),127);
}
assert.equal(colorHarmonyPitch(64,0,2,2741,16,0,1,0.5,0,127,125,true,1),C_LIGHTGREY);
assert.equal(colorHarmonyPitch(64,0,2,2741,16,16,6,0.25,0,127,125,true,1),
    colorHarmonyPitch(64,0,2,0,16,16,6,0.25,0,127,125,true,1), 'Current/future mixture is independent of grey');
for (const mode of [4,5,6]) {
    effectivePort.getParam=()=>`16,16,2741,0,0,${mode},0,0,0,5|colors2,8|tonic1,1|full1,1,128|input1,0,1,1,2741,16`;
    refreshHarmonyPads(2,testTime+=100);
    assert.equal(harmonyPadColor(67,2),mode===4?C_LIGHTGREY:125,'Full preview appears before timed lookahead is ready');
    assert.equal(harmonyPadColor(64,2),mode===6?127:C_LIGHTGREY,'Both Full also shows current');
}
effectivePort.getParam=()=>`16,16,2741,0,0,5,0,0,0,5|tonic1,1|full1,0,128|input1,0,1,1,2741,16`;
refreshHarmonyPads(2,testTime+=100);
assert.equal(harmonyPadColor(67,2),C_LIGHTGREY,'Unknown model never shows speculative full preview');
assert.equal(parseHarmonySnapshot('0,0,0,0,0,7,0,0,4,2'),null);
assert.equal(parseHarmonySnapshot('0,0,0,0,0,5,0,0,4,2|full1,1,4096'),null);
console.log('Pure harmony colors, pulse-off scale background and full lookahead modes pass');

for (const mode of [3,6]) {
    for (const phase of [0,0.125,0.25,0.5,0.75]) {
        assert.equal(harmonyPulse(phase,3),1,'None is steady at every phase');
        assert.equal(colorHarmonyPitch(64,0,2,2741,16,16,mode,phase,3,127,125,true,1,13),13,'Both Color replaces overlap with the chosen color');
        assert.equal(colorHarmonyPitch(64,0,2,2741,16,0,mode,phase,3,127,125,true,1,13),127,'Current-only keeps Current Color');
        assert.equal(colorHarmonyPitch(64,0,2,2741,0,16,mode,phase,3,127,125,true,1,13),125,'Future-only keeps Lookahead Color');
        assert.equal(colorHarmonyPitch(60,0,2,2741,1,1,mode,phase,3,127,125,true,1,13),13,'Harmony overlap overrides input-tonic background');
    }
    effectivePort.getParam=()=>`16,16,2741,1,16,${mode},4,3,0,5|tonic1,1|full1,1,16|both1,5|input1,0,1,1,2741,16`;
    refreshHarmonyPads(2,testTime+=100);
    assert.equal(harmonyPadColor(64,2),13,'Both Color travels through the snapshot');
    effectivePort.getParam=()=>`16,16,2741,1,16,${mode},4,3,0,5|tonic1,1|full1,1,16|both1,0|input1,0,1,1,2741,16`;
    refreshHarmonyPads(2,testTime+=100);
    assert.equal(harmonyPadColor(64,2),colorHarmonyPitch(64,0,2,2741,16,16,mode,0,3,127,125,true,1),'Blend remains the default mixture');
}
assert.equal(parseHarmonySnapshot('0,0,0,0,0,3,0,3,4,2|both1,10'),null);
console.log('Both Color override, Blend default, and None pulse shape pass');

// Track color is pinned to input roots and is strictly a background layer.
for (const mode of [0,1,2,3,4,5,6]) {
    const drawRoot = (mask, outputTonic) => {
        effectivePort.getParam=()=>`${mask},${mask},2741,1,${mask},${mode},0,3,0,0|colors2,0|tonic1,${outputTonic}|full1,1,${mask}|both1,1|input1,0,1,1,2741,${mask}`;
        refreshHarmonyPads(2,testTime+=100);
        return [harmonyPadColor(60,2),harmonyPadColor(72,2),harmonyPadColor(64,2)];
    };
    assert.deepEqual(drawRoot(1,16),[127,127,C_LIGHTGREY],'Harmony overrides input roots; output tonic is not special');
    assert.deepEqual(drawRoot(0,16),[trackColor(2),trackColor(2),C_LIGHTGREY],'Input roots reappear between harmonies');
}
assert.equal(colorHarmonyPitch(60,0,2,2741,1,0,1,0,2,127,125,true,16),127);
assert.equal(colorHarmonyPitch(60,0,2,2741,1,0,1,0.5,2,127,125,true,16),trackColor(2),'Pulse-off restores input-root track color');
console.log('Input-root backgrounds and harmony-over-root priority pass');

// Input tonic background is global configuration; harmony still overlays it.
for (let mode=0;mode<=6;mode++) {
    for (const [choice,expected] of [[8,trackColor(2)],[9,C_LIGHTGREY],[0,127]]) {
        for (const mask of [0,1]) {
            effectivePort.getParam=()=>`${mask},${mask},2741,1,${mask},${mode},0,3,0,0|colors2,0|full1,1,${mask}|toniccolor1,${choice}|input1,0,1,1,2741,${mask}`;
            refreshHarmonyPads(2,testTime+=100);
            assert.equal(harmonyPadColor(60,2),mask ? 127 : expected);
            assert.equal(harmonyPadColor(72,2),mask ? 127 : expected);
            assert.equal(harmonyPadColor(64,2),C_LIGHTGREY);
        }
    }
}
assert.equal(parseHarmonySnapshot('0,0,0,0,0,0,0,0,4,2|toniccolor1,10'),null);
assert.equal(parseHarmonySnapshot('0,0,0,0,0,0,0,0,4,2').tonicColor ?? 8,8);
assert.equal(colorHarmonyPitch(60,0,2,2741,1,0,1,0.75,2,127,125,true,undefined,undefined,C_LIGHTGREY),C_LIGHTGREY);
console.log('Input tonic: Track default, Grey, named colors, octave identity and harmony priority pass in all modes');

const { distinguishHarmonyPad } = await import('../dist/esm/seq/pads.js');
const { setHeldSet, clearHeldSet } = await import('../dist/esm/seq/held.js');
const groups=Array.from({length:32},(_,slot)=>slot<2?0:slot<4?2:slot);
effectivePort.getParam=()=>`4095,4095,4095,1,4095,2,0,3,0,0|colors2,0|outputs1,${groups.join(',')}|input1,0,1,1,2741,4095`;
refreshHarmonyPads(2,testTime+=100);
assert.equal(distinguishHarmonyPad(0,2,127),127);
assert.equal(distinguishHarmonyPad(1,2,127),127,'Same output keeps identical shade');
assert.notEqual(distinguishHarmonyPad(2,2,127),127,'Different adjacent output has a neighboring shade');
assert.equal(distinguishHarmonyPad(3,2,127),distinguishHarmonyPad(2,2,127));
assert.equal(distinguishHarmonyPad(8,2,127),127,'Each physical row begins independently');
const beforeLast=padColor(68,68,2,false);
setHeldSet(2,[padMapFor(2)[0]]);
assert.equal(padColor(68,68,2,false),beforeLast,'Last played note does not override pad colors');
clearHeldSet(2);
console.log('Horizontal output groups: equal outputs match, differing outputs alternate, row boundaries reset; no lingering white selection');

