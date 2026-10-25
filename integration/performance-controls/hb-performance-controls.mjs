import './hb-grid.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {appState,VIEW_KNOBS}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {setGridEnabled}=await import('../dist/esm/seq/grid.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {createSchwungPage}=await import('../dist/esm/renderer/schwung-page.js');
const {schwungPageFor}=await import('../dist/esm/renderer/schwung-grid.js');
const {setFlag}=await import('../dist/esm/seq/flags.js');
const {setChordEnabled,chordPage,tickChord}=await import('../dist/esm/seq/chord-play.js');
const {beginHbLaneTouch,hbPerformanceStep,releaseHbPerformanceStep,resetHbPerformance}=await import('../dist/esm/renderer/hb-performance.js');
const {installMockEngine}=await import('./mock-engine.mjs');
const {seqEngineTick}=await import('../dist/esm/seq/engine.js');
const {restoreClips}=await import('../dist/esm/seq/clips-layout.js');
const {clipPageState}=await import('../dist/esm/seq/clip-page.js');
setGridEnabled(false);setChordEnabled(false);setFlag('hbsteprow',1);selectTrack(3);
appState.currentView=VIEW_KNOBS;seqState.sessionMode=false;

// The shared gesture boundary fires once, before Joint's actor fan-out.
const engine=installMockEngine();seqEngineTick();seqState.playing=true;seqState.watchLane=72;
restoreClips({drumTracks:[8,4,8,12]});clipPageState.drumSpan=1;clipPageState.editGrid=0;clipPageState.drumVelocity=91;
const writes=[];
const owner={performanceGet:key=>key.startsWith('motion_gesture_binding_')?'66,38,3,2,350,0,0,1':'',performanceSet:(...args)=>writes.push(args)};
const release=beginHbLaneTouch(owner,0),second=beginHbLaneTouch(owner,0);
assert.deepEqual(engine.ops.filter(op=>op.startsWith('dfire')),['dfire 8 38 192 24 91']);
release();second();assert.equal(writes.length,0,'one-shot never fans out or latches on release');
assert.equal(appState.activeTrack.index,3);assert.equal(seqState.watchLane,72);
assert(hbPerformanceStep([144,16,127],owner));assert(hbPerformanceStep([144,16,127],owner));
assert(releaseHbPerformanceStep([128,16,0]));
assert.equal(engine.ops.filter(op=>op.startsWith('dfire')).length,2);
assert.equal(writes.length,0);resetHbPerformance();

// Status is directly reachable, publishes one coherent snapshot, and is read
// only while visible. Turning the existing color settings still uses HB.
setFlag('hbsteprow',0);const port=portFor(3),get=port.getParam;let snapshots=0;
port.getParam=key=>key.endsWith(':harmony_status_snapshot')?(snapshots++,'dp1|C major|C major|D minor|Ready|Current|Off|Off|None'):get(key);
const normal=createSchwungPage(port,'midi_fx1');
const status=normal.ctl.pages.findIndex(page=>page.level==='harmony_status');assert(status>=0);
normal.goToPage(status);normal.tick();
assert.equal(normal.ctl.state.values.current_harmony,'C major');assert.equal(normal.ctl.state.values.next_harmony,'D minor');
assert.equal(normal.ctl.hbNavigation.state().category,'Core');
const sampled=snapshots;normal.goToPage(0);normal.tick();assert.equal(snapshots,sampled,'hidden status does not poll');
port.getParam=get;

// Back descends from any group to the menu, then to Core, then exits; left
// from the first menu item still returns to the last non-list panel.
setChordEnabled(true);let page=chordPage();page.goToPage(0);
assert.equal(page.ctl.hbNavigation.state().indices.length,8);
const library=page.ctl.pages.findIndex(page=>page.level==='cp_bass_library');page.goToPage(library);
page.back();assert(page.ctl.hbNavigation.isMenu());page.back();assert.equal(page.ctl.hbNavigation.state().category,'Core');
assert.equal(page.back()?.action,'exit');

// The actual Chord Play operation page owns the step row, even if the saved
// Normal Play mode was Motif Play. The melody track remains selected.
const operator=page.ctl.pages.findIndex(page=>page.level==='cp_Conductor_follower_touch');
page.goToPage(operator);setFlag('hbsteprow',2);
const conductor=portFor(0),conductorGet=conductor.getParam;
conductor.getParam=key=>key.endsWith('motion_gesture_binding_1')?'66,38,3,2,350,0,0,1':conductorGet(key);
const fills=engine.ops.filter(op=>op.startsWith('dfire')).length;
globalThis.onMidiMessageInternal([144,16,127]);globalThis.onMidiMessageInternal([128,16,0]);
assert.equal(engine.ops.filter(op=>op.startsWith('dfire')).length,fills+1,'Chord Play operation step fires once through the real MIDI router');
assert.equal(appState.activeTrack.index,3);conductor.getParam=conductorGet;setFlag('hbsteprow',0);

// Synchronous host loading cannot count as a physical long press.
setChordEnabled(false);selectTrack(0);appState.currentView=VIEW_KNOBS;appState.trackChainIndex[0]=0;
const target=portFor(3),targetGet=target.getParam;let now=100000;Date.now=()=>now;
target.getParam=key=>{if(key.endsWith('chain_params'))now+=700;return targetGet(key);};
globalThis.onMidiMessageInternal([176,40,127]);globalThis.onMidiMessageInternal([176,40,0]);
assert(now>100000,'the real switch exercised slow host metadata');
assert.equal(appState.activeTrack.index,3,'tap stays on Track 4 after slow metadata load');
target.getParam=targetGet;
setChordEnabled(true);chordPage();let hiddenReads=0;target.getParam=key=>{if(key.endsWith('chain_params'))hiddenReads++;return targetGet(key);};
globalThis.onMidiMessageInternal([176,40,127]);globalThis.onMidiMessageInternal([176,40,0]);
assert.equal(hiddenReads,0,'Chord Play does not reload the hidden normal module');
tickChord();assert.equal(appState.activeTrack.index,3);
target.getParam=targetGet;setChordEnabled(false);

// The photographed stock Chord module has an ordinary root Back exit too.
const chord=JSON.parse(readFileSync(process.env.SCHWUNG+'/src/modules/midi_fx/chord/module.json','utf8'));
const modulePort={...port,track:port.track,getParam:key=>key==='midi_fx1_module'?'chord':key.endsWith('ui_hierarchy')?JSON.stringify(chord.capabilities.ui_hierarchy):key.endsWith('chain_params')?JSON.stringify(chord.capabilities.chain_params):'0'};
const fallback=createSchwungPage(modulePort,'midi_fx1');assert(fallback.ready);assert.equal(fallback.back()?.action,'exit');
target.getParam=modulePort.getParam;appState.trackChainIndex[3]=0;
schwungPageFor(3,'midi_fx1').reload();seqState.sessionMode=false;
globalThis.onMidiMessageInternal([176,51,127]);globalThis.onMidiMessageInternal([176,51,0]);
assert(seqState.sessionMode,'the photographed stock Chord page exits through the actual Back dispatcher');
target.getParam=targetGet;
console.log('Performance controls: remote drum target, one-shot ownership, focused panels, coherent visible status, Back exits and slow track selection pass');
