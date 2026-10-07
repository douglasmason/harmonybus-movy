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
const frame = () => '145,145,145,1,2741,2,0,3,2,0|piano1,1';
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
    port.getParam = key => key.includes('surface_view') ? frame() : '';
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
const { VIEW_KNOBS, VIEW_CPU } = await import('../dist/esm/app/state.js');
const { beginSurfaceControl, toggleSurfaceLatch, surfaceControlLights } = await import('../dist/esm/surfaces/controls.js');
const values = new Map(contract.capabilities.chain_params.map(param => [param.key, String(param.default ?? param.options?.[0] ?? '0')]));
values.set('motion_gesture_binding_1', '1,0,0,0,350,0,0,1');
values.set('motion_lights', [0,0,0,...new Array(16).fill(1)].join(','));
const controlPort = portFor(0);
controlPort.getParam = key => key === 'midi_fx1_module' ? 'harmonybus' : key.endsWith(':chain_params') ? JSON.stringify(contract.capabilities.chain_params) :
    key.endsWith(':ui_hierarchy') ? JSON.stringify(contract.capabilities.ui_hierarchy) : key.includes('surface_view') ? frame() : values.get(key.split(':').at(-1)) ?? '';
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
    assert(!key.includes('surface_frame'),'never combine three expensive previews in one host callback');
    if(key.includes('surface_view')){previewReads++;return missingPreview?'':frame();}
    return previousGet(key);
};
setFlag('hblaunchpad',2);tickLaunchpad(1000);tickLaunchpad(1010);tickLaunchpad(1020);
assert.equal(previewReads,1,'only one external bank is read per polling slot');
const beforeNotes=previewReads;
onMidiMessageExternal([144,11,100]);onMidiMessageExternal([128,11,0]);
onMidiMessageExternal([144,81,100]);onMidiMessageExternal([128,81,0]);
assert.equal(previewReads,beforeNotes,'playing either bank does not synchronously refresh pad colors');
for(let now=1021;now<=1070;now++)tickLaunchpad(now);
assert.equal(previewReads,2,'the second bank waits for the next bounded polling slot');
const firstFrame=unpack(sent.at(-1));
assert.equal(firstFrame[6],3);
assert.equal((firstFrame.length-8)/5,73,'both completed banks paint in one RGB message');
const stagedStart=sent.length;
onMidiMessageExternal([176,89,127]);
for(let now=1071;now<=1120;now++)tickLaunchpad(now);
assert.equal(sent.length,stagedStart,'a full RGB frame drains before another LED frame is queued');
onMidiMessageExternal([176,89,0]);
const addresses=Array.from({length:(firstFrame.length-8)/5},(_,index)=>firstFrame[8+index*5]);
assert(addresses.some(address=>address>=11&&address<=48)&&addresses.some(address=>address>=51&&address<=88),
    'the first complete frame updates both halves together after separate reads');
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
portFor(5).getParam=key=>key.includes('surface_view')?frame():'';
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

// Run the real surface and diagnostic controller with deterministic engine polls.
const { launchpadPreviewReady, launchpadPreviewFrozen } = await import('../dist/esm/surfaces/launchpad.js');
const { previewTest, clickPreviewTest, tickPreviewTest, cancelPreviewTest, previewTestLines } = await import('../dist/esm/seq/preview-test.js');
const { renderCpuView } = await import('../dist/esm/renderer/cpu-view.js');
const { buildCpuPageVM } = await import('../dist/esm/seq/cpu-page-vm.js');
const { openCpuPage, clearCpuPage } = await import('../dist/esm/seq/cpu-page.js');
const { onMidiMessageInternal } = globalThis;
setFlag('hblaunchpad',2);tickLaunchpad(3000);tickLaunchpad(3010);tickLaunchpad(3020);tickLaunchpad(3070);
assert(launchpadPreviewReady());
engine.status.play=1;seqState.playing=true;openCpuPage();
const clickJog=()=>{onMidiMessageInternal([176,MoveMainButton,127]);onMidiMessageInternal([176,MoveMainButton,0]);};
appState.shiftHeld=true;clickJog();appState.shiftHeld=false;assert.equal(previewTest.stage,'intro','real jog click opens guided instructions');
clickPreviewTest(4000,true);assert.equal(previewTest.stage,'settle');
const sampleAudio=(enabled,peak)=>[enabled,6900,0,1,peak,2902,204,50,229,305,184,0,890,0,0,0,0,0,0,0,4,176,6899,7,9000,8100,900,400,123].join(',');
const sampleRequests=(enabled,read,key='surface_view0')=>`${enabled},1452,2,${read},ch3:midi_fx1:${key},634,surface_events,302,midi`;
const poll=(now,enabled,peak,read,key)=>{
    engine.status.aprof=sampleAudio(enabled,peak);engine.status.rprof=sampleRequests(enabled,read,key);
    // statusSeq advances only through the production status parser.
    for(let repeat=0;repeat<8;repeat++)seqEngineTick();
    tickPreviewTest(now);
};
poll(5000,0,9999,9999);assert.equal(previewTest.stage,'arming');
tickPreviewTest(5010);assert.equal(previewTest.stage,'arming','stale status cannot acknowledge a reset');
poll(5020,1,1866,1450);assert.equal(previewTest.stage,'run');
for(let now=6020;now<=25020;now+=1000)poll(now,1,1866,1450);
assert.equal(previewTest.stage,'stop');
tickPreviewTest(25030);assert.equal(previewTest.captures.length,0,'capture waits for an OFF acknowledgement');
poll(25040,0,1900,1460);assert.equal(previewTest.pass,1);
assert.equal(previewTest.captures[0].audio[4],1900,'final acknowledged sample supersedes the last running UI sample');
assert.equal(launchpadPreviewFrozen(),false,'B gate waits until timing is enabled');
poll(26040,0,1900,1460);assert.equal(previewTest.stage,'arming');
assert.equal(launchpadPreviewFrozen(),false,'arming preserves the previous workload');
poll(26060,1,1000,100,'status');
assert(launchpadPreviewFrozen());
const readsBeforeFreeze=previewReads,packetsBeforeFreeze=sent.length,eventsBeforeFreeze=nativeWrites.length;
const diagnosticPort=portFor(appState.activeTrack.index),diagnosticGet=diagnosticPort.getParam;
let movePreviewReads=0;
diagnosticPort.getParam=key=>{
    if(key.includes('surface_view'))previewReads++;
    if(key.endsWith(':pad_view')||key.endsWith(':pad_render')){movePreviewReads++;return frame();}
    return diagnosticGet(key);
};
const {refreshHarmonyPads,isMovePreviewFrozen,pianoApproachTarget}=await import('../dist/esm/keyboard/harmony-pads.js');
onMidiMessageExternal([144,11,99]);onMidiMessageExternal([160,11,45]);
for(let now=25050;now<25200;now+=10)tickLaunchpad(now);
assert.equal(previewReads,readsBeforeFreeze,'frozen pass performs no external preview reads');
assert.equal(sent.length,packetsBeforeFreeze,'frozen pass queues no LED frames');
assert(nativeWrites.slice(eventsBeforeFreeze).some(([key,value])=>key==='surface_events'&&value.includes(',144,')),
    'frozen pass still flushes note on and pressure');
onMidiMessageExternal([128,11,0]);tickLaunchpad(25200);
assert(nativeWrites.at(-1)[1].includes(',128,'),'releases remain live during the frozen pass');
keyboardState.rootPc=2;tickLaunchpad(25210);tickPreviewTest(26070);
assert.equal(previewTest.stage,'run','recorded key changes do not abort the test');
onMidiMessageExternal([144,21,90]);onMidiMessageExternal([128,21,0]);tickLaunchpad(25220);
assert(nativeWrites.at(-1)[1].includes(',144,'),'approach pads retain their capability during frozen key changes');
assert.equal(previewReads,readsBeforeFreeze,'key changes do not sneak preview reads into the frozen pass');
keyboardState.rootPc=0;tickLaunchpad(25230);
for(let now=27060;now<=46060;now+=1000)poll(now,1,1000,100,'status');
refreshHarmonyPads(appState.activeTrack.index,46060);
assert(movePreviewReads>0,'B retains Move preview reads');
const moveApproachBefore=pianoApproachTarget(appState.activeTrack.index,8);
poll(46080,0,1100,150,'status');
assert.equal(previewTest.pass,2);
assert.equal(isMovePreviewFrozen(),false,'C transition is not discarded before meter reset');
poll(47080,0,1100,150,'status');poll(47100,1,900,60,'status');
assert(isMovePreviewFrozen());assert(launchpadPreviewFrozen());
const readsBeforeBoth=movePreviewReads,surfaceReadsBeforeBoth=previewReads,writesBeforeBoth=writes.length;
refreshHarmonyPads(appState.activeTrack.index,46100);tickLaunchpad(46100);
refreshHarmonyPads(appState.activeTrack.index,46500);tickLaunchpad(46500);
assert.equal(movePreviewReads,readsBeforeBoth,'C suppresses pad_view and pad_render, including fallback reads');
assert.equal(previewReads,surfaceReadsBeforeBoth,'C keeps external preview reads frozen');
assert.equal(writes.length,writesBeforeBoth,'C does not write preview geometry or trail settings');
assert.equal(pianoApproachTarget(appState.activeTrack.index,8),moveApproachBefore,'C retains Move input capability');
onMidiMessageExternal([144,11,99]);onMidiMessageExternal([128,11,0]);tickLaunchpad(46510);
assert(nativeWrites.at(-1)[1].includes(',128,'),'C keeps input and release batches live');
for(let now=48100;now<=67100;now+=1000)poll(now,1,900,60,'status');
poll(67120,0,950,65,'status');
assert.equal(previewTest.stage,'results');assert.equal(launchpadPreviewFrozen(),false);
assert.equal(isMovePreviewFrozen(),false);
assert.equal(previewTest.captures.length,3);
assert.equal(previewTest.captures[0].audio[4],1900,'A is retained independently of B');
assert.equal(previewTest.captures[1].audio[4],1100);
assert.equal(previewTest.captures[2].audio[4],950);
assert.deepEqual(previewTest.captures[2].audio.slice(22),[6899,7,9000,8100,900,400,123],'cadence fields survive the real status parser and capture');
const resultsBeforeRefresh=JSON.stringify(previewTest.captures);
tickLaunchpad(67150);tickLaunchpad(67200);refreshHarmonyPads(appState.activeTrack.index,67200);
assert(previewReads>readsBeforeFreeze,'preview polling resumes automatically after the test');
assert(movePreviewReads>readsBeforeBoth,'Move preview refresh resumes immediately on restoration');
poll(67220,0,9999,9999);assert.equal(JSON.stringify(previewTest.captures),resultsBeforeRefresh,'photographs remain stable');
const pixels=new Uint8Array(128*64),screens=[];let overflow=false;
globalThis.clear_screen=()=>pixels.fill(0);
globalThis.fill_rect=(x,y,width,height,value)=>{
    if(x<0||y<0||x+width>128||y+height>64)overflow=true;
    for(let row=Math.max(0,y);row<Math.min(64,y+height);row++)
        for(let column=Math.max(0,x);column<Math.min(128,x+width);column++)pixels[row*128+column]=Number(!!value);
};
for(let photo=0;photo<5;photo++){
    assert.equal(previewTest.photo,photo);renderCpuView(buildCpuPageVM());screens.push(pixels.slice());clickJog();
}
assert.equal(overflow,false,'all result pages fit the physical display');
assert.notDeepEqual(screens[0],screens[1]);assert.notDeepEqual(screens[1],screens[2]);
const runningScreens=[];
const savedDisplayState={stage:previewTest.stage,pass:previewTest.pass,remaining:previewTest.remaining};
previewTest.remaining=20;
for(let pass=0;pass<3;pass++){
    for(const stage of ['settle','arming','run','stop']){
        previewTest.pass=pass;previewTest.stage=stage;renderCpuView(buildCpuPageVM());
        if(stage==='run')runningScreens.push(pixels.slice());
    }
}
Object.assign(previewTest,savedDisplayState);
assert.equal(overflow,false,'large phase labels and countdown fit every running and transition screen');
assert.notDeepEqual(runningScreens[0],runningScreens[1]);assert.notDeepEqual(runningScreens[1],runningScreens[2]);
if(process.env.HB_TEST_PREVIEW){
    const {PNG}=await import('pngjs');const {writeFileSync}=await import('node:fs');
    const preview=new PNG({width:128,height:64*5});
    screens.forEach((screen,page)=>screen.forEach((value,index)=>preview.data.set(value?[212,208,200,255]:[0,0,0,255],(page*128*64+index)*4)));
    writeFileSync(process.env.HB_TEST_PREVIEW,PNG.sync.write(preview));
    const runningPreview=new PNG({width:128,height:64*3});
    runningScreens.forEach((screen,page)=>screen.forEach((value,index)=>runningPreview.data.set(value?[212,208,200,255]:[0,0,0,255],(page*128*64+index)*4)));
    writeFileSync(process.env.HB_TEST_PREVIEW+'.phases.png',PNG.sync.write(runningPreview));
}
clearCpuPage();assert.equal(previewTest.stage,'idle');
clickPreviewTest(47000,true);clickPreviewTest(47010,true);poll(48010,0,1100,150);poll(48020,1,1100,150);
tickPreviewTest(54000);assert.equal(previewTest.stage,'error','status failure aborts instead of presenting a result');
assert.equal(launchpadPreviewFrozen(),false);
cancelPreviewTest();clickPreviewTest(55000,true);clickPreviewTest(55010,true);
poll(56010,0,1100,150);poll(56020,1,1100,150);
for(let now=57020;now<=76020;now+=1000)poll(now,1,1100,150);
poll(76040,0,1100,150);assert.equal(launchpadPreviewFrozen(),false);
poll(77040,0,1100,150);poll(77060,1,1100,150);
for(let now=78060;now<=97060;now+=1000)poll(now,1,1100,150);
poll(97080,0,1100,150);
poll(98080,0,1100,150);poll(98100,1,1100,150);assert(isMovePreviewFrozen());
clearCpuPage();assert.equal(launchpadPreviewFrozen(),false,'Back/page exit immediately restores external previews');
assert.equal(isMovePreviewFrozen(),false,'Back/page exit immediately restores Move previews');
cancelPreviewTest();clickPreviewTest(77000,true);
renderCpuView(buildCpuPageVM());assert.equal(overflow,false,'instructions also fit');
assert(previewTestLines().some(line=>line.includes('20S')));
cancelPreviewTest();
engine.status.play=0;seqState.playing=false;
clickPreviewTest(78000,true);clickPreviewTest(78010,true);
assert.equal(previewTest.stage,'starting','stopped transport starts without manual preparation');
assert(nativeWrites.every(([key])=>key!=='state'),'test does not replace the set');
engine.status.play=1;poll(78030,0,1100,150);assert.equal(previewTest.stage,'settle');
const restoreStart=nativeWrites.length;
cancelPreviewTest();for(let repeat=0;repeat<8;repeat++)seqEngineTick();
assert(nativeWrites.slice(restoreStart).some(([key,value])=>key==='cmd'&&value.split(';').includes('stop')),
    'cancel stops playback if the test started it');
// Default quick capture needs no Launchpad and no listening comparison.
appState.currentView=VIEW_CPU;setFlag('hblaunchpad',0);
engine.status.play=1;seqState.playing=true;
const quickPoll=(now,enabled,milliseconds,tone='2,262836,0,0,132300')=>{
    engine.status.aprof=sampleAudio(enabled,1800)+`,2,2,3,4000,700,ch3:midi_fx1:surface_view0,${milliseconds}`;
    engine.status.rprof=sampleRequests(enabled,1450);
    engine.status.tonecheck=tone;
    for(let repeat=0;repeat<8;repeat++)seqEngineTick();
    tickPreviewTest(now);
};
clickPreviewTest(99990);assert.equal(previewTest.quick,true);assert.equal(previewTest.stage,'intro');
assert(previewTestLines().some(line=>line.includes('35 SECONDS')));
clickPreviewTest(100000);assert.equal(previewTest.stage,'settle');
quickPoll(101000,0,0);assert.equal(previewTest.stage,'arming');
quickPoll(101010,1,10,'1,0,0,0,0');assert.equal(previewTest.stage,'run');
assert.equal(launchpadPreviewFrozen(),false);assert.equal(isMovePreviewFrozen(),false);
quickPoll(102010,1,1010);assert.equal(previewTest.remaining,34);
clearCpuPage();appState.currentView=0;
quickPoll(104010,1,3010);assert.equal(previewTest.stage,'run','capture survives navigating to performance controls');
openCpuPage();assert.equal(previewTest.stage,'run','reopening does not reset the capture');
quickPoll(136020,0,35005);assert.equal(previewTest.stage,'results');
assert.equal(previewTest.captures.length,1);
assert.equal(previewTest.captures[0].gapRequest,'ch3:midi_fx1:surface_view0');
assert(previewTestLines()[0].includes('PCM OK'));
renderCpuView(buildCpuPageVM());assert.equal(overflow,false);
const quickFrame=pixels.slice();
if(process.env.HB_QUICK_PREVIEW){
    const {PNG}=await import('pngjs');const {writeFileSync}=await import('node:fs');
    const png=new PNG({width:128,height:64});
    quickFrame.forEach((value,index)=>png.data.set(value?[212,208,200,255]:[0,0,0,255],index*4));
    writeFileSync(process.env.HB_QUICK_PREVIEW,PNG.sync.write(png));
}
const frozenQuick=JSON.stringify(previewTest.captures);
quickPoll(136040,0,99000,'2,100000,12,100,132300');
assert.equal(JSON.stringify(previewTest.captures),frozenQuick,'later status cannot replace the result');
previewTest.captures[0].tone=[2,200000,3,100,132300];assert(previewTestLines()[0].includes('PCM FAIL'));
previewTest.captures[0].tone=[3,200000,0,0,10000];assert(previewTestLines()[0].includes('INCOMPLETE'));
clickJog();assert.equal(previewTest.stage,'intro','one-screen result can restart the short check');
cancelPreviewTest();clickPreviewTest(120000);clickPreviewTest(120010);
quickPoll(121010,0,0);quickPoll(121020,1,10);
quickPoll(164030,1,12000);assert.equal(previewTest.stage,'error','live status without completion cannot claim a result');
cancelPreviewTest();
console.log('Quick check: default jog, Launchpad-off support, engine deadline acknowledgement, one frozen screen, failure/incomplete distinction and timeout pass');
diagnosticPort.getParam=diagnosticGet;unloadLaunchpad();
console.log('Guided preview test: real jog, timed A/B/C, fresh acknowledgements, stable photos, live input, both preview gates and restoration pass');

// Sharing never substitutes a different layout or an old/failed native read.
const { matchingMovePreview, setMovePreviewFrozen } = await import('../dist/esm/keyboard/harmony-pads.js');
const { padMapFor, baseNoteFor } = await import('../dist/esm/keyboard/state.js');
setPhase('ready');setMovePreviewFrozen(false);selectTrack(0);seqState.holdStep=-1;
keyboardState.mode=1;keyboardState.layout=3;keyboardState.scale=0;keyboardState.rootPc=0;
let sharedReads=0, rejectGeometry=false, rejectRead=false;
portFor(0).setParam=(key,value)=>!(rejectGeometry&&key.endsWith('pad_preview_inputs'));
portFor(0).getParam=key=>{
    if(key.includes('surface_view'))sharedReads++;
    return rejectRead?'':frame();
};
const geometry=()=>previewPayload(buildSurfaceCells(padMapFor(0),3,false),true);
refreshHarmonyPads(0,199900);refreshHarmonyPads(0,200000);
assert(matchingMovePreview(0,geometry(),200001),'fresh exact Move geometry can be shared');
assert.equal(matchingMovePreview(1,geometry(),200001),null,'track ownership is exact');
assert.equal(matchingMovePreview(0,geometry()+'x',200001),null,'geometry is exact');
assert.equal(matchingMovePreview(0,geometry(),199999),null,'clock rollback cannot reuse');
assert.equal(matchingMovePreview(0,geometry(),200050),null,'50 ms old snapshot expires');
setMovePreviewFrozen(true);
assert.equal(matchingMovePreview(0,geometry(),200002),null,'diagnostic freeze cannot lend a stale frame');
setMovePreviewFrozen(false);refreshHarmonyPads(0,200010);
unloadLaunchpad();setFlag('hblaunchpad',2);
tickLaunchpad(200011);tickLaunchpad(200012);tickLaunchpad(200013);
assert.equal(sharedReads,0,'matching lower bank needs no duplicate native render');
tickLaunchpad(200063);
assert.equal(sharedReads,1,'different upper bank still uses native production renderer');
rejectRead=true;refreshHarmonyPads(0,200080);
assert.equal(matchingMovePreview(0,geometry(),200081),null,'failed reads invalidate the shared result');
rejectRead=false;rejectGeometry=true;keyboardState.octave[0]++;
refreshHarmonyPads(0,200150);
assert.equal(matchingMovePreview(0,geometry(),200151),null,'unacknowledged geometry cannot be shared');
rejectGeometry=false;unloadLaunchpad();
console.log('Shared preview: exact track/geometry, freshness, clock rollback, freeze, failed read/write and duplicate-read elimination pass');

// No physical Launchpad is connected: independently exercise each workload.
const {setLaunchpadIsolation,launchpadIsolationMetrics,launchpadAvailable}=await import('../dist/esm/surfaces/launchpad.js');
cancelPreviewTest();setFlag('hblaunchpad',0);appState.currentView=VIEW_CPU;
let isolationReads=0;
const isolationPort=portFor(appState.activeTrack.index),originalIsolationGet=isolationPort.getParam;
isolationPort.getParam=key=>{if(key.includes('surface_view')){isolationReads++;return frame();}return originalIsolationGet(key);};
for(const mode of ['off','route','preview','led']){
    setLaunchpadIsolation(mode);
    const sentBefore=sent.length,claimsBefore=claims.length,readsBefore=isolationReads;
    for(let now=300000;now<302000;now+=50)tickLaunchpad(now);
    assert.equal(isolationReads>readsBefore,mode==='preview',mode+' preview isolation');
    assert.equal(sent.length>sentBefore,mode==='led',mode+' output isolation');
    assert.equal(claims.slice(claimsBefore).some(entry=>entry[1]===254),mode==='route',mode+' routing isolation');
    const metrics=launchpadIsolationMetrics();
    if(mode==='led')assert(metrics.packets>0);
    if(mode==='preview')assert(metrics.reads>0);
}
setLaunchpadIsolation(null);
// Explicit isolation mode remains available to the controller.
engine.status.play=1;seqState.playing=true;clickPreviewTest(399000,false,true);
assert(previewTest.isolation);assert(previewTestLines()[0].includes('ISOLATION'));
const savedReports=new Map();
const previousWrite=globalThis.host_write_file,previousRead=globalThis.host_read_file;
globalThis.host_write_file=(path,content)=>{savedReports.set(path,content);return true;};
globalThis.host_read_file=path=>savedReports.get(path)??null;
clickPreviewTest(400000);
for(let phase=0;phase<4;phase++){
    const start=401000+phase*37000;
    quickPoll(start,0,0);assert.equal(previewTest.stage,'arming');
    quickPoll(start+10,1,10,'1,0,0,0,0');assert.equal(previewTest.stage,'run');
    assert.equal(previewTest.pass,phase);
    for(let now=start+20;now<start+1020;now+=50)tickLaunchpad(now);
    assert.equal(savedReports.size,0,'no disk writes during measurements');
    quickPoll(start+35020,0,35005);
}
assert.equal(previewTest.stage,'results');assert.equal(previewTest.captures.length,4);
assert.equal(savedReports.size,1);assert(previewTest.reportPath);
const report=JSON.parse(savedReports.get(previewTest.reportPath));
assert.equal(report.format,'movy-x-isolation-v1');assert.equal(report.captures.length,4);
assert(previewTestLines().at(-1).includes('LOG SAVED'));
renderCpuView(buildCpuPageVM());assert.equal(overflow,false);
tickLaunchpad(600000);assert.equal(launchpadAvailable(),false,'saved Off setting restored');
cancelPreviewTest();clickPreviewTest(700000,false,true);clickPreviewTest(700001);
quickPoll(701002,0,0);quickPoll(701012,1,10,'1,0,0,0,0');
cancelPreviewTest();tickLaunchpad(701020);assert.equal(launchpadAvailable(),false,'cancel restores saved setting');
globalThis.host_write_file=previousWrite;globalThis.host_read_file=previousRead;
isolationPort.getParam=originalIsolationGet;
console.log('Disconnected X isolation: independent routing/preview/TX, four acknowledged captures, one verified report, cancel and restoration pass');

// Real jog now selects worker comparison. Native statuses, not UI timers, end phases.
cancelPreviewTest();engine.status.play=1;seqState.playing=true;openCpuPage();clickPreviewTest(799000,false,false,true);
assert(previewTest.workers);assert(previewTestLines()[0].includes('WORKER'));
savedReports.clear();
globalThis.host_write_file=(path,content)=>{savedReports.set(path,content);return true;};
globalThis.host_read_file=path=>savedReports.get(path)??null;
clickPreviewTest(800000);
engine.status.workerbuild='0.34.1-hbclean.188';
for(let phase=0;phase<3;phase++) {
    const start=801000+phase*37000;
    engine.status.workerprof='0,0,0,0,0,0,0,0,0,0,0,0,0,0';
    quickPoll(start,0,0);assert.equal(previewTest.stage,'arming');
    engine.status.workerprof=`1,${phase===1?1:0},0,10,0,0,0,0,0,0,0,0,0,0`;
    quickPoll(start+10,1,10,'1,0,0,0,0');assert.equal(previewTest.stage,'run');
    assert.equal(savedReports.size,0,'no report writes during measured phases');
    engine.status.workerprof=`0,0,0,12000,${phase===1?12000:0},${phase===1?0:100},300,700,50,120,60,800,70,900`;
    quickPoll(start+35020,0,35005);
}
assert.equal(previewTest.stage,'results');assert.equal(savedReports.size,1);
const workerReport=JSON.parse(savedReports.get(previewTest.reportPath));
assert.equal(workerReport.complete,true);assert.equal(workerReport.engineBuild,'0.34.1-hbclean.188');
assert.deepEqual(workerReport.conditions,['PARALLEL 1','SERIAL','PARALLEL 2']);
assert.equal(workerReport.captures[1].worker[4],12000);
renderCpuView(buildCpuPageVM());assert.equal(overflow,false);
cancelPreviewTest();clickPreviewTest(1000000,false,false,true);clickPreviewTest(1000001);
quickPoll(1001002,0,0);
engine.status.workerprof='1,1,0,10,0,0,0,0,0,0,0,0,0,0';
quickPoll(1001012,1,10,'1,0,0,0,0');
setFlag('hblaunchpad',2);tickPreviewTest(1001020);
assert.equal(previewTest.stage,'error','changed workload invalidates comparison');
assert.equal(JSON.parse(savedReports.get(previewTest.reportPath)).complete,false);
for(let repeat=0;repeat<8;repeat++)seqEngineTick();
assert(nativeWrites.some(([key,value])=>key==='cmd' && value.split(';').includes('aprof_off')),'failure sends native restore command');
cancelPreviewTest();
globalThis.host_write_file=previousWrite;globalThis.host_read_file=previousRead;
console.log('Worker comparison: real jog, three acknowledged phases, one report, unchanged workloads and failure restoration pass');

// Default jog chooses the single-run thread/CPU test; no data is written mid-capture.
engine.status.play=1;seqState.playing=true;openCpuPage();clickJog();
assert(previewTest.thread);assert(previewTestLines()[0].includes('65 SECONDS'));
savedReports.clear();
globalThis.host_write_file=(path,content)=>{savedReports.set(path,content);return true;};
globalThis.host_read_file=path=>savedReports.get(path)??null;
clickPreviewTest(1100000);
quickPoll(1101000,0,0);assert.equal(previewTest.stage,'arming');
engine.status.threadprof='1;'+Array(9).fill('1,1,100,40,900,100,1,400,450,800,preview').join(';');
quickPoll(1101010,1,10,'1,0,0,0,0');assert.equal(previewTest.stage,'run');
quickPoll(1136010,1,35010);assert.equal(previewTest.stage,'run','must run longer than old 35-second deadline');
assert.equal(savedReports.size,0);
engine.status.threadprof='0;'+Array(9).fill('22000,22000,100,40,900,100,1,400,450,800,preview').join(';');
quickPoll(1166020,0,65005);
assert.equal(previewTest.stage,'results');assert.equal(savedReports.size,1);
const threadReport=JSON.parse(savedReports.get(previewTest.reportPath));
assert.equal(threadReport.format,'movy-thread-test-v1');assert.equal(threadReport.complete,true);
assert.equal(threadReport.captures[0].thread.parameterRead.cpuAtWallPeakUs,100);
assert.equal(threadReport.captures[0].thread.parameterRead.cpuPeakUs,400);
renderCpuView(buildCpuPageVM());assert.equal(overflow,false);
cancelPreviewTest();globalThis.host_write_file=previousWrite;globalThis.host_read_file=previousRead;
console.log('Thread CPU test: real jog, native 65-second completion, paired timing, one report and display bounds pass');
