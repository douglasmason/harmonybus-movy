import assert from 'node:assert/strict';
import { installEnv } from './env.mjs';
installEnv();
await import('../dist/esm/app/globals.js');
const joint=await import('../dist/esm/seq/joint-play.js');
const {appState}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {setFlag}=await import('../dist/esm/seq/flags.js');
const {seqHandleButtonCc}=await import('../dist/esm/seq/router-buttons.js');
const {resetMomentary}=await import('../dist/esm/seq/momentary.js');
const {beginControlTouch}=await import('../dist/esm/surfaces/controls.js');
const {setNativeTrackColors,trackColor}=await import('../dist/esm/seq/colors.js');
const {keyboardState}=await import('../dist/esm/keyboard/state.js');
const {installMockEngine}=await import('./mock-engine.mjs');
const {seqEngineTick}=await import('../dist/esm/seq/engine.js');
installMockEngine();seqEngineTick();
setFlag('chtracks',1);
appState.focusGroup=0;seqState.sessionMode=false;joint.restoreJoint(null);
const defaults=joint.jointSnapshot()[0];
const plain=joint.jointGeometry(0,defaults,[48,24,48,60],0,false,false);
assert.deepEqual([...new Set(plain.slice(0,16).map(cell=>cell.track))],[0]);
assert.deepEqual([...new Set(plain.slice(16).map(cell=>cell.track))],[3]);
assert.equal(plain[0].pitch,48);assert.equal(plain[8].pitch,60);
assert.equal(plain[16].pitch,60);assert.equal(plain[24].target,60);
const split={...defaults,bass:2,comp:2};
const altered=joint.jointGeometry(0,split,[48,24,48,60],0,false,true);
assert.equal(altered[0].track,1);assert.equal(altered[0].pitch,23);
assert.equal(altered[8].track,0);assert.equal(altered[8].pitch,47);
assert.equal(altered[16].track,2);assert.equal(altered[16].pitch,48);
assert.equal(altered[24].track,3);assert.equal(altered[24].pitch,60);
const approached=joint.jointGeometry(0,split,[48,24,48,60],0,true,false);
assert.equal(approached[16].target,-1,'comp ignores pitch operations');
assert.equal(approached[24].target,60);
const independentClips=joint.jointGeometry(4,{...defaults,bass:1,comp:3},[48,24,48,60],0,false,false);
assert.deepEqual([...new Set(independentClips.map(cell=>cell.track))],[4,7],'clips do not claim pad rows');
const lowerChrom=joint.jointGeometry(0,{...defaults,lower:2},[48,24,48,60],0,false,false);
assert(lowerChrom.slice(0,16).every(cell=>cell.target===-1),'lower chromatic row commits a note, never an approach alias');
assert.equal(lowerChrom[8].pitch,47);
for(const layout of [0,1,2]){
 const grid=joint.jointGeometry(12,{...defaults,lower:layout,upper:layout},[120,24,48,120],0,false,false);
 assert(grid.every(cell=>cell.pitch>=-1&&cell.pitch<=127&&cell.target>=-1&&cell.target<=127));
}
// Session transitions are covered with the real controller in hb-joint-panels.
joint.setJointEnabled(true);seqState.sessionMode=false;
assert.equal(joint.jointRecordCommand(),'jrec 9 1');
joint.restoreJoint([split]);joint.setJointEnabled(true);seqState.sessionMode=false;
assert.equal(joint.jointRecordCommand(),'jrec 15 5');
const writes=[];
for(let track=0;track<16;track++){
 const port=portFor(track);
 port.getParam=()=> '145,145,145,1,2741,2,0,3,2,0|piano1,1';
 port.setParam=(key,value)=>{writes.push([track,key,value]);return true;};
}
const sent=[];const send=(key,value)=>sent.push([key,value]);
joint.syncJoint(send,0);joint.syncJoint(send,1);
assert.equal(sent.filter(([key])=>key==='joint_map').length,1,'unchanged geometry is not resent');
assert.equal(writes.filter(([,key])=>key==='midi_fx1:pad_preview_inputs').length,1,'one preview per 50 ms total');
joint.syncJoint(send,50);joint.syncJoint(send,100);joint.syncJoint(send,150);
assert.deepEqual([...new Set(writes.map(([track])=>track))].sort(),[0,1,2,3]);
joint.jointPanelSet(0,'joint_chromatic_below','Down');joint.syncJoint(send,200);
const latest=sent.filter(([key])=>key==='joint_map').at(-1)[1].split(';').map(cell=>cell.split(',').map(Number));
assert.equal(latest[0][1],keyboardState.octave[1]*12-1);
assert.equal(latest[16][1],keyboardState.octave[2]*12);
joint.jointPanelSet(0,'joint_chromatic_below','Up,400');joint.jointMidi([0x90,68,100]);
seqState.sessionMode=true;
assert(joint.jointMidi([0x80,68,0]),'held release survives Session peek');
seqState.sessionMode=false;
setNativeTrackColors([[9,8],[17,16],[25,24],[33,32]]);
for(let group=0;group<4;group++){
 appState.focusGroup=group;
 for(let role=0;role<4;role++)assert.equal(joint.jointActorColor(role),trackColor(group*4+role));
}
appState.focusGroup=0;
joint.restoreJoint([{bass:2,comp:3,lower:1,upper:2,steps:1,overwrite:10}]);
assert.equal(joint.jointSnapshot()[0].overwrite,11,'root is always overwrite');
assert.equal(joint.jointSnapshot()[0].steps,1,'step row mode restores from set');
const saved=joint.jointSnapshot();joint.restoreJoint(saved);assert.deepEqual(joint.jointSnapshot(),saved);
assert(!joint.jointEnabled(),'navigation does not persist');
console.log('Joint Play: role geometry, operation scope, Session entry, recording masks, preview budget and persistence pass');

// Pads Off frees space without changing the stored playback source.
const bassMelody={...defaults,pads:10,bass:2};
const duo=joint.jointGeometry(0,bassMelody,[48,24,48,60],0,false,false);
assert(duo.slice(0,16).every(cell=>cell.track===1));
assert(duo.slice(16).every(cell=>cell.track===3));
assert.equal(duo[0].pitch,24);assert.equal(duo[8].pitch,36);
for(let role=0;role<4;role++){
 const settings={...defaults,pads:1<<role,bass:2,comp:2};
 const full=joint.jointGeometry(0,settings,[48,24,48,60],0,false,false);
 assert(full.every(cell=>cell.track===role));
 assert(full.some((cell,index)=>index>=24&&(cell.pitch>=0||cell.target>=0)),'sole actor receives all rows');
 if(role===2)assert(full.every(cell=>cell.pitch>=0&&cell.target<0),'comp never acquires approach holes');
}
const none=joint.jointGeometry(0,{...defaults,pads:0},[48,24,48,60],0,false,false);
assert(none.every(cell=>cell.pitch<0&&cell.target<0));
joint.restoreJoint([bassMelody]);joint.setJointEnabled(true);seqState.sessionMode=false;
assert.deepEqual(joint.jointPadRoles(0),[1,3]);assert.equal(joint.jointRecordCommand(),'jrec 10 0');
joint.jointPanelSet(0,'joint_pads_1','0');assert.equal(joint.jointSnapshot()[0].bass,2,'Pads Off does not change source');
assert.deepEqual(joint.jointPadRoles(0),[3]);
const outputs=[{role:0,notes:[60]},{role:1,notes:[48,60]},{role:2,notes:[60]},{role:3,notes:[72]}];
assert.deepEqual(joint.jointOverlayRoles(0,60,outputs,1),[0,1]);
assert.deepEqual(joint.jointOverlayRoles(3,60,outputs,1),[2]);
assert.deepEqual(joint.jointOverlayRoles(0,60,outputs,2),[0,1,2]);
assert.deepEqual(joint.jointOverlayRoles(0,84,outputs,2),[],'out-of-range outputs are not octave folded');
assert.deepEqual(joint.jointOverlayRoles(0,-1,outputs,2),[]);
assert.deepEqual(joint.jointOverlayRoles(0,60,outputs,0),[]);
console.log('Joint participation: freed rows, sole actor, empty surface, recording mask and exact-pitch overlays pass');
