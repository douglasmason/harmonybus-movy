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
page.goToPage(0);assert.equal(page.keyAt(0),'cp_play_mode');
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
