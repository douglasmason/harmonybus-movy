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
const startPage=page.pageIndex;chord.chordMidi([176,14,1]);assert.notEqual(page.pageIndex,startPage);chord.chordMidi([176,14,127]);assert.equal(page.pageIndex,startPage);
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
assert(!commands.some(([key,value])=>key==='chord_select'&&value!=='off'&&value!=='leave'));
assert.equal(chord.chordSnapshot().playMode,1);
const saved=chord.chordSnapshot();chord.restoreChord(saved);assert.equal(chord.chordSnapshot().playMode,1);
chord.setChordEnabled(true);assert(port.setParam('midi_fx1:cp_play_mode','Immediate'));
assert(commands.some(([key,value])=>key==='chord_queue'&&value==='off'));

// Off clears the current harmony/queue without changing the selection mode.
port.setParam('midi_fx1:cp_play_mode','Queued');seqState.playing=true;chord.harmonyOff();assert.equal(chord.chordSnapshot().playMode,1);
seqState.playing=false;chord.harmonyOff();assert.equal(chord.chordSnapshot().playMode,1);assert.equal(port.getParam('midi_fx1:cp_play_mode'),'Queued');
const offSurface=chord.chordPage();offSurface.goToPage(offSurface.ctl.pages.findIndex(entry=>entry.keys?.includes('cp_slot_0')));
for(const playing of [false,true])for(const control of [7,23,31]){
 seqState.playing=playing;commands.length=0;clock+=500;
 chord.chordMidi([144,control,100]);chord.chordMidi([128,control,0]);
 assert.equal(chord.chordSnapshot().playMode,1,'every Off gesture preserves Queued');
 assert(commands.some(([key,value])=>key==='chord_select'&&value==='off'),'Off still clears harmony');
 commands.length=0;clock+=500;chord.chordMidi([144,0,100]);chord.chordMidi([128,0,0]);
 assert(commands.some(([key,value])=>key==='chord_queue'&&value.startsWith('0,')),'next chord still queues');
 assert(!commands.some(([key,value])=>key==='chord_select'&&value!=='off'),'next chord never changes to immediate');
}
seqState.playing=false;
port.setParam('midi_fx1:cp_play_mode','Queued');
conductorControls.setParam('midi_fx1:hb_chord_queue_status','cq1|1|-1|C|G7|1|1|3|0|0|2|C|G7');
const queuePage=chord.chordPage();queuePage.goToPage(0);
assert.match(chord.chordContextTrail(),/Hold 1\/3 \[C\] G7/);
conductorControls.setParam('midi_fx1:hb_chord_queue_status','cq1|2|4|C|C|1|0|2|1|0|2|C|C');
clock+=101;chord.tickChord();assert.equal(chord.chordContextTrail(),'Loop 1/2 [C] C');
appState.dirty=false;conductorControls.setParam('midi_fx1:hb_chord_queue_status','cq1|2|4|C|C|1|0|2|1|1|2|C|C');
clock+=101;chord.tickChord();assert.equal(chord.chordContextTrail(),'Loop 2/2 C [C]');assert(appState.dirty,'identical chord advances still repaint the cursor');
// The first chord is previewed while stopped; it remains one of four loop entries.
conductorControls.setParam('midi_fx1:hb_chord_queue_status','cq1|3|-1|C|G|1|0|4|1|0|4|C|G|F|D');
clock+=101;chord.tickChord();assert.equal(port.getParam('midi_fx1:cp_queue_count'),'Loop 1/4');
assert.equal(chord.chordContextTrail(),'Loop 1/4 [C] G F D');
const {seqToastText,seqToastTick}=await import('../dist/esm/seq/render.js');
for(let tick=0;tick<1000;tick++)seqToastTick();
chord.selectChordSlot(0);assert.equal(seqToastText(),'','enqueue does not publish a stale count toast');
// Generic performance feedback must not overwrite the queue even if enabled.
const {setFlag}=await import('../dist/esm/seq/flags.js');
const {drawHbPerformanceMode}=await import('../dist/esm/renderer/hb-performance.js');
const oldFill=globalThis.fill_rect,fills=[];setFlag('hbsteprow',1);
globalThis.fill_rect=(...args)=>fills.push(args);drawHbPerformanceMode();
globalThis.fill_rect=oldFill;assert.equal(fills.length,0,'Chord Play owns its footer');
chord.harmonyOff();

// Native conductor queue owns its musical lifetime, not Chord Play UI focus.
selectTrack(3);seqState.sessionMode=false;chord.setChordEnabled(true);
conductorControls.setParam('midi_fx1:hb_chord_queue_status','cq1|2|4|C|G|1|0|2|1|0|2|C|G');
commands.length=0;
chord.setChordEnabled(false);
assert(!commands.some(([key,value])=>key==='chord_select'&&value==='off'),'hiding Chord Play cannot cancel queued harmony');
assert(!commands.some(([key,value])=>key==='chord_route'&&value==='off'),'queued accompaniment survives mode exit');
chord.setChordEnabled(true);
assert(!commands.some(([key,value])=>key==='chord_select'&&value==='off'),'reentering Chord Play is not Harmony Off');
selectTrack(4);clock+=200;chord.tickChord();
assert(chord.chordActive(),'another melody track may control the same conductor');
assert(!commands.some(([key,value])=>key==='chord_select'&&value==='off'),'melody focus never clears native queue');
selectTrack(0);clock+=200;chord.tickChord();
assert(!chord.chordActive(),'conductor-focus note-view conflict exits controller only');
assert(!commands.some(([key,value])=>key==='chord_select'&&value==='off'),'conductor focus still cannot clear native queue');
selectTrack(3);chord.setChordEnabled(true);
assert(!commands.some(([key,value])=>key==='chord_select'&&value==='off'),'returning to previous Chord Play preserves the cycle');
commands.length=0;
chord.setJointChordConductor(0);
chord.setJointChordConductor(null);
assert(!commands.some(([key,value])=>key==='chord_select'&&value==='off'),
    'switching Joint conductor knobs on the same owner preserves the queue');
assert(commands.some(([key,value])=>key==='chord_joint'&&value==='0'),
    'Joint knob surface still identifies the conductor');
// Exercise the real Session picker, including the newer Loop Edit owner.
const router=await import('../dist/esm/seq/router-buttons.js');
const {seqHandleMidi}=await import('../dist/esm/seq/router.js');
const buttons=await import('../dist/esm/seq/mode-buttons.js');
const chooseMode=mode=>{
 clock+=500;
 seqHandleMidi([176,50,127],false);seqHandleMidi([176,50,0],false);
 assert(router.inputModeSelectorOpen());
 const delta=mode-router.inputModeSelectorChoice();
 if(delta)seqHandleMidi([176,14,delta>0?delta:128+delta],false);
 seqHandleMidi([176,3,127],false);seqHandleMidi([176,3,0],false);
 assert.equal(router.sessionPlayMode(),mode);
};
const originalBankRead=conductorControls.getParam;
const queuedBank='cb1|2741|0,145,2741,1,0,0|'+Array.from({length:21},()=> '0,145,2741,1,0,0,1,0,C,1').join('|');
conductorControls.getParam=key=>key==='midi_fx1:hb_chord_bank_snapshot'?queuedBank:originalBankRead(key);
for(const playing of [false,true])for(const mode of [0,1,3,4,5,7,8,9]){
 seqState.playing=playing;commands.length=0;
 chooseMode(mode);chooseMode(6);clock+=300;chord.tickChord();
 assert(!commands.some(([key,value])=>['chord_select','chord_queue','chord_route'].includes(key)&&value==='off'),
     `mode ${mode} roundtrip cannot clear the ${playing?'playing':'paused'} queue`);
 assert.equal(chord.chordContextTrail(),'Loop 1/2 [C] G');
 assert(chord.chordSlotQueued(0),'returning to Chord Play restores queued LED membership');
 assert.equal(appState.activeTrack.index,3,'mode roundtrip keeps melody focus');
}
conductorControls.getParam=originalBankRead;
seqState.playing=false;commands.length=0;
assert(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,127,false));
assert(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,0,false));
assert(commands.some(([key,value])=>key==='chord_select'&&value==='off'),'X still explicitly clears the retained queue');
commands.length=0;chord.harmonyOff();
assert(commands.some(([key,value])=>key==='chord_select'&&value==='off'),'K8 Off remains the explicit cancel action');
conductorControls.setParam('midi_fx1:hb_chord_queue_status','--');
// An ordinary immediate audition still ends when its input mode closes.
port.setParam('midi_fx1:cp_play_mode','Immediate');chord.selectChordSlot(0);
commands.length=0;chord.setChordEnabled(false);
assert(commands.some(([key,value])=>key==='chord_select'&&value==='leave'));
chord.setChordEnabled(true);port.setParam('midi_fx1:cp_play_mode','Queued');

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
