import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installEnv} from './env.mjs';
installEnv();await import('../dist/esm/app/globals.js');
const {schwungLibAvailable}=await import('../dist/esm/renderer/schwung-lib.js');
assert(schwungLibAvailable(),'Requires the real shared controller');
const {portFor}=await import('../dist/esm/track/registry.js');
const {appState}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {setFlag,flagValue}=await import('../dist/esm/seq/flags.js');
const joint=await import('../dist/esm/seq/joint-play.js');
const panels=await import('../dist/esm/seq/joint-panels.js');
const {hbPerformancePage,hbPerformanceStep}=await import('../dist/esm/renderer/schwung-page.js');
const module=JSON.parse(readFileSync(process.env.HB_MODULE,'utf8'));
let now=10000;Date.now=()=>now;
const flush=page=>{for(let tick=0;tick<4;tick++){now+=100;page.tick();}};
const writes=[];
for(let track=0;track<16;track++){
 const port=portFor(track),values=new Map(module.capabilities.chain_params.map(meta=>[meta.key,String(meta.default??meta.options?.[0]??'0')]));
 values.set('approach_bank_5','Leading Tone');
 port.getParam=key=>{
  if(key==='midi_fx1_module')return 'harmonybus';
  const bare=key.split(':').at(-1);
  if(bare==='chain_params')return JSON.stringify(module.capabilities.chain_params);
  if(bare==='ui_hierarchy')return JSON.stringify(module.capabilities.ui_hierarchy);
  return values.get(bare)??'';
 };
 port.setParam=(key,value)=>{writes.push([track,key,value]);values.set(key.split(':').at(-1),value);return true;};
}
setFlag('chtracks',1);appState.focusGroup=0;seqState.sessionMode=false;joint.restoreJoint(null);joint.setJointEnabled(true);
let page=panels.jointPage();assert(page.ready);
assert.equal(page.keyAt(0),'joint_unit');assert.equal(page.keyAt(1),'joint_actor');
const savedMode=flagValue('hbsteprow');
assert.equal(hbPerformancePage().performanceTrack,3);
assert(writes.some(([track,key,value])=>track===3&&key==='midi_fx1:approach_mode_active'&&value==='1'));
const initial=page.pageIndex;
joint.jointMidi([0xb0,14,1]);assert.notEqual(page.pageIndex,initial);assert.equal(appState.focusGroup,0,'jog moves panels, not units');
page.goToPage(initial);
joint.jointMidi([0xb0,71,4]);flush(page);assert.equal(appState.focusGroup,1,'setup knob selects quartet');
page=panels.jointPage();assert.equal(page.keyAt(0),'joint_unit');
const recording=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_record_bass'));assert(recording>=0);page.goToPage(recording);
page.knobTurn(1,4);flush(page);assert(joint.jointSnapshot()[1].overwrite&2);
const performance=page.ctl.pages.findIndex(item=>item.keys?.includes('approach_bank_5'));assert(performance>=0);page.goToPage(performance);
const slot=Array.from({length:8},(_,index)=>page.keyAt(index)).indexOf('approach_bank_5');
joint.jointMidi([0x90,slot,127]);assert(writes.some(([track,key,value])=>track===7&&key==='midi_fx1:approach_touch_5'&&value==='Down'));
seqState.sessionMode=true;joint.jointMidi([0x80,slot,0]);assert(writes.some(([track,key,value])=>track===7&&key==='midi_fx1:approach_touch_5'&&value.startsWith('Up,')));
seqState.sessionMode=false;appState.shiftHeld=true;page.knobTurn(slot,1);flush(page);appState.shiftHeld=false;
assert(writes.some(([track,key])=>track===7&&key==='midi_fx1:approach_bank_5'),'shared Shift-turn assignment edits actor HB bank');
assert.equal(hbPerformancePage().performanceTrack,7);
assert.equal(hbPerformanceStep([0x90,16,127]),false);assert.equal(hbPerformanceStep([0x80,16,0]),false);
assert(!writes.some(([track,key,value])=>track===7&&key==='midi_fx1:approach_step_touch_1'&&value==='Down'),'Joint leaves sequencer steps available');
assert.equal(flagValue('hbsteprow'),savedMode,'Joint does not rewrite the saved Copy mode');
assert(page.ctl.pages.some(item=>item.keys?.includes('target_scale_source')),'existing Motif Play Settings retained');
console.log('Joint shared panels: metadata, jog, unit knob, actor recording, native operation touch/release and Shift assignment pass');

// Session owns navigation; Copy retains its native duplicate gesture.
const {seqHandleButtonCc,sessionPlayMode}=await import('../dist/esm/seq/router-buttons.js');
const {CC_NOTE_SESSION}=await import('../dist/esm/seq/constants.js');
const {momentaryGesture}=await import('../dist/esm/seq/momentary.js');
const {VIEW_KNOBS}=await import('../dist/esm/app/state.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
selectTrack(0);appState.currentView=VIEW_KNOBS;appState.shiftHeld=false;appState.focusGroup=0;
joint.setJointEnabled(false);setFlag('hbsteprow',0);seqState.sessionMode=true;
const sessionDown=()=>seqHandleButtonCc(CC_NOTE_SESSION,127,false);
const sessionUp=()=>seqHandleButtonCc(CC_NOTE_SESSION,0,false);
const sessionTap=()=>{sessionDown();now+=60;sessionUp();};
for(const expected of [1,2,3,0,1,2,3,0]){
 sessionTap();assert.equal(sessionPlayMode(),expected,'four-mode Session cycle');
 if(expected){
  sessionDown();assert(seqState.sessionMode,'hold immediately peeks clips');now+=600;sessionUp();
  assert.equal(sessionPlayMode(),expected,'hold restores original play mode');
  sessionDown();momentaryGesture();now+=40;sessionUp();
  assert.equal(sessionPlayMode(),expected,'clip gesture restores original play mode');
 }
 seqHandleButtonCc(60,127,false);now+=60;seqHandleButtonCc(60,0,false);
 assert.equal(sessionPlayMode(),expected,'Copy never changes mode');
}
const beforeStray=sessionPlayMode();sessionUp();assert.equal(sessionPlayMode(),beforeStray);
console.log('Session: four modes, hold/clip-gesture restore, stray release and native Copy pass');
