// Session browses without loading; only jog confirmation changes mode.
const buttons=await import('../dist/esm/seq/router-buttons.js');
const {seqHandleMidi}=await import('../dist/esm/seq/router.js');
const {CC_NOTE_SESSION}=await import('../dist/esm/seq/constants.js');
const {VIEW_KNOBS}=await import('../dist/esm/app/state.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
selectTrack(0);appState.currentView=VIEW_KNOBS;appState.shiftHeld=false;appState.focusGroup=0;
joint.setJointEnabled(false);setFlag('hbsteprow',0);seqState.sessionMode=true;
const cc=(key,value)=>seqHandleMidi([176,key,value],false);
const sessionTap=()=>{now+=450;cc(CC_NOTE_SESSION,127);cc(CC_NOTE_SESSION,0);};
const {melodicPadColorCache}=await import('../dist/esm/seq/led-cache.js');
for(const expected of [1,2,3,4,5,6,7,0]){
 const previous=buttons.sessionPlayMode(),beforeWrites=writes.length;
 let reads=0;const originals=[];
 for(let track=0;track<16;track++){const port=portFor(track),get=port.getParam;originals.push([port,get]);port.getParam=key=>{reads++;return get(key);};}
 sessionTap();assert(buttons.inputModeSelectorOpen());
 assert.equal(buttons.inputModeSelectorChoice(),previous);
 cc(14,127);cc(14,1);buttons.renderInputModeSelector();
 assert.equal(buttons.sessionPlayMode(),previous,'browsing never changes mode');
 assert.equal(writes.length,beforeWrites,'opening/browsing performs no host writes');
 assert.equal(reads,0,'opening/browsing/rendering performs no host reads');
 for(const [port,get] of originals)port.getParam=get;
 cc(51,127);cc(51,0);assert(!buttons.inputModeSelectorOpen());assert.equal(buttons.sessionPlayMode(),previous);
 sessionTap();const delta=expected-buttons.inputModeSelectorChoice();if(delta)cc(14,delta<0?128+delta:delta);
 melodicPadColorCache.fill(0);appState.initLedsDone=true;
 cc(MoveMainButton,127);cc(MoveMainButton,0);
 assert(!appState.initLedsDone);assert(melodicPadColorCache.every(color=>color===255),'each mode change invalidates even cached off pads');
 assert.equal(buttons.sessionPlayMode(),expected,'confirmation enters the selected mode directly');
 assert(!buttons.inputModeSelectorOpen());
 const unchanged=writes.length;sessionTap();cc(MoveMainButton,127);cc(MoveMainButton,0);
 assert.equal(writes.length,unchanged,'confirming the current mode does not reload it');
 sessionTap();sessionTap();assert(!buttons.inputModeSelectorOpen(),'Session again cancels');
 cc(CC_NOTE_SESSION,0);assert.equal(buttons.sessionPlayMode(),expected,'stray release is inert');
}
sessionTap();cc(14,127);assert.equal(buttons.inputModeSelectorChoice(),0,'list clamps at the first mode');
buttons.resetInputModeSelector();assert(!buttons.inputModeSelectorOpen());
sessionTap();cc(14,6);cc(MoveMainButton,127);cc(MoveMainButton,0);assert.equal(buttons.sessionPlayMode(),6);
buttons.seqHandleButtonCc(CC_NOTE_SESSION,127,true);buttons.seqHandleButtonCc(CC_NOTE_SESSION,0,false);
assert.equal(buttons.sessionPlayMode(),0,'Shift Session enters Clips directly');
assert(!buttons.inputModeSelectorOpen());
const {beginTrackSwitch,switchToTrack,restoreTrackState}=await import('../dist/esm/track/switch.js');
const clipSnapshot=beginTrackSwitch();switchToTrack(4,clipSnapshot);
assert.equal(buttons.sessionPlayMode(),6,'Clips reveals the same shared Chord Play mode on another track');
restoreTrackState(clipSnapshot);assert.equal(buttons.sessionPlayMode(),0,'track peek returns to Clips');
{
 const chordNavigation=await import('../dist/esm/seq/chord-play.js');
 const gridNavigation=await import('../dist/esm/seq/grid.js');
 const settingsNavigation=await import('../dist/esm/seq/hb-settings.js');
 for(const getPage of [chordNavigation.chordPage,gridNavigation.gridPage,settingsNavigation.settingsPage]){
  selectTrack(0);const first=getPage();assert(first.pageCount>2);first.goToPage(2);
  const title=first.ctl.page.name,keys=first.ctl.page.keys;
  selectTrack(4);const second=getPage();assert.equal(second.ctl.page.name,title);assert.deepEqual(second.ctl.page.keys,keys);
  second.goToPage(1);const nextTitle=second.ctl.page.name;
  selectTrack(0);assert.equal(getPage().ctl.page.name,nextTitle,'returning tracks follows the current shared panel');
 }
 appState.focusGroup=0;const first=panels.jointPage();first.goToPage(2);const title=first.ctl.page.name;
 appState.focusGroup=1;assert.equal(panels.jointPage().ctl.page.name,title,'Joint quartet changes follow the shared panel');
 appState.focusGroup=0;panels.jointPage().goToPage(0);
}
buttons.seqHandleButtonCc(CC_NOTE_SESSION,127,true);buttons.seqHandleButtonCc(CC_NOTE_SESSION,0,false);
console.log('Session selector: zero browse reads/writes, direct destinations, shared mode across Clips/track changes, cancel, same-mode no reload and direct Clips shortcut pass');

// Double tap is edge-based: single tap is immediate, held/repeated downs do not count.
const enterChordForTap=()=>{buttons.resetInputModeSelector();sessionTap();const delta=6-buttons.inputModeSelectorChoice();if(delta)cc(14,delta<0?128+delta:delta);cc(MoveMainButton,127);cc(MoveMainButton,0);};
enterChordForTap();sessionTap();assert(buttons.inputModeSelectorOpen());assert.equal(buttons.sessionPlayMode(),6);
now+=350;cc(CC_NOTE_SESSION,127);cc(CC_NOTE_SESSION,0);assert.equal(buttons.sessionPlayMode(),0,'quick double tap enters Clips');assert(!buttons.inputModeSelectorOpen());
enterChordForTap();cc(CC_NOTE_SESSION,127);now+=100;cc(CC_NOTE_SESSION,127);assert.equal(buttons.sessionPlayMode(),6,'repeated down is not a second tap');
now+=400;cc(CC_NOTE_SESSION,0);now+=100;cc(CC_NOTE_SESSION,127);cc(CC_NOTE_SESSION,0);assert.equal(buttons.sessionPlayMode(),6,'long hold cannot arm a double tap');
enterChordForTap();sessionTap();now+=351;cc(CC_NOTE_SESSION,127);cc(CC_NOTE_SESSION,0);assert.equal(buttons.sessionPlayMode(),6,'slow second tap cancels the selector');
enterChordForTap();sessionTap();now+=100;cc(14,1);cc(CC_NOTE_SESSION,127);cc(CC_NOTE_SESSION,0);assert.equal(buttons.sessionPlayMode(),6,'browsing cancels double-tap eligibility');
buttons.resetInputModeSelector();
console.log('Session double tap: immediate single tap, Clips shortcut, hold/repeat guards and browse cancellation pass');

// Back unwinds modes; selecting a track from Clips establishes Clips as the return view.
const chooseMode=mode=>{sessionTap();const delta=mode-buttons.inputModeSelectorChoice();if(delta)cc(14,delta<0?128+delta:delta);cc(MoveMainButton,127);cc(MoveMainButton,0);};
buttons.seqHandleButtonCc(CC_NOTE_SESSION,127,true);buttons.seqHandleButtonCc(CC_NOTE_SESSION,0,false);
chooseMode(6);chooseMode(7);assert(buttons.returnPreviousInputView());assert.equal(buttons.sessionPlayMode(),6);
assert(buttons.returnPreviousInputView());assert.equal(buttons.sessionPlayMode(),0);
const fromClips=beginTrackSwitch();switchToTrack(4,fromClips);assert.equal(buttons.sessionPlayMode(),6);
assert(buttons.returnPreviousInputView());assert.equal(buttons.sessionPlayMode(),0,'track opened from Clips returns to Clips');
console.log('Back history: settings to previous mode and track view to Clips pass');
