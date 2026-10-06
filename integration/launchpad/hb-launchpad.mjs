import assert from 'node:assert/strict';
import { installEnv } from './env.mjs';
installEnv();
const { launchpadIndex, launchpadNote, sysexPackets, buildSurfaceCells, previewPayload, legacyColor, surfaceFirstRow } = await import('../dist/esm/surfaces/protocol.js');
const { buildPadMap } = await import('../dist/esm/keyboard/layouts.js');
for (const model of [1, 2]) {
    for (let index = 0; index < 64; index++) assert.equal(launchpadIndex(model, launchpadNote(model, index)), index);
    assert.equal(launchpadIndex(model, model === 1 ? 8 : 19), -1, 'side buttons have no note assignment');
}
assert.equal(launchpadNote(1, 0), 112);assert.equal(launchpadNote(1, 56), 0);
assert.equal(launchpadNote(2, 0), 11);assert.equal(launchpadNote(2, 56), 81);
const unpack = packets => packets.flatMap((_, index) => index % 4 === 0 ? packets.slice(index + 1, index + 1 + (packets[index] === 4 ? 3 : packets[index] - 4)) : []);
for (let length = 8; length <= 48; length++) {
    const bytes = [240, ...new Array(length - 2).fill(0), 247];
    assert.deepEqual(unpack(sysexPackets(bytes)), bytes, 'SysEx zero data and final CIN are preserved');
}
for (let mode = 0; mode < 2; mode++) for (let layout = 0; layout < 4; layout++) {
    const move = buildPadMap(mode, layout, 0, 48);
    const external = buildPadMap(mode, layout, 0, 48, 8, surfaceFirstRow(layout));
    const moveStart=layout===3?0:16;
    assert.deepEqual([...external.slice(moveStart, moveStart+32)], [...move], 'the Move layout remains intact inside the extended surface');
    const cells = buildSurfaceCells(external, layout, mode === 0 && layout === 1);
    assert.equal(cells.length, 64);
    if (layout === 3) { assert.equal(cells[8].target, 48);assert.equal(cells[24].row, 3);assert.equal(cells[40].target, 60); }
    if (layout === 2) { assert.equal(cells[8].target, 36);assert.equal(cells[24].target, 48);assert.equal(cells[56].target,72); }
    if (layout === 1 && mode===0) {assert.equal(cells[0].pitch,36);assert.equal(cells[48].pitch,72);}
    if (layout === 1 && mode===1) {assert.equal(cells[0].pitch,24);assert.equal(cells[56].pitch,108);}
    for (let bank = 0; bank < 2; bank++) assert.equal(previewPayload(cells.slice(bank * 32, bank * 32 + 32), layout >= 2).length, 164);
}
assert.equal(legacyColor(118, false, false, false, false), 28);
assert.equal(legacyColor(0, false, false, true, false), 60);

const { tickLaunchpad, onMidiMessageExternal, unloadLaunchpad } = await import('../dist/esm/surfaces/launchpad.js');
const { setFlag } = await import('../dist/esm/seq/flags.js');
const { appState } = await import('../dist/esm/app/state.js');
const { keyboardState } = await import('../dist/esm/keyboard/state.js');
const { portFor } = await import('../dist/esm/track/registry.js');
await import('../dist/esm/app/globals.js');
const { seqEngineTick } = await import('../dist/esm/seq/engine.js');
const { setPhase } = await import('../dist/esm/seq/set-session.js');
const { tick } = await import('../dist/esm/app/tick.js');
const sent = [], claims = [], midi = [], writes = [];
const frame = () => 'sf1\n' + new Array(3).fill('145,145,145,1,2741,2,0,3,2,0|piano1,1').join('\n');
globalThis.move_midi_external_send = packets => { sent.push([...packets]); return true; };
globalThis.host_ext_midi_remap_set = (input, output) => { claims.push([input, output]); return true; };
globalThis.host_ext_midi_remap_enable = () => true;
globalThis.host_external_surface = () => true;
setFlag('hblaunchpad', 1);
tickLaunchpad(0);tickLaunchpad(10);tickLaunchpad(20);
assert.deepEqual(claims[0], [0, 254], 'raw channel 1 notes are blocked at the host');
assert.deepEqual(sent[0], [11, 176, 0, 0]);assert.deepEqual(sent[1], [11, 176, 0, 1]);
unloadLaunchpad();assert.deepEqual(claims.at(-1), [0, -1], 'teardown releases only the owned channel');
const { installMockEngine } = await import('./mock-engine.mjs');
const engine = installMockEngine();
const { selectTrack } = await import('../dist/esm/track/focus.js');
const { seqState } = await import('../dist/esm/seq/state.js');
seqEngineTick();setPhase('ready');
for (let ownerTrack = 0; ownerTrack < 16; ownerTrack++) {
    const port = portFor(ownerTrack);
    port.setParam = (key, value) => { writes.push([ownerTrack, key, value]); return true; };
    port.sendMidi = (status, note, value) => { midi.push([ownerTrack, status, note, value]); };
    port.getParam = key => key.includes('surface_frame') ? frame() : '';
}
keyboardState.mode = 1;keyboardState.layout = 3;keyboardState.scale = 0;keyboardState.rootPc = 0;
keyboardState.octave.fill(4);selectTrack(0);seqState.sessionMode = true;seqState.fullVelocity = false;
setFlag('hblaunchpad', 1);tickLaunchpad(30);tickLaunchpad(40);tickLaunchpad(50);
onMidiMessageExternal([144, 112, 87]);
assert.deepEqual(midi.at(-1), [0, 144, 48, 87], 'selected target plays with velocity while Move is in clip view');
selectTrack(3);tickLaunchpad(120);
onMidiMessageExternal([160, 112, 45]);
assert.deepEqual(midi.at(-1), [0, 160, 48, 45], 'pressure follows its original owner after a track switch');
onMidiMessageExternal([144, 112, 0]);
assert.deepEqual(midi.at(-1), [0, 128, 48, 0], 'velocity-zero release uses the press owner');
assert(engine.ops.some(operation => operation.startsWith('npr 0 48 45')), 'pressure enters the existing recording path');
onMidiMessageExternal([144, 96, 100]);
assert(writes.some(([ownerTrack, key, value]) => ownerTrack === 3 && key.endsWith('hb_movy_input_approach') && value === '80,-32,0'));
assert.deepEqual(midi.at(-1), [3, 144, 80, 100]);
const repeatStart = midi.length;
onMidiMessageExternal([144, 96, 110]);
assert.deepEqual(midi.slice(repeatStart), [[3, 128, 80, 0], [3, 144, 80, 110]], 'same-pad repeats retrigger in arrival order');
const ignoredStart = midi.length;
onMidiMessageExternal([145, 96, 100]);onMidiMessageExternal([144, 120, 100]);
assert.equal(midi.length, ignoredStart, 'other channels and side buttons do not enter the grid');
unloadLaunchpad();assert.deepEqual(midi.at(-1), [3, 128, 80, 0]);
console.log('Launchpad: all layouts, protocol framing, clip-view play, pressure ownership, recording, repeat hits and teardown pass');

// Exercise actual HB page assignments, Copy mode changes, and shared touch ownership.
const { readFileSync } = await import('node:fs');
const contract = JSON.parse(readFileSync(process.env.HB_MODULE, 'utf8'));
const { schwungPageFor, schwungGridReload } = await import('../dist/esm/renderer/schwung-grid.js');
const { seqHandleButtonCc } = await import('../dist/esm/seq/router-buttons.js');
const { VIEW_KNOBS } = await import('../dist/esm/app/state.js');
const { beginSurfaceControl, toggleSurfaceLatch, surfaceControlLights } = await import('../dist/esm/surfaces/controls.js');
const values = new Map(contract.capabilities.chain_params.map(param => [param.key, String(param.default ?? param.options?.[0] ?? '0')]));
values.set('motion_gesture_binding_1', '1,0,0,0,350,0,0,1');
values.set('motion_lights', [0,0,0,...new Array(16).fill(1)].join(','));
const controlPort = portFor(0);
controlPort.getParam = key => key === 'midi_fx1_module' ? 'harmonybus' : key.endsWith(':chain_params') ? JSON.stringify(contract.capabilities.chain_params) :
    key.endsWith(':ui_hierarchy') ? JSON.stringify(contract.capabilities.ui_hierarchy) : key.includes('surface_frame') ? frame() : values.get(key.split(':').at(-1)) ?? '';
controlPort.getMany = keys => keys.map(key => controlPort.getParam(key));
controlPort.setParam = (key, value) => { writes.push([0,key,value]); return true; };
selectTrack(0);schwungGridReload();appState.currentView = VIEW_KNOBS;seqState.sessionMode = false;seqState.loopMode = false;
appState.shiftHeld = false;seqState.recording = false;seqState.countingIn = false;seqState.trackSelectHold = false;
appState.trackChainIndex[0] = 0;setFlag('hbsteprow', 0);keyboardState.layout = 0;
let page = schwungPageFor(0, 'midi_fx1');assert(page.ready);
const copyTap = () => { seqHandleButtonCc(60, 127);seqHandleButtonCc(60, 0); };
copyTap();page = schwungPageFor(0, 'midi_fx1');assert.equal(page.keyAt(0), 'motion_control_1');
setFlag('hblaunchpad', 1);tickLaunchpad(200);tickLaunchpad(210);tickLaunchpad(220);
const controlStart = writes.length;
onMidiMessageExternal([176,104,127]);
copyTap();page = schwungPageFor(0, 'midi_fx1');assert.equal(page.keyAt(0), 'approach_bank_1');
onMidiMessageExternal([176,104,0]);
assert(writes.slice(controlStart).some(([,key,value]) => key.endsWith('motion_gesture_1') && value.startsWith('Up,')), 'top release retains Perform 1 operation after changing to Perform 2');
assert(!writes.slice(controlStart).some(([,key,value]) => key.endsWith('approach_touch_1') && value.startsWith('Up')), 'release does not touch the new page');
const sharedStart = writes.length;
page.knobTouch(0,true);onMidiMessageExternal([176,104,127]);page.knobTouch(0,false);
assert.equal(writes.slice(sharedStart).filter(([,key,value]) => key.endsWith('approach_touch_1') && value === 'Down').length, 1);
assert(!writes.slice(sharedStart).some(([,key,value]) => key.endsWith('approach_touch_1') && value.startsWith('Up')));
onMidiMessageExternal([176,104,0]);
assert.equal(writes.slice(sharedStart).filter(([,key,value]) => key.endsWith('approach_touch_1') && value.startsWith('Up')).length, 1);
values.set('approach_latch_slots','0');
onMidiMessageExternal([144,8,127]);onMidiMessageExternal([176,104,127]);onMidiMessageExternal([176,104,0]);
assert.deepEqual(writes.at(-1).slice(1), ['midi_fx1:approach_control_1','LatchOn']);
values.set('approach_latch_slots','1');
onMidiMessageExternal([176,104,127]);onMidiMessageExternal([176,104,0]);
assert.deepEqual(writes.at(-1).slice(1), ['midi_fx1:approach_control_1','LatchOff']);
for(let time=300;time<600;time+=10)tickLaunchpad(time);
assert(sent.some(packets => packets.some((value,index) => index%4===0 && packets[index+1]===144 && packets[index+2]===8 && packets[index+3]===63)), 'topmost side modifier is illuminated');
onMidiMessageExternal([144,8,0]);
const lights = surfaceControlLights(page);assert.equal(lights.length,8);
unloadLaunchpad();
console.log('Launchpad controls: mode ownership, simultaneous Move touch, latch toggle and modifier LED pass');

setFlag('hblaunchpad', 2);tickLaunchpad(700);tickLaunchpad(710);tickLaunchpad(720);
const xStart = writes.length;
onMidiMessageExternal([176,89,127]);values.set('approach_latch_slots','0');
onMidiMessageExternal([176,91,127]);onMidiMessageExternal([176,91,0]);onMidiMessageExternal([176,89,0]);
assert(writes.slice(xStart).some(([,key,value])=>key.endsWith('approach_control_1')&&value==='LatchOn'));
onMidiMessageExternal([144,11,110]);onMidiMessageExternal([160,11,0]);
assert.deepEqual(midi.at(-1),[0,160,38,0], 'zero pressure is pressure, not a release');
globalThis.overtakeParked=true;tickLaunchpad(800);
assert.deepEqual(midi.at(-1),[0,128,38,0], 'parking releases live notes');
assert.deepEqual(claims.at(-1),[0,-1], 'parking releases channel ownership');
globalThis.overtakeParked=false;setFlag('hblaunchpad',0);unloadLaunchpad();
console.log('Launchpad X: top/side addresses, zero pressure and parked teardown pass');

const activePort=portFor(appState.activeTrack.index),previousGet=activePort.getParam;
let previewReads=0,missingPreview=false;
activePort.getParam=key=>{
    if(key.includes('surface_frame')){previewReads++;return missingPreview?'':frame();}
    return previousGet(key);
};
setFlag('hblaunchpad',2);tickLaunchpad(1000);tickLaunchpad(1010);tickLaunchpad(1020);
assert.equal(previewReads,1,'one coherent surface-frame read per polling slot, including startup');
const firstFrame=unpack(sent.at(-1));
assert.equal(firstFrame[6],3);
assert.equal((firstFrame.length-8)/5,73,'X paints every dirty LED in one message rather than eight at a time');
const stagedStart=sent.length;
onMidiMessageExternal([176,89,127]);
const beforeNotes=previewReads;
onMidiMessageExternal([144,11,100]);onMidiMessageExternal([128,11,0]);
onMidiMessageExternal([144,81,100]);onMidiMessageExternal([128,81,0]);
assert.equal(previewReads,beforeNotes,'playing either bank does not synchronously refresh pad colors');
for(let now=1021;now<=1070;now++)tickLaunchpad(now);
assert.equal(previewReads,2,'both banks share one bounded polling cadence');
assert.equal(sent.length,stagedStart,'a full RGB frame drains before another LED frame is queued');
onMidiMessageExternal([176,89,0]);
const addresses=Array.from({length:(firstFrame.length-8)/5},(_,index)=>firstFrame[8+index*5]);
assert(addresses.some(address=>address>=11&&address<=48)&&addresses.some(address=>address>=51&&address<=88),
    'the first complete frame already updates both halves together');
missingPreview=true;
const beforeMiss=writes.length;
for(let now=1120;now<=1420;now+=50)tickLaunchpad(now);
assert.equal(writes.slice(beforeMiss).filter(([,key])=>key.includes('surface_preview')||key.endsWith('surface_enabled')).length,0,
    'missed reads do not resend geometry and enable writes');
let failedSends=0;
globalThis.move_midi_external_send=()=>{failedSends++;return false;};
onMidiMessageExternal([176,89,127]);
for(let now=1421;now<=1520;now++)tickLaunchpad(now);
assert(failedSends>0&&failedSends<=4,'a full LED queue retries at most 40 times per second');
globalThis.move_midi_external_send=packets=>{sent.push([...packets]);return true;};
activePort.getParam=previousGet;setFlag('hblaunchpad',0);unloadLaunchpad();
console.log('Launchpad load: bounded native reads, input independent of preview, and USB backpressure pass');

// Existing host APIs only: a burst has one engine write for sound plus recording.
const { flushLaunchpadInput } = await import('../dist/esm/surfaces/launchpad.js');
const nativeWrites=[];
let acknowledge=true;
globalThis.host_module_set_param_blocking=(key,value,timeout)=>{nativeWrites.push([key,value,timeout]);return acknowledge;};
selectTrack(5);keyboardState.layout=3;keyboardState.scale=0;keyboardState.rootPc=0;
portFor(5).getParam=key=>key.includes('surface_frame')?frame():'';
setFlag('hblaunchpad',2);tickLaunchpad(2000);tickLaunchpad(2010);tickLaunchpad(2020);
const beforeBurst=nativeWrites.length, beforeLegacy=midi.length;
onMidiMessageExternal([144,11,90]);onMidiMessageExternal([160,11,30]);onMidiMessageExternal([160,11,70]);
onMidiMessageExternal([128,11,0]);
assert.equal(nativeWrites.length,beforeBurst,'input callbacks do not block once per note or pressure report');
assert.equal(midi.length,beforeLegacy,'batched notes have no duplicate legacy send');
assert(flushLaunchpadInput());
const batch=nativeWrites.at(-1);
assert.equal(batch[0],'surface_events');
assert.deepEqual(batch[1].split(';').map(event=>Number(event.split(',')[2])),[144,160,128]);
assert.equal(Number(batch[1].split(';')[1].split(',')[5]),70,'pressure coalesces without crossing a note edge');
assert.equal(batch[2],8,'input waits have a short bound');
acknowledge=false;
onMidiMessageExternal([144,11,100]);assert.equal(flushLaunchpadInput(),false);
const retried=nativeWrites.at(-1)[1];acknowledge=true;assert(flushLaunchpadInput());
assert.equal(nativeWrites.at(-1)[1],retried,'retry serials are stable for DSP duplicate suppression');
const beforePriority=nativeWrites.length;
onMidiMessageExternal([128,11,0]);tickLaunchpad(2070);
assert.equal(nativeWrites[beforePriority][0],'surface_events','pending notes precede frame polling');
unloadLaunchpad();assert.equal(nativeWrites.at(-1)[0],'surface_release');
console.log('Launchpad batches: existing host API, ordered note edges, coalesced pressure, bounded waits, retry identity and teardown pass');

// The external renderer holds pulse peaks, including nested/error restoration.
const { withSteadyHarmonyLights, harmonyPulse } = await import('../dist/esm/keyboard/harmony-pads.js');
assert.equal(harmonyPulse(0.5,0),0);
withSteadyHarmonyLights(() => {
    for (const shape of [0,1,2,3]) for (const phase of [0,0.25,0.5,0.75]) assert.equal(harmonyPulse(phase,shape),1);
    assert.equal(withSteadyHarmonyLights(() => harmonyPulse(0.5,0)),1);
});
assert.throws(() => withSteadyHarmonyLights(() => { throw new Error('paint'); }));
assert.equal(harmonyPulse(0.5,0),0,'Move keeps its pulse behavior after external painting');
console.log('Launchpad steady lights: all pulse shapes hold their peak and Move animation is restored');
