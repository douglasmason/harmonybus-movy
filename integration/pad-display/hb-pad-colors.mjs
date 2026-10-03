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
// A busy/restoring host slot must not erase a complete lookahead frame. The
// next tick retries without requiring the user to visit Pads Global.
portFor(4).getParam = () => '16,16,2741,0,0,5,0,0,0,5|full1,1,128';
refreshHarmonyPads(4,testTime+=100);
const retainedLookahead = harmonyPadColor(67,4);
portFor(4).getParam = () => null;
refreshHarmonyPads(4,testTime+=100);
assert.equal(harmonyPadColor(67,4),retainedLookahead,'Transient read miss retains full-lookahead colors');
portFor(4).getParam=originalGet;
refreshHarmonyPads(0,testTime+=100);
console.log('Harmony pad startup: valid snapshot survives transient host reads without panel navigation');
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
portFor(0).setParam = (key,value) => { if (key !== 'midi_fx1:pad_preview_inputs') writes.push([key,value]); };
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
for (const mode of [1,2,3,4,5,6]) {
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
effectivePort.getParam=()=>`4095,4095,4095,1,4095,2,0,3,0,0|colors2,0|outputs1,${groups.join(',')}|adjshade1,1|input1,0,1,1,2741,4095`;
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


// Added HB scale IDs map to appended Movy IDs, preserving old pentatonic Sets.
const { SCALES: keyboardScales } = await import('../dist/esm/seq/scales.js');
const { overlayOptions, mainPageTouch, mainPageRelease } = await import('../dist/esm/seq/main-page.js');
const { appState } = await import('../dist/esm/app/state.js');
const scaleLabels = ['Dorian b2','Lydian Augmented','Lydian Dominant','Mixolydian b6','Locrian #2','Altered','Whole Tone','Augmented','Blues'];
const scaleDegrees = [[0,1,3,5,7,9,10],[0,2,4,6,8,9,11],[0,2,4,6,7,9,10],[0,2,4,5,7,8,10],[0,2,3,5,6,8,10],[0,1,3,4,6,8,10],[0,2,4,6,8,10],[0,3,4,7,8,11],[0,2,3,5,7,9,10]];
assert.equal(keyboardScales[9].name,'Maj Penta');
assert.equal(keyboardScales[12].name,'Chromatic');
assert.equal(keyboardScales[11].name,'Blues 6-note');
assert.deepEqual(keyboardScales[11].degrees,[0,3,5,6,7,10]);
appState.activeTrack.index=2;
const scaleWrites=[];effectivePort.setParam=(key,value)=>scaleWrites.push([key,value]);
for(let mode=0;mode<9;mode++){
    const id=10+mode,mask=scaleDegrees[mode].reduce((bits,pitch)=>bits|(1<<pitch),0);
    effectivePort.getParam=()=>`0,0,${mask},0,0,2,0,0,4,2|input1,0,${id},${id},${mask},0|key1,${id},${id}`;
    refreshHarmonyPads(2,testTime+=100);
    assert.equal(keyboardState.scale,13+mode);
    assert.deepEqual(keyboardScales[keyboardState.scale].degrees,scaleDegrees[mode]);
    assert.equal(overlayOptions(5).length,18);
    setFollowerInputScale(2,13+mode);
    assert.deepEqual(scaleWrites.pop(),['midi_fx1:follower_scale',scaleLabels[mode]]);
}
console.log('Melodic-minor and symmetric scales: snapshot, stable keyboard IDs, selector and scale writes pass');

// Shared current/effective color and configurable exact-input play overlay.
const playPalette = [127,3,7,11,13,125,22,25,trackColor(0),C_LIGHTGREY,C_WHITE,null];
keyboardState.mode=0; keyboardState.layout=0; keyboardState.rootPc=0;
for (let choice=0;choice<12;choice++) {
    const view = `145,145,2741,0,0,2,0,3,5,2|colors2,0|playcolor1,${choice}|input1,0,1,1,2741,145`;
    portFor(0).getParam=()=>view;refreshHarmonyPads(0,testTime+=100);
    assert.equal(harmonyPadColor(64,0),125,'Effective uses Current Color on new hosts');
    const normal=padColor(68,68,0,false);
    assert.equal(padColor(68,68,0,true),playPalette[choice]??normal,'Playback color or Off background');
    globalThis.setLED=(pad,color)=>{immediateColor=color;};
    noteOn(68,68,0,100);
    assert.equal(immediateColor,playPalette[choice]??normal,'Immediate live press matches playback');
    noteOff(68,68);
    assert.equal(immediateColor,normal,'Release restores background');
    portFor(0).getParam=()=>view+'|arp1,1,64';refreshHarmonyPads(0,testTime+=100);
    assert.equal(harmonyPadColor(64,0),playPalette[choice]??125,'Retained raw input uses same play setting');
}
globalThis.setLED=previousLED;
for (const invalid of ['12','-1','foo','1,2'])
    assert.equal(parseHarmonySnapshot('145,145,2741,0,0,2,0,3,5,2|playcolor1,'+invalid),null);
console.log('Play color: all choices, Off, live press/release, recorded and retained input pass');

// Gaps are enabled only by a supporting Closest Split Chromatic follower.
const { pianoApproachTarget, pianoApproachIdentity } = await import('../dist/esm/seq/pads.js');
const { padPitch: pianoPadPitch } = await import('../dist/esm/seq/pads.js');
keyboardState.mode=0;keyboardState.layout=1;keyboardState.octave[0]=4;keyboardState.rootPc=0;
for(const enabled of [false,true,false]) {
    portFor(0).getParam=()=>`0,0,2741,0,0,6,3,3,2,0|input1,0,1,1,2741,145|piano1,${Number(enabled)}`;
    refreshHarmonyPads(0,testTime+=100);
    for(let index=0;index<32;index++) {
        const gap=[8,11,15,24,27,31].includes(index);
        const target=enabled&&gap?padMapFor(0)[index-8]:-1;
        assert.equal(pianoApproachTarget(0,index),target);
        assert.equal(pianoPadPitch(0,index,0),target<0?padMapFor(0)[index]:pianoApproachIdentity(target));
        if(gap) assert.equal(padColor(index,0,0,false,[]),0,'Existing gap coloring is unchanged');
    }
}
console.log('Piano gaps: opt-in follower capability, exact lower-pad targets, independent identities, travel switch and unchanged colors pass');

// Approach rows work in every supported scale/root; the upper row resolves
// the pad beneath it rather than inventing a second scale coordinate system.
{
    const { buildPadMap, degreeToPitch } = await import('../dist/esm/keyboard/layouts.js');
    const { SCALES } = await import('../dist/esm/seq/scales.js');
    const { pianoApproachTarget } = await import('../dist/esm/seq/pads.js');
    const { keyboardState } = await import('../dist/esm/keyboard/state.js');
    keyboardState.mode=1;keyboardState.layout=2;keyboardState.octave[0]=4;
    const flags=Array(32).fill(-1);flags[8]=4;flags[9]=1;flags[10]=16;flags[11]=17;flags[12]=0;
    let request='';
    portFor(0).setParam=(key,value)=>{assert.equal(key,'midi_fx1:pad_preview_inputs');request=value;return true;};
    portFor(0).getParam=key=>{assert.equal(key,'midi_fx1:pad_view');return '0,0,0,0,0,6,0,3,2,0|piano1,1|both1,2|gapcolors1,'+flags.join(',');};
    for(let scaleIndex=0;scaleIndex<SCALES.length;scaleIndex++)for(let root=0;root<12;root++) {
        keyboardState.scale=scaleIndex;keyboardState.rootPc=root;
        const base=48+root, map=buildPadMap(1,2,scaleIndex,base);
        refreshHarmonyPads(0,testTime+=100);
        for(let column=0;column<8;column++) {
            assert.equal(map[column],degreeToPitch(base,SCALES[scaleIndex].degrees,column));
            assert.equal(map[16+column],degreeToPitch(base,SCALES[scaleIndex].degrees,SCALES[scaleIndex].degrees.length+column));
            assert.equal(pianoApproachTarget(0,8+column),map[column]);
            assert.equal(pianoApproachTarget(0,24+column),map[16+column]);
        }
    }
    refreshHarmonyPads(0,testTime+=100);
    assert.match(request,/^[0-9a-f]{64}:[0-9a-f]{64}$/);
    const { PAD_PALETTE: approachPalette } = await import('../dist/esm/keyboard/pad-palette.js');
    for (const layout of [2,3]) {
        keyboardState.layout=layout;refreshHarmonyPads(0,testTime+=100);
        for (const [pad,bright] of [[76,C_LIGHTGREY],[77,7],[78,127],[79,3]]) {
            const dim=padColor(pad,68,0,false);
            assert(approachPalette[dim].reduce((sum,value)=>sum+value,0)<approachPalette[bright].reduce((sum,value)=>sum+value,0),'Idle approach rows are dimmer in both layouts');
            assert.equal(padColor(pad,68,0,true),11,'Held approach retains full Play Color');
        }
    }
    assert.equal(padColor(80,68,0,false),0,'Unique chromatic approach stays dark');
    assert.equal(padColor(76,68,0,true),11,'Played approach uses Play Color');
    keyboardState.mode=0;keyboardState.layout=1;keyboardState.scale=0;keyboardState.rootPc=0;
    refreshHarmonyPads(0,testTime+=100);
    assert.equal(padColor(76,68,0,false),C_LIGHTGREY,'Piano gap uses the same membership rules');
    portFor(0).getParam=()=> '0,0,0,0,0,6,0,3,2,0|piano1,0';
    refreshHarmonyPads(0,testTime+=100);
    assert.equal(padColor(76,68,0,false),0,'Disabled/unmapped gap stays dark');
    console.log('Approach layout: every input root/scale, exact lower-pad targets, native membership colors and inactive gaps pass');
}

// A slow color calculation must not advance pulse phase from bottom to top.
{
    const {withHarmonyPadFrame,harmonyPadColor}=await import('../dist/esm/seq/pads.js');
    const {seqState}=await import('../dist/esm/seq/state.js');
    const clock=Date.now;let pulseTime=100000;
    seqState.playing=false;seqState.bpmX100=12000;
    portFor(0).getParam=()=> '4095,4095,4095,1,4095,6,3,0,2,0|full1,1,4095';
    refreshHarmonyPads(0,testTime+=100);
    Date.now=()=>{const sampled=pulseTime;pulseTime+=75;return sampled;};
    try {
        const colors=withHarmonyPadFrame(()=>Array.from({length:32},()=>harmonyPadColor(60,0)));
        assert.equal(new Set(colors).size,1,'All pads use one time even with slow computation');
        assert.equal(pulseTime,100075,'Pulse time is sampled once per complete frame');
        harmonyPadColor(60,0);assert(pulseTime>100075,'Immediate feedback resumes live time');
    } finally {Date.now=clock;}
}

// Each host call carries one LED; only accepted packets enter the paint cache.
{
    const {sendPadLedFrame,ledFrameReset,ledBudgetTake}=await import('../dist/esm/seq/led-cache.js');
    const send=globalThis.move_midi_internal_send;
    const frames=[];
    globalThis.move_midi_internal_send=packets=>{frames.push([...packets]);return true;};
    const changes=Array.from({length:32},(_,index)=>({note:68+index,color:index%2?7:13}));
    try {
        ledFrameReset();assert.deepEqual(sendPadLedFrame(changes),changes);
        assert.equal(frames.length,32);
        assert.deepEqual(frames,changes.map(({note,color})=>[0x09,0x90,note,color]));
        assert(ledBudgetTake(8));assert(!ledBudgetTake(1),'Existing 40-packet limit is preserved');
        frames.length=0;ledFrameReset();ledBudgetTake(9);
        assert.deepEqual(sendPadLedFrame(changes),[]);assert.equal(frames.length,0,'Defer when budget is short');
        ledFrameReset();globalThis.move_midi_internal_send=()=>false;
        assert.deepEqual(sendPadLedFrame(changes),[],'Queue rejection must not acknowledge delivery');
        ledFrameReset();globalThis.move_midi_internal_send=packet=>packet[2]%2===0;
        assert.deepEqual(sendPadLedFrame(changes),changes.filter(change=>change.note%2===0),'Partial rejection acknowledges only accepted pads');
        ledFrameReset();globalThis.move_midi_internal_send=send;
        assert.deepEqual(sendPadLedFrame([]),[],'Empty diff sends nothing');
    } finally {globalThis.move_midi_internal_send=send;}
}
console.log('Pad frames: single-packet host calls, unchanged budget and per-pad rejection feedback pass');

// A fast tap can start and finish between paints. Its immediate release can
// still read HB's previous held-input snapshot; the next paint must repair the
// physical LED even when the harmony background equals the old paint cache.
{
    const {paintMelodicPads}=await import('../dist/esm/app/tick.js');
    const {seqState}=await import('../dist/esm/seq/state.js');
    const {ledFrameReset}=await import('../dist/esm/seq/led-cache.js');
    const {isSounding}=await import('../dist/esm/keyboard/held-notes.js');
    const originalSet=globalThis.setLED,originalSend=globalThis.move_midi_internal_send;
    const displayed=new Map();
    globalThis.setLED=(pad,color)=>displayed.set(pad,color);
    globalThis.move_midi_internal_send=packets=>{
        for(let offset=0;offset<packets.length;offset+=4)
            if(packets[offset+1]===0x90)displayed.set(packets[offset+2],packets[offset+3]);
        return true;
    };
    try {
        appState.activeTrack.index=0;keyboardState.mode=0;keyboardState.layout=0;
        keyboardState.octave[0]=4;seqState.holdStep=-1;seqState.activeNotes.fill(0);
        const pad=68,pitch=padMapFor(0)[0];
        const base='145,145,2741,0,0,2,0,3,0,0|colors2,0|toniccolor1,9|playcolor1,3|input1,0,1,1,2741,145';
        for(const releasedArp of ['arp1,1','arp1,0']) {
            portFor(0).getParam=()=>base+'|arp1,1';
            refreshHarmonyPads(0,testTime+=100);ledFrameReset();paintMelodicPads();
            const resting=padColor(pad,pad,0,false);assert.notEqual(resting,11);
            portFor(0).getParam=()=>base+'|arp1,1,'+pitch;
            refreshHarmonyPads(0,testTime+=100);
            noteOn(pad,pad,0,100);noteOff(pad,pad);
            assert(!isSounding(pad),'Live owner was released');
            assert.equal(displayed.get(pad),11,'Release briefly sees stale retained-input snapshot');
            portFor(0).getParam=()=>base+'|'+releasedArp;
            refreshHarmonyPads(0,testTime+=100);ledFrameReset();paintMelodicPads();
            assert.equal(displayed.get(pad),resting,'Released/disabled Auto Chord must repaint without another press');
        }
    } finally {globalThis.setLED=originalSet;globalThis.move_midi_internal_send=originalSend;}
}
console.log('Live pad release: rapid taps and Auto Chord off recover from stale held snapshots');

// Exercise Schwung's real overtake wrapper, not a permissive MIDI mock. It
// queues one LED packet per call and flushes at most 16 LEDs per host tick.
{
    const {readFileSync}=await import('node:fs');
    const {resolve}=await import('node:path');
    const vm=await import('node:vm');
    const hostSource=readFileSync(resolve(process.env.SCHWUNG_ROOT||'../schwung','src/shadow/shadow_ui.js'),'utf8');
    const queueSource=hostSource.slice(hostSource.indexOf('const LED_QUEUE_MAX_PER_TICK ='),hostSource.indexOf('/* Knob mapping state'));
    assert(queueSource.includes('function activateLedQueue()')&&queueSource.includes('function flushLedQueue()'));
    const displayed=new Map(),host={move_midi_internal_send:packet=>{displayed.set(packet[2],packet[3]);return true;}};
    vm.runInNewContext(queueSource+'\nactivateLedQueue();globalThis.flushTestLeds=flushLedQueue;',host);
    const original=globalThis.move_midi_internal_send;
    const {sendPadLedFrame,ledFrameReset}=await import('../dist/esm/seq/led-cache.js');
    globalThis.move_midi_internal_send=host.move_midi_internal_send;
    try {
        const changes=Array.from({length:32},(_,index)=>({note:68+index,color:index%3===0?13:index%3===1?9:7}));
        ledFrameReset();sendPadLedFrame(changes);
        host.flushTestLeds();host.flushTestLeds();
        assert.equal(displayed.size,32,'Every harmony pad reaches the actual overtake queue without being pressed');
        for(const change of changes)assert.equal(displayed.get(change.note),change.color);
        // Replace a pending frame before its second half flushes. All pads must
        // converge on the latest background/play state without any pad presses.
        ledFrameReset();sendPadLedFrame(changes.map(change=>({...change,color:11})));
        host.flushTestLeds();
        ledFrameReset();sendPadLedFrame(changes);
        host.flushTestLeds();host.flushTestLeds();
        for(const change of changes)assert.equal(displayed.get(change.note),change.color);

    } finally {globalThis.move_midi_internal_send=original;}
}
console.log('Real Schwung overtake queue: all 32 harmony colors reach the device');

// Current HB supplies physical pad membership from final emitted output. Raw
// sequencer inputs and latched arp owners must not override that output state.
{
    const {paintMelodicPads}=await import('../dist/esm/app/tick.js');
    const {seqState}=await import('../dist/esm/seq/state.js');
    const {ledFrameReset}=await import('../dist/esm/seq/led-cache.js');
    const {harmonyPlaybackColor,hasHarmonyPlayback,harmonyPadPlaying}=await import('../dist/esm/seq/pads.js');
    const send=globalThis.move_midi_internal_send,set=globalThis.setLED;
    const displayed=new Map();
    globalThis.move_midi_internal_send=packet=>{displayed.set(packet[2],packet[3]);return true;};
    globalThis.setLED=(pad,color)=>displayed.set(pad,color);
    const base='145,145,2741,0,0,6,0,3,0,0|colors2,0|toniccolor1,9|playcolor1,3';
    try {
        appState.activeTrack.index=0;keyboardState.mode=0;keyboardState.layout=0;keyboardState.octave[0]=4;
        seqState.holdStep=-1;seqState.activeNotes.fill(0);
        const source=padMapFor(0)[0];seqState.activeNotes[source]=1;
        let mask=0;
        portFor(0).getParam=()=>base+'|arp1,1,'+source+'|playpads1,'+mask;
        const paint=()=>{refreshHarmonyPads(0,testTime+=100);ledFrameReset();paintMelodicPads();};
        paint();assert(hasHarmonyPlayback(0));
        assert.notEqual(displayed.get(68),11,'Recorded input and latched owner are not sounding output');
        const resting=Array.from({length:32},(_,i)=>padColor(68+i,68,0,false));
        resting.forEach((color,i)=>displayed.set(68+i,color));
        for(mask of [1<<4,(1<<4)|(1<<7),2**31,0]){
            paint();
            for(let index=0;index<32;index++){
                assert.equal(harmonyPadPlaying(0,index),!!((mask>>>index)&1));
                if (!((mask>>>index)&1)) assert.equal(displayed.get(68+index),resting[index],'Stopped outputs restore their background');
                else assert.equal(displayed.get(68+index),harmonyPlaybackColor(0,0,index,false),'Output-only is independent of background');
            }
        }
        noteOn(68,68,0,100);paint();assert.equal(displayed.get(68),resting[0],'Input alone keeps its background');
        mask=1;paint();assert.equal(displayed.get(68),11,'Input and rendered note together give solid green');
        mask=0;
        noteOff(68,68);paint();assert.notEqual(displayed.get(68),11,'Release clears input while recorded source remains active');
        mask=1;paint();assert.equal(displayed.get(68),11,'Recorded input plus rendered note gives solid green');
        mask=1<<4;paint();assert.equal(displayed.get(72),11);assert.notEqual(displayed.get(72),resting[4],'Rendered note overrides background');
        const dimmed=[5,9,13].map(background=>harmonyPlaybackColor(background,0,4,false));
        assert.equal(new Set(dimmed).size,1,'Red, orange and yellow all become the same solid green');
        assert(dimmed.every(color=>color===11),'Output-only uses regular green');
        portFor(0).getParam=()=>base.replace('playcolor1,3','playcolor1,11')+'|playpads1,'+mask;
        paint();assert.notEqual(displayed.get(72),11,'Play Color Off still disables output overlay');
        assert.equal(harmonyPadPlaying(1,4),false,'Output is track-local');
        for(const bad of ['-1','4294967296','1.5','x','1,2'])assert.equal(parseHarmonySnapshot(base+'|playpads1,'+bad),null);
    } finally {seqState.activeNotes.fill(0);globalThis.move_midi_internal_send=send;globalThis.setLED=set;}
}
console.log('Rendered play overlay: source/output separation, chord/arp changes, release, pad 32, track isolation and Off pass');

// Dedicated layouts opt into approach routing even when the legacy travel gate is off.
{
    let enabled=false, payload='';
    const { pianoApproachTarget }=await import('../dist/esm/seq/pads.js');
    portFor(0).setParam=(key,value)=>{if(key==='midi_fx1:pad_preview_inputs'){payload=value;enabled=value.endsWith(';1');}return true;};
    portFor(0).getParam=()=>`0,0,2741,0,0,6,3,3,2,0|input1,0,1,1,2741,145|piano1,${Number(enabled)}`;
    keyboardState.mode=1;keyboardState.rootPc=0;keyboardState.scale=0;keyboardState.octave[0]=4;
    for(const layout of [2,3,2]){
        keyboardState.layout=layout;refreshHarmonyPads(0,testTime+=100);refreshHarmonyPads(0,testTime+=100);
        assert(payload.endsWith(';1'));assert.equal(pianoApproachTarget(0,8),48);
        if(layout===3)for(const row of [1,2,3])for(let column=0;column<8;column++)assert.equal(pianoApproachTarget(0,row*8+column),padMapFor(0)[column]);
    }
    keyboardState.layout=1;keyboardState.mode=0;refreshHarmonyPads(0,testTime+=100);
    assert(payload.endsWith(';0'));assert.equal(pianoApproachTarget(0,8),-1,'Ordinary piano retains its legacy gate');
}
console.log('Dedicated approach layouts: in-band opt-in, every row routed, and ordinary piano opt-out pass');

// Short emitted notes can finish between UI polls; the DSP supplies a bounded flash.
assert.equal(parseHarmonySnapshot('0,0,0,0,0,6,0,3,2,0|playpads1,0|playflash1,2147483648').playPads,2147483648);
assert.equal(parseHarmonySnapshot('0,0,0,0,0,6,0,3,2,0|playpads1,2|playflash1,4').playPads,6);
for(const invalid of ['-1','4294967296','x','1,2'])assert.equal(parseHarmonySnapshot('0,0,0,0,0,6,0,3,2,0|playpads1,0|playflash1,'+invalid),null);
const { approachPanels } = await import('../dist/esm/renderer/hb-approach.js');
const hierarchy={levels:{root:{params:[]}}};approachPanels(hierarchy,2);
for(const bank of [0,1]){
    const panel=hierarchy.levels['approach_bank_'+bank];
    assert.equal(panel.knobs.length,8);assert.equal(panel.knobs[7],'motion_control_32');
    assert.equal(panel.params[7].name,'Chord + Arp');
}

// Next tone selection stays independent of the general pulse shape.
{
    const {seqState}=await import('../dist/esm/seq/state.js');
    const clock=Date.now;let now=0;
    seqState.playing=false;seqState.bpmX100=12000;
    const raw='145,145,2741,0,0,6,3,3,2,0|full1,1,145|nextpulse1,16,0';
    assert.equal(parseHarmonySnapshot(raw).nextPulse,16);
    for(const bad of ['4096,0','16,-1','16,4294967296','16,0,1','NaN,0'])
        assert.equal(parseHarmonySnapshot(raw.replace('16,0',bad)),null);
    portFor(0).getParam=()=>raw;refreshHarmonyPads(0,testTime+=100);
    Date.now=()=>now;
    try {
        const peak=harmonyPadColor(64,0),unselected=harmonyPadColor(67,0);
        assert.equal(peak,127,'Selected next tone uses pure next color, not current or overlap color');
        now=250;
        assert.notEqual(harmonyPadColor(64,0),peak,'Selected third breathes even with general Shape None');
        assert.notEqual(harmonyPadColor(64,0),0,'Next-tone pulse trough stays illuminated');
        assert.equal(harmonyPadColor(67,0),unselected,'Unselected fifth remains unchanged');
        assert.equal(harmonyPadColor(64,0,true),120,'Held edit highlight remains solid');
        const { PAD_PALETTE } = await import('../dist/esm/keyboard/pad-palette.js');
        const savedKeyboard = {...keyboardState};
        const ordinaryFloor = harmonyPadColor(64,0);
        const brightness = color => PAD_PALETTE[color].reduce((sum,value)=>sum+value,0);
        try {
            Object.assign(keyboardState,{mode:1,scale:0,rootPc:0});
            for (const layout of [2,3]) {
                keyboardState.layout=layout;
                portFor(0).getParam=()=>raw.replace('|nextpulse1,16,0','|nextpulse1,16,256')+'|piano1,1|gapcolors1,'+Array(32).fill(16).join(',');
                refreshHarmonyPads(0,testTime+=100);now=250;
                assert(brightness(padColor(76,68,0,false))<brightness(ordinaryFloor),'Dim approach floor is lower in layout '+layout);
                now=0;assert.equal(padColor(76,68,0,false),peak,'Approach pulse reaches its selected color');
            }
        } finally { Object.assign(keyboardState,savedKeyboard);portFor(0).getParam=()=>raw;refreshHarmonyPads(0,testTime+=100); }

        for (const mode of [1,2,3,4,5,6]) {
            portFor(0).getParam=()=>raw.replace('6,3,3,2,0',mode+',3,3,2,0');refreshHarmonyPads(0,testTime+=100);
            now=0;const first=harmonyPadColor(64,0);now=250;const second=harmonyPadColor(64,0);
            if ([1,3,4].includes(mode)) assert.equal(first,second,'Current-only or unavailable Next has no pulse '+mode);
            else {assert.notEqual(first,second,'Displayed preview pulses '+mode);assert.equal(first,mode===0||mode===2?7:127,'Pure displayed harmony color '+mode);}
        }
        portFor(0).getParam=()=>raw.replace('6,3,3,2,0','6,0,3,2,0');refreshHarmonyPads(0,testTime+=100);
        const off=harmonyPadColor(64,0);now=0;assert.equal(harmonyPadColor(64,0),off,'Pulse Rate Off disables selection animation');
        portFor(0).getParam=()=>raw.replace('|nextpulse1,16,0','');refreshHarmonyPads(0,testTime+=100);
        const none=harmonyPadColor(64,0);now=250;assert.equal(harmonyPadColor(64,0),none,'None preserves original steady colors');
    } finally {Date.now=clock;}
}
console.log('Next Pulse: strict snapshot parsing, selected tones only, default-off and solid highlights pass');

// While transport advances, a selected seventh must not animate roots in any octave.
{
    const {seqState}=await import('../dist/esm/seq/state.js');
    const saved={playing:seqState.playing,engineOk:seqState.engineOk,engineTick:seqState.engineTick};
    Object.assign(seqState,{playing:true,engineOk:false});
    try {
        for(const mode of [0,2,3,4,5,6])for(const shape of [0,1,2,3]){
            portFor(0).getParam=()=>`2193,2193,2741,1,2193,${mode},3,${shape},2,0|colors2,0|input1,0,1,1,2741,2193|full1,1,2193|nextpulse1,2048,0`;
            refreshHarmonyPads(0,testTime+=100);
            const frames=Array.from({length:17},(_,step)=>{
                seqState.engineTick=step*6;
                return [36,48,60,72,84,64,67,71].map(pitch=>harmonyPadColor(pitch,0));
            });
            for(let index=0;index<7;index++)assert.equal(new Set(frames.map(frame=>frame[index])).size,1,`Unselected root/third/fifth stays steady: mode ${mode}, shape ${shape}`);
            assert(new Set(frames.map(frame=>frame[7])).size>2,'Selected seventh changes through intermediate brightness levels');
        }
    } finally {Object.assign(seqState,saved);}
}
console.log('Playing transport: seventh-only selection keeps every root octave steady across all preview modes and pulse shapes');
