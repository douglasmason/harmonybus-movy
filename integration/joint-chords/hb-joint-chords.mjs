import './hb-chord-play.mjs';
import assert from 'node:assert/strict';
const joint=await import('../dist/esm/seq/joint-play.js');
const panels=await import('../dist/esm/seq/joint-panels.js');
const chord=await import('../dist/esm/seq/chord-play.js');
const record=await import('../dist/esm/seq/step-rec.js');
const {watchedTrack}=await import('../dist/esm/seq/watch.js');
const {seqHandleMidi,seqNotePadPlayed}=await import('../dist/esm/seq/router.js');
const {seqCmdFlush}=await import('../dist/esm/seq/engine.js');
const {restoreSessionRoles}=await import('../dist/esm/seq/session-roles.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {appState}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {portFor}=await import('../dist/esm/track/registry.js');
chord.setChordEnabled(false);chord.restoreChord(null);joint.restoreJoint(null);restoreSessionRoles(1);
selectTrack(3);seqState.sessionMode=false;seqState.playing=false;seqState.recording=false;seqState.countingIn=false;
const commands=[],oldSet=host_module_set_param_blocking,oldGet=host_module_get_param;
let serial=0,entry='--',clipSlot=0;
globalThis.host_module_set_param_blocking=(key,value)=>{
 commands.push([key,value]);
 if(key==='chord_select'&&value!=='off')entry=[++serial,Number(value.split(',')[0]),60+serial%12].join(',');
 return oldSet(key,value);
};
globalThis.host_module_get_param=key=>key==='chord_step_input'?entry:key.startsWith('motif_clip_info_')?`${clipSlot},abcdef,16,0,1,1`:oldGet(key);
joint.setJointEnabled(true);
let page=panels.jointPage();assert.equal(page.keyAt(1),'joint_conductor');
joint.jointPanelSet(0,'joint_conductor','1');page=panels.jointPage();
assert.equal(page.keyAt(0),'cp_slot_0','conductor knobs opens on the home bank');
assert.equal(page.keyAt(7),'cp_off');assert(!chord.chordEnabled(),'embedding does not enable Chord Play routing');
assert.equal(joint.jointRecordCommand(),'jrec 9 1');assert.deepEqual(joint.jointPadRoles(),[0,3],'conductor still receives Joint operations');
const geometry=joint.jointGeometry(0,joint.jointSnapshot()[0],[48,24,48,60],0,false,false);
assert(geometry.every(cell=>cell.track===3),'melody receives all four pad rows');
const mode=joint.jointStepMode();assert.equal(mode,2);
assert(!joint.jointMidi([144,16,100]),'Joint step row stays with its existing owner');
assert(joint.jointMidi([144,0,100]));assert(commands.some(([key,value])=>key==='chord_select'&&value.startsWith('0,')));
joint.jointMidi([128,0,0]);assert.equal(appState.activeTrack.index,3);
assert(!commands.some(([key,value])=>key==='chord_route'&&value!=='off'),'embedding does not replace actor follow/clip routing');
assert(commands.some(([key,value])=>key==='chord_joint'&&value==='0'));
const selection=page.ctl.pages.findIndex(entry=>entry.level==='cp_selection');assert(selection>=0);page.goToPage(selection);
page.knobTurn(0,4);for(let i=0;i<4;i++)page.tick();
assert.equal(chord.chordSnapshot().playMode,1,'existing Immediate/Queued setting is shared');
page.goToPage(0);joint.jointMidi([144,1,100]);joint.jointMidi([128,1,0]);
assert(commands.some(([key])=>key==='chord_queue'));
assert.equal(joint.jointStepMode(),mode);
// Sequential authoring overrides queueing only for the stopped Record hold.
commands.length=0;seqHandleMidi([176,86,127],false);assert(record.stepRecActive());assert.equal(watchedTrack(),0);assert.equal(appState.activeTrack.index,3);
seqHandleMidi([144,0,100],false);assert.equal(record.stepRecHead(),0);
seqHandleMidi([176,63,127],false);seqHandleMidi([176,63,0],false);assert.equal(record.stepRecHead(),1,'held chord ties');
seqHandleMidi([128,0,0],false);assert.equal(record.stepRecHead(),2,'release advances past tie');
seqHandleMidi([176,63,127],false);seqHandleMidi([176,63,0],false);assert.equal(record.stepRecHead(),3,'idle Right inserts rest');
seqHandleMidi([144,1,100],false);seqHandleMidi([128,1,0],false);assert.equal(record.stepRecHead(),4);
seqCmdFlush();
const ops=commands.filter(([key])=>key==='cmd').flatMap(([,value])=>value.split(';'));
assert(ops.some(op=>/^cadd 0 0 0 \d+$/.test(op)));assert(ops.some(op=>/^cadd 0 0 3 \d+$/.test(op)));
assert(ops.some(op=>/^slen 0 0 0 \d+ 48$/.test(op)));assert(ops.includes('del 0 2 2 -1'));
assert(!commands.some(([key])=>key==='chord_queue'),'stopped entry never appends the live queue');
const before=commands.length;seqNotePadPlayed(3,68,72,90);seqCmdFlush();assert(!commands.slice(before).some(([key,value])=>key==='cmd'&&/addp|cadd/.test(value)),'melody pads cannot write conductor clip');
seqHandleMidi([176,86,0],false);assert(!record.stepRecActive());assert.equal(watchedTrack(),3);
assert.equal(chord.chordSnapshot().playMode,1,'authoring preserves live selection preference');
// Slot changes fail closed; entry never follows a newly selected clip.
seqHandleMidi([176,86,127],false);clipSlot=1;commands.length=0;
seqHandleMidi([144,2,100],false);seqHandleMidi([128,2,0],false);seqCmdFlush();
assert(!record.stepRecActive());assert(!commands.some(([key,value])=>key==='cmd'&&value.includes('cadd')));
clipSlot=0;
// Live Record retains the joint multi-actor mask and conductor overwrite policy.
seqState.playing=true;commands.length=0;seqHandleMidi([176,86,127],false);seqCmdFlush();
assert(commands.some(([key,value])=>key==='cmd'&&value.includes('jrec 9 1')));seqHandleMidi([176,86,0],false);seqState.playing=false;
// Group switching uses the global conductor in new Sets, legacy root in old Sets.
for(const single of [1,0]){
 restoreSessionRoles(single);selectTrack(7);joint.jointPanelSet(4,'joint_conductor','1');joint.syncJoint(()=>{},100000);
 page=panels.jointPage();page.goToPage(0);commands.length=0;joint.jointMidi([144,0,100]);joint.jointMidi([128,0,0]);
 assert(commands.some(([key,value])=>key==='chord_queue'&&value.startsWith(single?'0,':'4,')));
 assert.equal(joint.jointRecordCommand(),single?'jrec 129 1':'jrec 144 16');
}
const saved=joint.jointSnapshot();joint.restoreJoint(saved);assert.equal(joint.jointSnapshot()[1].conductor,1);
joint.setJointEnabled(true);joint.jointPanelSet(4,'joint_conductor','0');assert.equal(panels.jointPage().keyAt(0),'joint_unit');
assert.equal(joint.jointSnapshot()[1].pads,15,'switching inputs preserves pad participation choices');
joint.setJointEnabled(false);globalThis.host_module_set_param_blocking=oldSet;globalThis.host_module_get_param=oldGet;
console.log('Joint conductor knobs: shared banks/queue, pad allocation, operation/record owners, ties/rests, clip safety and legacy/global conductor routing pass');
