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
 port.setParam=(key,value)=>{if(key.startsWith('midi_fx1:joint_pad_')){const [mask,...parts]=value.split('|');assert(Number(mask)&(1<<track));assert(!(Number(mask)&(4<<(track&~3))));value=parts.join('|');}writes.push([track,key,value]);values.set(key.split(':').at(-1),value);return true;};
}
setFlag('chtracks',1);appState.focusGroup=0;seqState.sessionMode=false;joint.restoreJoint(null);joint.setJointEnabled(true);
let page=panels.jointPage();assert(page.ready);
assert.equal(page.keyAt(0),'joint_unit');assert.equal(page.keyAt(1),'joint_blank');
const savedMode=flagValue('hbsteprow');
assert.equal(hbPerformancePage().performanceTrack,undefined);
assert(writes.some(([track,key,value])=>track===3&&key==='midi_fx1:joint_pad_approach_mode_active'&&value==='1'));
const initial=page.pageIndex;
joint.jointMidi([0xb0,14,1]);assert.notEqual(page.pageIndex,initial);assert.equal(appState.focusGroup,0,'jog moves panels, not units');
page.goToPage(initial);
joint.jointMidi([0xb0,71,4]);flush(page);assert.equal(appState.focusGroup,1,'setup knob selects quartet');
page=panels.jointPage();assert.equal(page.keyAt(0),'joint_unit');
const recording=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_record_bass'));assert(recording>=0);page.goToPage(recording);
page.knobTurn(1,4);flush(page);assert(joint.jointSnapshot()[1].overwrite&2);
const performance=page.ctl.pages.findIndex(item=>item.keys?.includes('approach_bank_5'));assert(performance>=0);page.goToPage(performance);
const slot=Array.from({length:8},(_,index)=>page.keyAt(index)).indexOf('approach_bank_5');
joint.jointMidi([0x90,slot,127]);assert(writes.some(([track,key,value])=>track===7&&key==='midi_fx1:joint_pad_approach_touch_5'&&value==='Down'));
seqState.sessionMode=true;joint.jointMidi([0x80,slot,0]);assert(writes.some(([track,key,value])=>track===7&&key==='midi_fx1:joint_pad_approach_touch_5'&&value.startsWith('Up,')));
seqState.sessionMode=false;appState.shiftHeld=true;page.knobTurn(slot,1);flush(page);appState.shiftHeld=false;
assert(writes.some(([track,key])=>track===7&&key==='midi_fx1:approach_bank_5'),'shared Shift-turn assignment edits global HB bank');
assert.equal(hbPerformancePage().performanceTrack,undefined);
assert(hbPerformanceStep([0x90,16,127]));assert(hbPerformanceStep([0x80,16,0]));
assert(writes.some(([track,key,value])=>track===7&&key==='midi_fx1:joint_pad_approach_step_touch_1'&&value==='Down'),'Joint arms its pad zones');
assert(writes.some(([track,key,value])=>track===4&&key==='midi_fx1:joint_pad_approach_step_touch_1'&&value==='Down'),'root zone is also armed');
assert(!writes.some(([track,key])=>(track===5||track===6)&&key.startsWith('midi_fx1:joint_pad_')),'comp and following bass are not modified twice');
joint.jointPanelSet(4,'joint_bass','2');
const beforeBass=writes.length;assert(hbPerformanceStep([0x90,18,127]));
joint.jointPanelSet(4,'joint_bass','0');assert(hbPerformanceStep([0x80,18,0]));
assert(writes.slice(beforeBass).some(([track,key,value])=>track===5&&key==='midi_fx1:joint_pad_approach_step_touch_3'&&value==='Down'));
assert(writes.slice(beforeBass).some(([track,key,value])=>track===5&&key==='midi_fx1:joint_pad_approach_step_touch_3'&&value.startsWith('Up,')),'release keeps the original pad-zone ownership');
// Knob 8 changes only the step row and retains the actor's existing assignments.
page.goToPage(0);assert.equal(page.keyAt(7),'joint_steps');
assert.equal(joint.jointStepMode(),2);
page.knobTurn(7,-8);flush(page);assert.equal(joint.jointStepMode(),0);
const beforeSteps=writes.length;
assert.equal(hbPerformanceStep([0x90,17,127]),false);assert.equal(hbPerformanceStep([0x80,17,0]),false);
assert(!writes.slice(beforeSteps).some(([,key])=>/approach_step_touch_|motion_hold_|motion_gesture_/.test(key)));
page.knobTurn(7,4);flush(page);assert.equal(joint.jointStepMode(),1);
const beforeOperators=writes.length;
assert(hbPerformanceStep([0x90,17,127]));assert(hbPerformanceStep([0x80,17,0]));
assert(writes.slice(beforeOperators).some(([track,key])=>track===7&&/motion_(hold|gesture)_2$/.test(key)),'operator row arms melody pads');
page.knobTurn(7,4);flush(page);assert.equal(joint.jointStepMode(),2);
assert.equal(joint.jointSnapshot()[1].steps,2,'row choice saved per unit');
assert.equal(panels.jointPage(),page,'row choice reuses the same panel controller');
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
for(const expected of [1,2,3,4,0,1,2,3,4,0]){
 sessionTap();assert.equal(sessionPlayMode(),expected,'five-mode Session cycle');
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

// Fixed actor settings are native track aliases, never a mutable target cursor.
appState.focusGroup=0;seqState.sessionMode=false;joint.setJointEnabled(true);page=panels.jointPage();
const bassPage=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_actor_1_travel_map'));
assert(bassPage>=0);page.goToPage(bassPage);flush(page);
assert.equal(page.keyAt(0),'joint_pads_1');assert.equal(page.keyAt(1),'joint_bass');
const beforeNative=writes.length;page.knobTurn(2,4);flush(page);
assert(writes.slice(beforeNative).some(([track,key])=>track===1&&key==='midi_fx1:travel_map'));
assert(!writes.slice(beforeNative).some(([track,key])=>track!==1&&key==='midi_fx1:travel_map'));
page.knobTurn(3,4);flush(page);page.knobTurn(5,4);flush(page);
assert(writes.slice(beforeNative).some(([track,key])=>track===1&&key==='midi_fx1:chord_mode'));
assert(writes.slice(beforeNative).some(([track,key])=>track===1&&key==='midi_fx1:arp_playback'));
portFor(1).setParam('midi_fx1:travel_map','Closest Split');flush(page);
assert.equal(page.ctl.getValue?.('joint_actor_1_travel_map')??page.performanceGet('joint_actor_1_travel_map'),'Closest Split');
const rootPage=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_pads_0')&&item.keys?.includes('joint_actor_0_travel_map'));
page.goToPage(rootPage);flush(page);page.knobTurn(0,-4);flush(page);
assert(!(joint.jointSnapshot()[0].pads&1));assert(!joint.jointPadRoles(0).includes(0));
console.log('Joint actor panels: fixed native track writes, external readback and Pads Off pass');
for(let role=0;role<4;role++){
 const rhythmPage=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_actor_'+role+'_rhythm_gen_pattern'));
 assert(rhythmPage>=0,'each actor has its own rhythm page');page.goToPage(rhythmPage);flush(page);
 const before=writes.length;page.knobTurn(0,4);flush(page);
 assert(writes.slice(before).some(([track,key])=>track===role&&key==='midi_fx1:rhythm_gen_pattern'));
 assert(!writes.slice(before).some(([track,key])=>track!==role&&key==='midi_fx1:rhythm_gen_pattern'));
}
assert(page.ctl.pages.some(item=>item.keys?.includes('rhythm_gen_edit')),'shared pattern editor is available');
console.log('Joint rhythm: four fixed track selectors and shared pattern editor pass');

// Comp weave edits the existing comp lane, including its Conditions, directly.
for (const group of [0,2]) {
 appState.focusGroup=group;page=panels.jointPage();
 const weavePage=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_actor_2_motion_operation'));
 assert(weavePage>=0);page.goToPage(weavePage);flush(page);
 const expected=['motion_lane','motion_operation','motion_amount','motion_enabled','motion_cycle','motion_every','motion_from','motion_through'];
 for(let knob=0;knob<8;knob++) {
  assert.equal(page.keyAt(knob),'joint_actor_2_'+expected[knob]);
  const before=writes.length;page.knobTurn(knob,4);flush(page);
  assert(writes.slice(before).some(([track,key])=>track===group*4+2&&key==='midi_fx1:'+expected[knob]),expected[knob]);
  assert(!writes.slice(before).some(([track,key])=>track!==group*4+2&&key==='midi_fx1:'+expected[knob]));
 }
 portFor(group*4+2).setParam('midi_fx1:motion_operation','Clip Weave');flush(page);
 assert.equal(page.performanceGet('joint_actor_2_motion_operation'),'Clip Weave');
}
console.log('Joint comp weave: existing lane and Conditions routed to comp in each quartet; external edits read back');

// Source controls use native state and the normal command queue/undo hook.
const {installMockEngine}=await import('./mock-engine.mjs');
const {seqEngineTick}=await import('../dist/esm/seq/engine.js');
installMockEngine();seqEngineTick();
const {installEditGuard,setUndoStrict}=await import('../dist/esm/undo/record.js');
installEditGuard();setUndoStrict(true);
const nativeGet=globalThis.host_module_get_param;
const nativeSet=globalThis.host_module_set_param_blocking;
const sourceRoutes=new Map();
globalThis.host_module_get_param=key=>key.startsWith('source_route_')?(sourceRoutes.get(Number(key.slice(13)))??`${key.slice(13)} 0 -1 -1 -1 -1 0`):nativeGet(key);
globalThis.host_module_set_param_blocking=(key,value,timeout)=>{
 if(key==='cmd')for(const command of value.split(';'))if(command.startsWith('source ')){
  const fields=command.slice(7).split(' ').map(Number);assert.equal(fields.length,19);sourceRoutes.set(fields[0],fields.join(' '));
 }
 return nativeSet?.(key,value,timeout);
};
for(const group of [0,3]){
 appState.focusGroup=group;page=panels.jointPage();
 const sourcePage=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_source_3_enabled'));
 assert(sourcePage>=0);page.goToPage(sourcePage);flush(page);
 const actor=group*4+3;
 assert.equal(page.keyAt(1),'joint_source_3_pitch_track');
 page.knobTurn(1,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[2],'0','Pitch Source selects track 1');
 page.knobTurn(2,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[3],'1','Pitch Clip selects slot 2');
 page.knobTurn(3,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[4],'0','Rhythm Source selects independently');
 page.knobTurn(0,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[1],'1');
 page.knobTurn(5,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[6],'1','Timeline');
 page.knobTurn(5,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[6],'2','Fit to Window');
 page.knobTurn(5,-4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[6],'1','Timeline restored');
 page.knobTurn(6,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[7],'0','Expression Source is independent');
 page.knobTurn(7,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[8],'1','Expression Clip selects slot 2');
 const automationPage=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_source_3_instrument_track'));
 assert(automationPage>=0);page.goToPage(automationPage);flush(page);
 page.knobTurn(0,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[9],'0','Instrument Source selects independently');
 page.knobTurn(1,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[10],'1','Instrument Clip selects slot 2');
 page.knobTurn(2,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[11],'0','HB Render Source selects independently');
 page.knobTurn(3,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[12],'1','HB Render Clip selects slot 2');
 const operationsPage=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_source_3_note_ops_track'));
 assert(operationsPage>=0);page.goToPage(operationsPage);flush(page);
 page.knobTurn(0,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[13],'0','Note Ops donor selects independently');
 page.knobTurn(1,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[14],'1','Note Ops slot selects independently');
 page.knobTurn(2,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[15],'0');
 page.knobTurn(3,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[16],'1');
 const gesturePage=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_source_3_gesture_track'));
 assert(gesturePage>=0);page.goToPage(gesturePage);flush(page);
 page.knobTurn(0,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[17],'0');
 page.knobTurn(1,4);flush(page);
 assert.equal(sourceRoutes.get(actor)?.split(' ')[18],'1');
 sourceRoutes.set(actor,`${actor} 0 -1 -1 -1 -1 0`);flush(page);
 assert.equal(page.performanceGet('joint_source_3_pitch_track'),'Own','external state edits read back');
}
globalThis.host_module_get_param=nativeGet;globalThis.host_module_set_param_blocking=nativeSet;
console.log('Source Weaving panels: actor selection, independent tracks/slots, enable/alignment and native readback pass');

// Read-only overviews use native snapshots, keep quartets separate, and never
// start an independent polling loop or modify source/authority settings.
let previewReads=0,harmonyReads=0,previewValue=null;
const previousGet=globalThis.host_module_get_param;
globalThis.host_module_get_param=key=>{
 if(key.startsWith('source_preview_')){
  previewReads++;
  return previewValue??JSON.stringify({schema:1,actor:Number(key.slice(15)),enabled:true,playing:true,muted:false,recording:false,timeline:false,gates:2,notes:[60,64],sources:[{track:1,slot:2,active:true,phase_ticks:96,length_ticks:384},null,null,null,null,{track:4,slot:1,active:true,phase_ticks:48,length_ticks:192}]});
 }
 return previousGet(key);
};
for(const group of [0,3]){
 const port=portFor(group*4+3),get=port.getParam;
 port.getParam=key=>{
  if(key==='midi_fx1:harmony_source_snapshot'){harmonyReads++;return JSON.stringify({schema:1,source:'override',track:group*4,scope:'live',root:0,bass:4,candidates:1,pending:0});}
  if(key==='midi_fx1:final_harmony')return 'C/E';
  if(key==='midi_fx1:next_harmony')return 'F';
  return get(key);
 };
 appState.focusGroup=group;page=panels.jointPage();
 const overview=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_overview_authority'));
 assert(overview>=0);page.goToPage(overview);flush(page);
 assert.equal(page.performanceGet('joint_overview_authority'),`T${group*4+1} live`);
 assert.equal(page.performanceGet('joint_overview_harmony'),'C:E');
 assert.equal(page.performanceGet('joint_overview_next'),'F');
 assert.equal(page.performanceGet('joint_overview_bass'),'E');
 const beforeHarmony=harmonyReads;
 page.performanceGet('joint_overview_root');page.performanceGet('joint_overview_pending');
 assert.equal(harmonyReads,beforeHarmony,'one source read shared within the refresh burst');
 const preview=page.ctl.pages.findIndex(item=>item.keys?.includes('joint_preview_3_notes'));
 assert(preview>=0);page.goToPage(preview);flush(page);
 assert.equal(page.performanceGet('joint_preview_3_state'),'Weave Seq');
 assert.equal(page.performanceGet('joint_preview_3_pitch'),'T2C3 25%');
 assert.equal(page.performanceGet('joint_preview_3_rhythm'),'No playing clip');
 assert.equal(page.performanceGet('joint_preview_3_notes'),'C4 E4');
 assert.equal(page.performanceGet('joint_preview_3_gates'),'2');
 assert.equal(page.performanceGet('joint_preview_3_note_ops'),'T5C2 25%');
 assert(page.ctl.pages.some(item=>item.keys?.includes('joint_preview_3_note_ops')&&item.keys?.includes('joint_source_3_note_ops_track')));
 const beforeReads=previewReads;
 for(let index=0;index<8;index++)page.performanceGet(page.keyAt(index));
 assert.equal(previewReads,beforeReads,'eight fields do not serialize eight snapshots');
 const beforeWrites=writes.length;
 for(let index=0;index<8;index++){page.knobTurn(index,4);page.knobTouch(index,true);page.knobTouch(index,false);}
 flush(page);
 assert.equal(writes.length,beforeWrites,'read-only controls swallow turns/touches');
 previewValue=JSON.stringify({schema:1,actor:group*4+3,enabled:true,playing:true,alignment:2,timeline:false,sources:[{track:1,slot:2,active:true,phase_ticks:96,selection_phase_ticks:192,length_ticks:384}]});now+=101;
 assert.equal(page.performanceGet('joint_preview_3_state'),'Weave Fit');
 assert.equal(page.performanceGet('joint_preview_3_pitch'),'T2C3 50% fit');
 previewValue='bad JSON';now+=101;
 assert.equal(page.performanceGet('joint_preview_3_notes'),'Unavailable','failure replaces old output');
 previewValue=null;now+=101;
 assert.equal(page.performanceGet('joint_preview_3_notes'),'C4 E4');
 port.getParam=get;
}
globalThis.host_module_get_param=previousGet;
console.log('Conductor/source overviews: native state, quartets, bounded reads, read-only controls and unavailable state pass');
const variations=new Map();
globalThis.host_module_get_param=key=>key.startsWith('variation_')?(variations.get(Number(key.slice(10)))??`${key.slice(10)} 0 50 30 0 1`):nativeGet(key);
globalThis.host_module_set_param_blocking=(key,value,timeout)=>{
 if(key==='cmd')for(const command of value.split(';'))if(command.startsWith('variation ')){
  const fields=command.slice(10).split(' ').map(Number);assert.equal(fields.length,6);variations.set(fields[0],fields.join(' '));
 }
 return nativeSet?.(key,value,timeout);
};
for(const group of [0,3]){
 appState.focusGroup=group;page=panels.jointPage();
 assert(!page.ctl.pages.some(item=>item.keys?.includes('joint_variation_0_amount')));
 for(const role of [1,2,3]){
  const variationPage=page.ctl.pages.findIndex(item=>item.keys?.includes(`joint_variation_${role}_amount`));
  assert(variationPage>=0);page.goToPage(variationPage);flush(page);
  const actor=group*4+role;
  page.knobTurn(0,4);flush(page);assert.equal(variations.get(actor)?.split(' ')[1],'1');
  page.knobTurn(3,4);flush(page);assert.equal(variations.get(actor)?.split(' ')[4],'1');
  page.knobTurn(4,4);flush(page);const firstSeed=Number(variations.get(actor)?.split(' ')[5]);assert(firstSeed>1);
  page.knobTurn(4,4);flush(page);assert(Number(variations.get(actor)?.split(' ')[5])>firstSeed);
  variations.set(actor,`${actor} 0 50 30 0 1`);flush(page);
  assert.equal(page.performanceGet(`joint_variation_${role}_amount`),'0');
 }
}
globalThis.host_module_get_param=nativeGet;globalThis.host_module_set_param_blocking=nativeSet;
console.log('Clip Variation: shared-controller knobs, repeated rerolls, actor isolation and native readback pass');
