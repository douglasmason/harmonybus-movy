// Boot the production router with the existing instrument/engine fixture.
import './hb-chord-pad-feedback.mjs';
import assert from 'node:assert/strict';
const {appState,VIEW_KNOBS,VIEW_MAIN_PARAMS}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {CC_MUTE}=await import('../dist/esm/seq/constants.js');
const buttons=await import('../dist/esm/seq/router-buttons.js');
const chord=await import('../dist/esm/seq/chord-play.js');
const {keyboardState}=await import('../dist/esm/keyboard/state.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {isSoloed,resetTrackMutes}=await import('../dist/esm/mixer/track-mutes.js');
const {closeParamPage,paramPageActive}=await import('../dist/esm/seq/param-page.js');
const {openLeaveModal,closeLeaveModal}=await import('../dist/esm/app/leave-modal.js');
const {resetHeldInput}=await import('../dist/esm/app/input-reset.js');
const midi=globalThis.onMidiMessageInternal;
let now=2000000;Date.now=()=>now;
const cc=(key,value)=>midi([176,key,value]);
const click=key=>{cc(key,127);cc(key,0);};
const tapSession=()=>{now+=450;click(50);};
const doubleSession=()=>{tapSession();now+=100;click(50);};
const setup=()=>{
 if(paramPageActive())closeParamPage();
 buttons.resetInputModeSelector();resetTrackMutes();
 seqState.sessionMode=false;appState.currentView=VIEW_KNOBS;appState.focusGroup=0;
 selectTrack(3);chord.setChordEnabled(true);
 now+=1000;
};
setup();
cc(50,127);assert(appState.shiftHeld);assert(!buttons.inputModeSelectorOpen(),'press leaves the current panel in place');
cc(50,0);assert(!appState.shiftHeld);assert(buttons.inputModeSelectorOpen(),'clean release opens the chooser');
click(51);

// The shared controller receives the same shifted jog click, not a chooser click.
const page=chord.chordPage();
const start=page.pageIndex;
cc(MoveShift,127);click(MoveMainButton);cc(MoveShift,0);
const expectedPicker=page.ctl.pickerOpen;
assert(expectedPicker,'physical Shift+jog click opens the picker');
click(51);page.goToPage(start);
cc(50,127);midi([144,9,127]);click(MoveMainButton);midi([128,9,0]);cc(50,0);
assert.equal(page.ctl.pickerOpen,expectedPicker,'Session+jog click opens the same picker');
assert(!buttons.inputModeSelectorOpen());click(51);
page.goToPage(0);cc(MoveShift,127);cc(14,1);cc(MoveShift,0);const shiftedPage=page.pageIndex;
page.goToPage(0);cc(50,127);cc(14,1);cc(50,0);
assert.equal(page.pageIndex,shiftedPage,'Session+jog turn follows the physical Shift turn');
assert(!buttons.inputModeSelectorOpen());

// Octave buttons use the same existing action, even when Session releases first.
keyboardState.layout=0;const octave=keyboardState.octave[3];
cc(MoveShift,127);click(55);cc(MoveShift,0);const shiftedLayout=keyboardState.layout,shiftedOctave=keyboardState.octave[3];
keyboardState.layout=0;keyboardState.octave[3]=octave;
cc(50,127);cc(55,127);cc(50,0);cc(55,0);
assert.equal(keyboardState.layout,shiftedLayout);assert.equal(keyboardState.octave[3],shiftedOctave);
assert(!buttons.inputModeSelectorOpen());assert(!appState.shiftHeld);

// Track buttons retain their existing selection and solo behavior.
setup();cc(50,127);click(42);cc(50,0);
assert.equal(appState.activeTrack.index,1);assert(!buttons.inputModeSelectorOpen());
setup();cc(50,127);cc(42,127);now+=500;cc(50,0);cc(42,0);
assert.equal(appState.activeTrack.index,3,'a held track peek still returns after Session releases');
setup();seqState.sessionMode=true;cc(50,127);cc(CC_MUTE,127);click(42);cc(50,0);cc(CC_MUTE,0);
assert(isSoloed(1),'Session+Mute+track solos the requested track');
assert.equal(appState.activeTrack.index,3);assert(!buttons.inputModeSelectorOpen());

// Both Shift sources survive either release order; the explicit Clips shortcut remains.
setup();cc(50,127);cc(MoveShift,127);cc(50,0);assert(appState.shiftHeld);cc(MoveShift,0);assert(!appState.shiftHeld);
cc(MoveShift,127);cc(50,127);assert(seqState.sessionMode);cc(MoveShift,0);assert(appState.shiftHeld);cc(50,0);assert(!appState.shiftHeld);
assert(!buttons.inputModeSelectorOpen());

// A second press can become a modifier instead of completing a double tap.
setup();tapSession();now+=100;cc(50,127);cc(14,1);cc(50,0);
assert.equal(buttons.sessionPlayMode(),6);assert(!buttons.inputModeSelectorOpen());
// Touch activity, repeats, long holds and ordinary intervening gestures are not double taps.
setup();cc(50,127);cc(50,127);now+=400;cc(50,0);assert(!buttons.inputModeSelectorOpen());
cc(50,127);midi([144,9,127]);midi([144,9,0]);cc(50,0);assert(!buttons.inputModeSelectorOpen());
tapSession();click(55);now+=100;click(50);assert.equal(buttons.sessionPlayMode(),6);

// Releases and reset still clear the modifier while an overlay owns the input.
setup();cc(50,127);openLeaveModal();cc(50,0);assert(!appState.shiftHeld);closeLeaveModal();
setup();cc(50,127);resetHeldInput(false);cc(50,0);assert(!appState.shiftHeld);assert(!buttons.inputModeSelectorOpen());

// The selected Chord panel and global parameter view survive a Clips round trip.
setup();const before=chord.chordPage();before.goToPage(2);const title=before.ctl.page.name;
doubleSession();assert(seqState.sessionMode);doubleSession();assert.equal(buttons.sessionPlayMode(),6);
assert.equal(chord.chordPage().ctl.page.name,title);
cc(50,127);midi([144,24,127]);midi([128,24,0]);cc(50,0);
assert.equal(appState.currentView,VIEW_MAIN_PARAMS,'Session provides shifted step shortcuts too');
doubleSession();doubleSession();assert.equal(appState.currentView,VIEW_MAIN_PARAMS);
click(51);assert.equal(buttons.sessionPlayMode(),6);
console.log('Session modifier: production jog, track, octave, step, release order, overlays, reset and panel return pass');
