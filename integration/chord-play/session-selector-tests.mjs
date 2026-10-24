// Session browses without loading; only jog confirmation changes mode.
const buttons=await import('../dist/esm/seq/router-buttons.js');
const {seqHandleMidi}=await import('../dist/esm/seq/router.js');
const {CC_NOTE_SESSION}=await import('../dist/esm/seq/constants.js');
const {VIEW_KNOBS}=await import('../dist/esm/app/state.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
selectTrack(0);appState.currentView=VIEW_KNOBS;appState.shiftHeld=false;appState.focusGroup=0;
joint.setJointEnabled(false);setFlag('hbsteprow',0);seqState.sessionMode=true;
const cc=(key,value)=>seqHandleMidi([176,key,value],false);
const sessionTap=()=>{cc(CC_NOTE_SESSION,127);cc(CC_NOTE_SESSION,0);};
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
 cc(MoveMainButton,127);cc(MoveMainButton,0);
 assert.equal(buttons.sessionPlayMode(),expected,'confirmation enters the selected mode directly');
 assert(!buttons.inputModeSelectorOpen());
 const unchanged=writes.length;sessionTap();cc(MoveMainButton,127);cc(MoveMainButton,0);
 assert.equal(writes.length,unchanged,'confirming the current mode does not reload it');
 sessionTap();sessionTap();assert(!buttons.inputModeSelectorOpen(),'Session again cancels');
 cc(CC_NOTE_SESSION,0);assert.equal(buttons.sessionPlayMode(),expected,'stray release is inert');
}
sessionTap();cc(14,127);assert.equal(buttons.inputModeSelectorChoice(),0,'list clamps at the first mode');
buttons.resetInputModeSelector();assert(!buttons.inputModeSelectorOpen());
buttons.seqHandleButtonCc(CC_NOTE_SESSION,127,true);buttons.seqHandleButtonCc(CC_NOTE_SESSION,0,false);
assert.equal(buttons.sessionPlayMode(),7,'Shift Session retains the Settings shortcut');
buttons.seqHandleButtonCc(CC_NOTE_SESSION,127,true);buttons.seqHandleButtonCc(CC_NOTE_SESSION,0,false);
console.log('Session selector: zero browse reads/writes, all eight direct entries, cancel, current-mode no-op, release ownership and Settings shortcut pass');
