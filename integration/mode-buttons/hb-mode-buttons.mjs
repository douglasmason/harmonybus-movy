import './hb-chord-play.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const buttons=await import('../dist/esm/seq/mode-buttons.js');
const router=await import('../dist/esm/seq/router-buttons.js');
const {seqHandleMidi}=await import('../dist/esm/seq/router.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const scale=await import('../dist/esm/seq/scale-finding.js');
const {WHITE_DIM,WHITE_BRIGHT,WHITE_OFF}=await import('../dist/esm/seq/colors.js');
const grid=await import('../dist/esm/seq/grid.js');
const {loopHeld}=await import('../dist/esm/seq/loop-mode.js');
selectTrack(3);
seqState.sessionMode=false;
scale.setScaleFindingEnabled(false);
chord.restoreChord(null);
chord.setChordEnabled(true);
assert.equal(router.sessionPlayMode(),6);
const conductor=portFor(0),page=chord.chordPanelPort(3);
page.getParam('midi_fx1:chain_params'); // initialize real panel metadata before virtual parameter edits
assert(page.setParam('midi_fx1:cp_play_mode','Queued'));
assert(chord.chordQueuedMode(),'queued mode is owned by the Chord Play controller');
conductor.setParam('midi_fx1:chord_queue_end','Loop');
conductor.setParam('midi_fx1:hb_chord_queue_status','cq1|2|4|C|G7|1|0|2|1|0|2|C|G7');
conductor.setParam('midi_fx1:hb_chord_queue_override','On');
const before=chord.chordSnapshot();
chord.tickChord();
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_LOOP,WHITE_DIM),WHITE_BRIGHT,
    'Loop lit indicates repeating rather than holding the final chord');
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_SAMPLE,WHITE_BRIGHT),WHITE_DIM,
    'Sample dim indicates Queued entry');
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_CLEAR,0),WHITE_DIM);
const queueBeforeMode=conductor.getParam('midi_fx1:hb_chord_queue_status');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,127,false),true);
assert(!chord.chordQueuedMode(),'Sample switches to Immediate');
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_SAMPLE,WHITE_DIM),WHITE_BRIGHT,
    'Immediate lights the Sample button');
assert.equal(conductor.getParam('midi_fx1:hb_chord_queue_status'),queueBeforeMode,
    'entry changes do not delete the existing native queue');
assert.equal(conductor.getParam('midi_fx1:chord_queue_end'),'Loop');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,0,false),true,
    'Sample release never opens the stock sampler in Chord Play');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,127,false),true);
assert(chord.chordQueuedMode(),'Sample returns to queued entry');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,0,false),true);
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_SAMPLE,WHITE_BRIGHT),WHITE_DIM);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,127,false),true);
assert.equal(conductor.getParam('midi_fx1:chord_queue_end'),'Hold',
    'Loop toggles only the queue-end policy');
assert(!chord.chordLoopSelected());
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_LOOP,WHITE_BRIGHT),WHITE_DIM);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,0,false),true);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,127,false),true);
assert.equal(conductor.getParam('midi_fx1:chord_queue_end'),'Loop');
assert(chord.chordLoopSelected());
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,0,false),true);
assert.equal(chord.chordSnapshot().selected,before.selected,'Loop never selects a chord');
assert.equal(conductor.getParam('midi_fx1:hb_chord_queue_status'),queueBeforeMode);
const loopAction=buttons.modeActionDescriptors().find(action=>action.cc===buttons.CC_MODE_LOOP);
assert.equal(loopAction?.label,'Queue end: Loop');
assert.equal(loopAction?.active,true);
const sampleAction=buttons.modeActionDescriptors().find(action=>action.cc===buttons.CC_MODE_SAMPLE);
assert.equal(sampleAction?.label,'Chord entry: Queued');
assert.equal(sampleAction?.active,false);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,127,true),true,
    'Shift+Loop retriggers the stored chord cycle without erasing it');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,0,false),true);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,127,false),true,'X is owned');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,0,false),true,'X release is owned');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_COPY,127,false),false,
    'plain Copy remains reserved for real abstract clip copying');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,127,false),true,
    'Chord Play owns Sample entry mode rather than the stock sampler');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,0,false),true);
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_MUTE,WHITE_OFF),WHITE_DIM,
    'an active queue keeps Mute dim');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_MUTE,127,false),true);
assert(chord.chordMuteSelected(),'Mute bypasses but retains saved progression');
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_MUTE,WHITE_DIM),WHITE_BRIGHT,
    'Mute is full brightness only when the stored queue is bypassed');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_MUTE,0,false),true);
const muteAction=buttons.modeActionDescriptors().find(action=>action.cc===buttons.CC_MODE_MUTE);
assert.equal(muteAction?.label,'Queue active');
assert.equal(muteAction?.active,true,'Remote UI active state means actually muted');
conductor.setParam('midi_fx1:hb_chord_queue_override','Off');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_MUTE,127,false),true);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_MUTE,0,false),true);
assert(!chord.chordMuteSelected(),'Unmute restores same stored queue');
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_MUTE,WHITE_DIM),WHITE_DIM);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,127,true),false,
    'Shift+X passes through to the original modifier behavior');
assert.equal(buttons.modeButtonMidi(52,127,false),false,'Capture is never stolen');
assert.equal(buttons.modeButtonMidi(56,127,false),false,'Undo is never stolen');
assert.equal(buttons.modeButtonMidi(85,127,false),false,'Play is never stolen');
assert.equal(buttons.modeButtonMidi(86,127,false),false,'Record is never stolen');
assert(buttons.showModeHelp(6,true,1000));
const first=buttons.modeHelpSnapshot(1005);
assert.equal(first.mode,6);
assert.equal(first.visible,true);
assert(first.lines.some(line=>line.includes('X: cancel chord queue')));
assert(first.lines.some(line=>line.includes('Mute: queue active')));
assert.equal(buttons.showModeHelp(6,false,1005),false,
    'first entry guide is not repeatedly forced');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_COPY,127,true),true,
    'Shift+Copy reopens mode guide without starting the clipboard');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_COPY,0,false),true,
    'Shift+Copy release is consumed even if Shift was released early');
buttons.dismissModeHelp();
assert.equal(buttons.modeHelpSnapshot().visible,false);
assert(buttons.showModeHelp(6,true,1000));
buttons.tickModeHelp(4000);
assert.equal(buttons.modeHelpSnapshot(4001).visible,false,'expiry clears overlay');
chord.setChordEnabled(false);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,127,false),false,
    'outside Chord Play, Sample keeps its stock behavior');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,127,false),false);
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_LOOP,44),WHITE_OFF,
    'plain Loop no longer unexpectedly enters the bar editor');
buttons.modeButtonMidi(buttons.CC_MODE_LOOP,127,false);
buttons.modeButtonMidi(buttons.CC_MODE_LOOP,0,false);
assert(!seqState.loopMode,'normal Loop press cannot change input mode');
scale.setScaleFindingEnabled(true);
assert.equal(router.sessionPlayMode(),8);
assert(buttons.showModeHelp(8,true,1000));
assert(buttons.modeHelpSnapshot(1001).lines.some(line=>line.includes('tonic')));
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_CLEAR,44),WHITE_OFF,
    'Scale Finding X is dark before a preview exists');
scale.selectScaleFindingPad(28); // G Mixolydian, from the existing Inline layout
assert(scale.scaleFindingCanApply());
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_COPY,WHITE_OFF),WHITE_BRIGHT);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_COPY,127,false),true);
assert.equal(conductor.getParam('midi_fx1:key_center_tonic'),'G');
assert.equal(conductor.getParam('midi_fx1:key_center_explicit_scale'),'Mixolydian');
assert.equal(conductor.getParam('midi_fx1:key_center_apply'),'Apply');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_COPY,0,false),true);
const appliedScale=conductor.getParam('midi_fx1:key_center_explicit_scale');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,127,false),true);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,0,false),true);
assert.equal(scale.scaleFindingSnapshot().selectedPad,-1);
assert.equal(conductor.getParam('midi_fx1:key_center_explicit_scale'),appliedScale,
    'X clears only the transient Scale Finding preview, not the committed parent key');
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_COPY,WHITE_DIM),WHITE_DIM,
    'Copy cannot apply without a selected candidate');
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_SAMPLE,WHITE_DIM),WHITE_OFF,
    'Sample LED is off without an available microphone provider');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,127,false),true,
    'Scale Finding consumes Sample even when microphone is unavailable');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,0,false),true,
    'Sampling release remains captured and cannot open the stock sampler');
assert.equal(scale.scaleMicrophoneListening(),false);
scale.setScaleMicrophoneAvailable(true);
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_SAMPLE,WHITE_OFF),WHITE_DIM,
    'available but idle Sample LED is dim');
const clockNow=Date.now;
try {
 Date.now=()=>1000;
 assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,127,false),true);
 assert(scale.scaleMicrophoneListening(),'press starts listening immediately');
 assert.equal(buttons.modeButtonColor(buttons.CC_MODE_SAMPLE,WHITE_OFF),WHITE_BRIGHT);
 Date.now=()=>1100;
 assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,0,false),true);
 assert(scale.scaleMicrophoneListening(),'short tap latches listening on');
 assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,127,false),true);
 assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,0,false),true);
 assert(scale.scaleMicrophoneListening(),'reserved Loop cannot toggle listening');
 Date.now=()=>1200;
 assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,127,false),true);
 Date.now=()=>1300;
 assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,0,false),true);
 assert(!scale.scaleMicrophoneListening(),'short tap toggles latched listening off');
 Date.now=()=>2000;
 assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,127,false),true);
 assert(scale.scaleMicrophoneListening(),'held Sample starts listening immediately');
 Date.now=()=>2500;
 assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,0,false),true);
 assert(!scale.scaleMicrophoneListening(),'long hold is momentary on release');
} finally { Date.now=clockNow; }
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_LOOP,WHITE_BRIGHT),WHITE_OFF,
    'Loop remains reserved and dark in Scale Finding');
const scaleActions=buttons.modeActionDescriptors();
assert.equal(scaleActions.find(action=>action.cc===buttons.CC_MODE_SAMPLE)?.label,'Listen: tap / hold');
assert.equal(scaleActions.find(action=>action.cc===buttons.CC_MODE_LOOP)?.available,false);
scale.setScaleFindingEnabled(false);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,127,false),false,
    'Sample returns to stock handling outside Scale Finding');

grid.restoreGrid(null);grid.setGridEnabled(true);
assert.equal(router.sessionPlayMode(),4);
grid.gridViews.move.follow=true;
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_LOOP,WHITE_DIM),WHITE_BRIGHT);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,127,false),true);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,0,false),true);
assert.equal(grid.gridViews.move.follow,false,'Grid Loop holds the page');
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_LOOP,WHITE_BRIGHT),WHITE_DIM);
buttons.modeButtonMidi(buttons.CC_MODE_LOOP,127,false);
buttons.modeButtonMidi(buttons.CC_MODE_LOOP,0,false);
assert.equal(grid.gridViews.move.follow,true,'Grid Loop resumes following');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,127,false),true);
assert(grid.gridEraseActive(),'X held enters guarded erase-only Grid editing');
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_CLEAR,WHITE_DIM),WHITE_BRIGHT);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,0,false),true);
assert(!grid.gridEraseActive(),'X release leaves erasure and cannot delete a clip');
grid.setGridEnabled(false);

seqState.loopMode=false;seqState.sessionMode=false;
assert.equal(router.sessionPlayMode(),1);
seqHandleMidi([176,50,127],false);seqHandleMidi([176,50,0],false);
assert(router.inputModeSelectorOpen(),'Session opens input-mode chooser');
seqHandleMidi([176,14,8],false); // Normal Play index 1 -> Loop Edit index 9
assert.equal(router.inputModeSelectorChoice(),9);
seqHandleMidi([176,3,127],false);seqHandleMidi([176,3,0],false);
assert(!router.inputModeSelectorOpen());
assert.equal(router.sessionPlayMode(),9);
assert(seqState.loopMode,'Loop Edit reuses the original bar-step painter');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,127,false),true);
assert(loopHeld(),'Loop+wheel resize remains available inside Loop Edit');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,0,false),true);
assert(!loopHeld());
assert(seqState.loopMode,'Loop release no longer silently exits selected Loop Edit');
assert.equal(buttons.modeButtonMidi(51,127,false),true,'Back leaves Loop Edit');
assert.equal(buttons.modeButtonMidi(51,0,false),true);
assert.equal(router.sessionPlayMode(),1);
assert(!seqState.loopMode);
buttons.resetModeHelp();
assert(!buttons.modeHelpSnapshot().visible);
console.log('Mode buttons: Chord Loop/X, Scale Finding Apply/Clear, Grid Follow/Erase, Loop Edit Session transitions and global pass-through pass');

const {setFlag}=await import('../dist/esm/seq/flags.js');
setFlag('hbsteprow',2);
assert.equal(router.sessionPlayMode(),2,'Motif Play owns its own action strip');
const motifActions=buttons.modeActionDescriptors();
assert.equal(motifActions.find(action=>action.cc===60)?.label,'Copy motif');
assert.equal(motifActions.find(action=>action.cc===58)?.available,false,
    'no false promise of motif repetition without a real repeat owner');
assert.equal(buttons.modeButtonMidi(60,127,false),true,'Motif Copy cannot silently duplicate a clip');
assert.equal(buttons.modeButtonMidi(60,0,false),true,'Motif Copy release never edits a clip');

setFlag('hbsteprow',0);
scale.setScaleFindingEnabled(true);
const finding=buttons.modeActionDescriptors();
assert.equal(finding.find(action=>action.cc===119)?.label,'Clear preview');
assert.equal(finding.find(action=>action.cc===60)?.label,'Apply key');
assert.equal(finding.find(action=>action.cc===118)?.label,'Listen: tap / hold');
assert.match(finding.find(action=>action.cc===118)?.detail??'',/pitch-class data collection/);
assert.equal(finding.find(action=>action.cc===118)?.available,false,
    'on-device microphones cannot be advertised without an input provider');
assert.equal(finding.find(action=>action.cc===58)?.available,false,
    'Loop is explicitly reserved rather than pretending to start listening');
scale.setScaleFindingEnabled(false);
grid.setGridEnabled(true);
const gridActions=buttons.modeActionDescriptors();
assert.equal(gridActions.find(action=>action.cc===58)?.label,'Follow grid');
assert.equal(gridActions.find(action=>action.cc===119)?.gesture,'hold+pad');
grid.setGridEnabled(false);
buttons.resetModeHelp();
console.log('Mode action descriptors: Motif/Scale/Grid labels, physically available gestures and unimplemented actions remain truthful');
