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
const {WHITE_DIM,WHITE_BRIGHT}=await import('../dist/esm/seq/colors.js');
selectTrack(3);
seqState.sessionMode=false;
scale.setScaleFindingEnabled(false);
chord.restoreChord(null);
chord.setChordEnabled(true);
assert.equal(router.sessionPlayMode(),6);
const conductor=portFor(0),page=chord.chordPanelPort(3);
assert(page.setParam('midi_fx1:cp_play_mode','Queued'));
conductor.setParam('midi_fx1:chord_queue_end','Hold');
const before=chord.chordSnapshot();
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_LOOP,WHITE_BRIGHT),WHITE_DIM,
    'queued Hold is dim even if generic bar Loop would be bright');
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_CLEAR,0),WHITE_DIM,
    'X is available in Chord Play');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,127,false),true);
assert.equal(conductor.getParam('midi_fx1:chord_queue_end'),'Loop',
    'Loop press edits native conductor queue end, not the clip bar overlay');
assert(chord.chordLoopSelected());
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_LOOP,WHITE_DIM),WHITE_BRIGHT);
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,0,false),true,
    'Loop release is swallowed');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_LOOP,127,false),true);
assert.equal(conductor.getParam('midi_fx1:chord_queue_end'),'Hold');
assert(!chord.chordLoopSelected());
assert.equal(chord.chordSnapshot().selected,before.selected,'Loop does not select a chord');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,127,false),true,'X is owned');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,0,false),true,'X release is owned');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_COPY,127,false),false,
    'plain Copy keeps its stock duplicate behavior until atomic queue export exists');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_SAMPLE,127,false),false,
    'Sampling keeps its original meaning outside a finished microphone route');
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_MUTE,127,false),false,
    'Mute retains track mute until an isolated accompaniment-bypass owner exists');
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
assert(first.lines.some(line=>line.includes('X: harmony Off')));
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
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,127,false),false);
assert.equal(buttons.modeButtonColor(buttons.CC_MODE_LOOP,44),44,
    'normal mode restores original LED color owner');
scale.setScaleFindingEnabled(true);
assert.equal(router.sessionPlayMode(),8);
assert(buttons.showModeHelp(8,true,1000));
assert(buttons.modeHelpSnapshot(1001).lines.some(line=>line.includes('tonic')));
assert.equal(buttons.modeButtonMidi(buttons.CC_MODE_CLEAR,127,false),false,
    'Scale Finding Delete stays stock until piano-note latch has its own owner');
buttons.resetModeHelp();
assert(!buttons.modeHelpSnapshot().visible);
console.log('Mode buttons: cached LED policy, Chord X and Loop, global pass-through, guide lifecycle and Scale Finding coverage pass');
