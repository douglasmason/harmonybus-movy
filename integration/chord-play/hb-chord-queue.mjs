import './hb-chord-play.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {appState}=await import('../dist/esm/app/state.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const loader=await import('../dist/esm/renderer/hb-motif-loader.js');
selectTrack(3);seqState.sessionMode=false;chord.restoreChord(null);chord.setChordEnabled(true);
const page=chord.chordPage(),port=chord.chordPanelPort(3);port.getParam('midi_fx1:chain_params');
page.goToPage(0);assert.deepEqual(Array.from({length:8},(_,index)=>page.keyAt(index)),['cp_play_mode','cp_track_0_chord_timing','cp_track_0_anticipation','cp_track_0_chord_queue_end','cp_queue_next','cp_queue_count','cp_track_0_chord_queue_depth','cp_off']);
assert.equal(page.ctl.metaAt(1).name,'Queue Time');
const conductorControls=portFor(0);let clock=Date.now();Date.now=()=>clock;const flush=()=>{clock+=100;page.tick();};flush();page.knobTurn(1,4);page.knobTurn(6,4);page.knobTurn(3,4);flush();
assert.equal(conductorControls.getParam('midi_fx1:chord_timing'),'1/16');
assert.equal(conductorControls.getParam('midi_fx1:chord_queue_depth'),'3');
assert.equal(conductorControls.getParam('midi_fx1:chord_queue_end'),'Loop');
assert.equal(portFor(3).getParam('midi_fx1:chord_queue_depth'),'2');
assert.equal(appState.activeTrack.index,3);
const startPage=page.pageIndex;chord.chordMidi([176,63,127]);assert.notEqual(page.pageIndex,startPage);chord.chordMidi([176,62,127]);assert.equal(page.pageIndex,startPage);
const core=page.ctl.hbNavigation.state().indices.map(index=>page.ctl.pages[index].level);
assert(core.includes('cp_Conductor_follower_touch'));assert(core.includes('cp_Conductor_motif_play'));
assert(!core.includes('cp_Conductor_motif_load'),'motif loading remains in Conductor settings');
assert(!core.includes('cp_bass_library')&&!core.includes('cp_comp_library')&&!core.includes('cp_setup'));
assert(!page.ctl.pages.some(entry=>/^cp_(Comp|Melody)_motif_load/.test(entry.level)),'Chord Play fill is conductor-only');
const commands=[],oldSet=globalThis.host_module_set_param_blocking;
globalThis.host_module_set_param_blocking=(key,value)=>{commands.push([key,value]);return oldSet?.(key,value);};
assert(port.setParam('midi_fx1:cp_play_mode','Queued'));
const find=key=>{const index=page.ctl.pages.findIndex(entry=>entry.keys?.includes(key));assert(index>=0,key);page.goToPage(index);};
find('cp_slot_0');chord.chordMidi([144,0,100]);chord.chordMidi([128,0,0]);
assert(commands.some(([key,value])=>key==='chord_queue'&&value.startsWith('0,')));
assert(!commands.some(([key,value])=>key==='chord_select'&&value!=='off'));
assert.equal(chord.chordSnapshot().playMode,1);
const saved=chord.chordSnapshot();chord.restoreChord(saved);assert.equal(chord.chordSnapshot().playMode,1);
chord.setChordEnabled(true);assert(port.setParam('midi_fx1:cp_play_mode','Immediate'));
assert(commands.some(([key,value])=>key==='chord_queue'&&value==='off'));

// Off clears a stopped queue visibly; playback keeps Queued armed and hands back to the clip.
port.setParam('midi_fx1:cp_play_mode','Queued');seqState.playing=true;chord.harmonyOff();assert.equal(chord.chordSnapshot().playMode,1);
seqState.playing=false;chord.harmonyOff();assert.equal(chord.chordSnapshot().playMode,0);assert.equal(port.getParam('midi_fx1:cp_queue_count'),'Off');
port.setParam('midi_fx1:cp_play_mode','Queued');
conductorControls.setParam('midi_fx1:hb_chord_queue_status','cq1|1|-1|C|G7|1|1|3|0|0|2|C|G7');
const queuePage=chord.chordPage();queuePage.goToPage(0);
assert.match(chord.chordContextTrail(),/Hold 1\/3 \[C\] G7/);
conductorControls.setParam('midi_fx1:hb_chord_queue_status','cq1|2|4|C|C|1|0|2|1|0|2|C|C');
clock+=101;chord.tickChord();assert.equal(chord.chordContextTrail(),'Loop [C] C');
appState.dirty=false;conductorControls.setParam('midi_fx1:hb_chord_queue_status','cq1|2|4|C|C|1|0|2|1|1|2|C|C');
clock+=101;chord.tickChord();assert.equal(chord.chordContextTrail(),'Loop C [C]');assert(appState.dirty,'identical chord advances still repaint the cursor');
chord.harmonyOff();

// The shared motif loader gets an explicit conductor owner, while melody pads
// retain their track. Confirm through the real Chord Play MIDI dispatcher.
const conductor=portFor(0),read=conductor.getParam,oldGet=globalThis.host_module_get_param;
const actions=Array(52).fill('0');actions[51]='8000000000000040';
conductor.getParam=key=>key==='midi_fx1:motif_load_header'?'ml1,19,768,2,0,1,0':
 key.startsWith('midi_fx1:motif_load_event_')?(key.endsWith('_0')?'0,384,60.100:':'384,384,60.100:')+actions.join(','):
 key==='midi_fx1:motif_load_labels'?'V > T':key==='midi_fx1:motif_load_choice'?'V-Target':key==='midi_fx1:motif_load_target'?'60':read(key);
globalThis.host_module_get_param=key=>key==='motif_clip_info_0'?'0,abcdef,16,0,1,1':key==='motif_load_result'?'Written - Undo available':oldGet(key);
const fillPage=chord.chordPage();fillPage.goToPage(fillPage.ctl.pages.findIndex(entry=>entry.level==='cp_Conductor_motif_load'));
assert.equal(fillPage.keyAt(6),'cp_track_0_motif_load_write');assert(fillPage.ctl.metaAt(0).options.length===43);
chord.chordMidi([144,6,100]);chord.chordMidi([128,6,0]);
const before=commands.length;chord.renderChord();chord.renderChord();assert.equal(commands.length,before,'drawing the preview never writes');
chord.chordMidi([144,1,100]);chord.chordMidi([128,1,0]);seqCmdFlush();
assert(commands.some(([key,value])=>key==='cmd'&&value.includes('mload 0 0 abcdef 0 768')),'fill targets conductor, not active melody');
assert(!commands.some(([key,value])=>key==='cmd'&&value.includes('mload 3 ')));assert.equal(appState.activeTrack.index,3);
conductor.getParam=read;globalThis.host_module_get_param=oldGet;globalThis.host_module_set_param_blocking=oldSet;
console.log('Queued Chord Play: mode persistence, queue dispatch, performance-first pages and shared conductor-only fill with Undo pass');
