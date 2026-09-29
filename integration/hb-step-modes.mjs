import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installEnv } from './env.mjs';
installEnv();
const { appState, VIEW_KNOBS } = await import('../dist/esm/app/state.js');
const { seqState } = await import('../dist/esm/seq/state.js');
const { portFor } = await import('../dist/esm/track/registry.js');
const { selectTrack } = await import('../dist/esm/track/focus.js');
const { beginTrackSwitch, switchToTrack } = await import('../dist/esm/track/switch.js');
const { schwungActiveFor } = await import('../dist/esm/renderer/schwung-grid.js');
const { flagValue, setFlag } = await import('../dist/esm/seq/flags.js');
const { seqHandleButtonCc } = await import('../dist/esm/seq/router-buttons.js');
const { onUnit, resetDuplicate } = await import('../dist/esm/seq/duplicate.js');
const { hbPerformanceStep, hbPerformancePage } = await import('../dist/esm/renderer/schwung-page.js');
const { stepRecDownAt, stepRecUpAt } = await import('../dist/esm/seq/step-rec.js');
const { headerText, drawHeader } = await import('../dist/esm/renderer/header.js');
const { fontWidth } = await import('../dist/esm/font/index.js');
const module = JSON.parse(readFileSync(process.env.HB_MODULE, 'utf8'));
const writes = [];
for (let track=0; track<16; track++) {
    const values = new Map(module.capabilities.chain_params.map(p=>['midi_fx1:'+p.key,String(p.default??p.options?.[0]??'0')]));
    values.set('midi_fx1_module',track===2?'':'harmonybus');
    values.set('midi_fx1:ui_hierarchy',JSON.stringify(module.capabilities.ui_hierarchy));
    values.set('midi_fx1:chain_params',JSON.stringify(module.capabilities.chain_params));
    const port=portFor(track);
    port.getParam=key=>values.get(key)??null;
    port.getMany=keys=>keys.map(key=>port.getParam(key));
    port.setParam=(key,value)=>{writes.push([track,key,value]);values.set(key,value);return true;};
}
selectTrack(0);appState.currentView=VIEW_KNOBS;appState.trackChainIndex[0]=0;
seqState.sessionMode=false;seqState.loopMode=false;appState.shiftHeld=false;
setFlag('hbsteprow',0);
const page=schwungActiveFor(0,'midi_fx1');assert(page?.ready);
const has=(p,key)=>p.ctl.pages.some(candidate=>candidate.keys?.includes(key));
assert(!has(page,'motion_control_1'));assert(!has(page,'motif_slot'));
assert(has(page,'chord_mode'),'Common chord controls remain reachable in Steps');
const order=key=>page.ctl.pages.findIndex(p=>p.keys?.includes(key));
const checkCadences=()=>{
    for(const key of ['motion_control_23','motion_control_34','motion_control_38','motion_control_45']) {
        assert(!has(page,key),'Cadence shortcuts have no separate panels');
        assert(page.ctl.state.metaIndex.get(key),'Cadence metadata remains available');
    }
    assert.deepEqual(page.ctl.state.metaIndex.get('motion_operation').options,module.capabilities.chain_params.find(p=>p.key==='motion_operation').options,'Lane assignment keeps every operation');
};
checkCadences();
assert(order('follower_explicit_root')<order('chord_mode'));
assert.equal(order('chord_mode'),3,'Chords follows Main, Global and Follower Root');
assert.equal(order('arp_playback'),4,'Arp / Strum immediately follows Chords');
for(const key of ['defaults_editor'])
    assert(order(key)>order('render_rhythm_mode'),'Role defaults follow everyday and play controls');
assert(order('render_channel')<order('chord_mode'));
let now=10000;const clock=Date.now;Date.now=()=>now;
const down=()=>seqHandleButtonCc(60,127,appState.shiftHeld);
const up=()=>seqHandleButtonCc(60,0,appState.shiftHeld);
const tap=()=>{down();now+=60;up();};
try {
    tap();assert.equal(flagValue('hbsteprow'),1);assert(page.ctl.page.keys.includes('motion_control_1'));
    assert(!has(page,'motif_slot'));assert(has(page,'motion_lane'));
    checkCadences();
    const firstOps=order('motion_control_1');
    assert(firstOps>order('monitor_status'),'Copy-mode operations follow main diagnostics');
    assert(order('pad_display')>firstOps&&order('fpath_0_0_0')>firstOps);
    assert(page.ctl.pages.slice(firstOps).every(p=>p.keys?.some(key=>/^motion_(control_|lane$)/.test(key)||key==='pad_display'||key==='fpath_0_0_0')),'Only operations and end diagnostics follow the first operation page');
    down();assert.equal(hbPerformancePage(),null,'Copy held exposes native input step editing');
    onUnit({kind:'step',track:0,step:0});now+=50;up();assert.equal(flagValue('hbsteprow'),1,'Copy source gesture does not cycle');
    down();now+=500;up();assert.equal(flagValue('hbsteprow'),1,'Long unused hold does not cycle');
    down();resetDuplicate();now+=40;up();assert.equal(flagValue('hbsteprow'),1,'Reset cannot manufacture a tap');
    tap();assert.equal(flagValue('hbsteprow'),2);assert(page.ctl.page.keys.includes('approach_knob_1'));
    assert(has(page,'approach_bank_1'));assert(has(page,'approach_bank_16'));
    assert(!has(page,'motion_control_1'),'Approach bank is independent of Perform');
    assert.equal(page.ctl.metaAt(0).options.length,29);
    page.knobTouch(0,true);page.knobTouch(1,true);
    assert(writes.some(([,key,value])=>key==='midi_fx1:approach_touch_1'&&value==='Down'));
    assert(writes.some(([,key,value])=>key==='midi_fx1:approach_touch_2'&&value==='Down'));
    page.knobTurn(0,1);page.knobTouch(0,false);page.knobTouch(1,false);
    assert(writes.some(([,key])=>key==='midi_fx1:approach_knob_1'));
    const owner=hbPerformancePage();assert(owner);
    hbPerformanceStep([0x90,16,100],owner);hbPerformanceStep([0x80,16,0],owner);
    assert(writes.some(([,key,value])=>key==='midi_fx1:approach_trigger'&&value==='1'));
    tap();assert.equal(flagValue('hbsteprow'),0);assert(page.ctl.page.keys.includes('version'));
    assert(!has(page,'motif_record'),'Motif editor has no permanent performance bank');
    tap();assert.equal(flagValue('hbsteprow'),1);
    setFlag('hbsteprow',0);schwungActiveFor(4,'midi_fx1');setFlag('hbsteprow',1);
    switchToTrack(4,beginTrackSwitch());const target=schwungActiveFor(4,'midi_fx1');
    assert(has(target,'motion_control_1'));assert(!has(target,'motif_record'));
    tap();assert.equal(flagValue('hbsteprow'),2);tap();assert.equal(flagValue('hbsteprow'),0);assert(target.ctl.page.keys.includes('version'));
    for(const prop of ['recording','countingIn','sessionMode','loopMode']){seqState[prop]=true;tap();assert.equal(flagValue('hbsteprow'),0,prop);seqState[prop]=false;}
    stepRecDownAt(now);tap();assert.equal(flagValue('hbsteprow'),0,'Step entry blocks mode cycling');stepRecUpAt(now+400);
    appState.shiftHeld=true;tap();assert.equal(flagValue('hbsteprow'),0);appState.shiftHeld=false;
    down();selectTrack(0);now+=30;up();assert.equal(flagValue('hbsteprow'),0,'Changing track while held cancels tap');
    selectTrack(2);tap();assert.equal(flagValue('hbsteprow'),0,'No HB: keep native Copy');
    up();assert.equal(flagValue('hbsteprow'),0,'Stray release does nothing');
} finally {Date.now=clock;resetDuplicate();}
for(const [left,right] of [['Chord Scope','Conductor role defaults'],['Chromatic approach settings','Secondary dominant cadence'],['A','x'.repeat(200)],['x'.repeat(200),'A'],['x'.repeat(200),null]]){
    const [label,value]=headerText(left,right);
    assert(fontWidth(label)<=124);assert(fontWidth(value)<=124);
    if(value)assert(2+fontWidth(label)+4<=126-fontWidth(value),'Label and value never overlap');
    const rectangles=[];globalThis.fill_rect=(...args)=>rectangles.push(args);drawHeader(left,right,true);
    assert.deepEqual(rectangles[0],[0,0,128,7,1]);
    for(const [x,y,w,h] of rectangles)assert(x>=0&&x+w<=128&&y>=0&&y+h<=7,'Header pixels stay on screen');
}
selectTrack(0);appState.currentView=VIEW_KNOBS;seqState.playing=true;seqState.lenSteps=0;
seqState.sessionMode=false;seqState.loopMode=false;seqState.trackSelectHold=false;
setFlag('hbsteprow',1);schwungActiveFor(0,'midi_fx1');assert(hbPerformancePage());
const {seqBeatLedsTick,seqLedsInvalidate}=await import('../dist/esm/seq/leds.js');
const {ledFrameReset}=await import('../dist/esm/seq/led-cache.js');
const packets=[];const originalMidi=globalThis.setLED;
globalThis.setLED=(...args)=>packets.push(args);
seqLedsInvalidate();ledFrameReset();seqBeatLedsTick();assert.equal(packets.length,0,'Metronome cannot write over Perform');
setFlag('hbsteprow',0);seqLedsInvalidate();ledFrameReset();seqBeatLedsTick();
assert(packets.length>0,'Steps keeps its empty-clip metronome');
globalThis.setLED=originalMidi;seqState.playing=false;
console.log('Step modes: Copy tap/hold/reset, edit guards, native copy, destination panels/slots, missing HB and bounded header pixels pass');
