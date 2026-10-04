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
const { flagValue, setFlag, resetFlags, loadPerSetFlags } = await import('../dist/esm/seq/flags.js');
const { seqHandleButtonCc } = await import('../dist/esm/seq/router-buttons.js');
const { onUnit, resetDuplicate } = await import('../dist/esm/seq/duplicate.js');
const { hbPerformanceStep, hbPerformancePage } = await import('../dist/esm/renderer/schwung-page.js');
const { stepRecDownAt, stepRecUpAt } = await import('../dist/esm/seq/step-rec.js');
const { headerText, drawHeader } = await import('../dist/esm/renderer/header.js');
const { fontWidth } = await import('../dist/esm/font/index.js');
const module = JSON.parse(readFileSync(process.env.HB_MODULE, 'utf8'));
const writes = [];
let contractReads = 0, beforeCopy = 0, beforeNavigation = 0;
let heldOwner;
for (let track=0; track<16; track++) {
    const values = new Map(module.capabilities.chain_params.map(p=>['midi_fx1:'+p.key,String(p.default??p.options?.[0]??'0')]));
    values.set('midi_fx1_module',track===2?'':'harmonybus');
    values.set('midi_fx1:ui_hierarchy',JSON.stringify(module.capabilities.ui_hierarchy));
    values.set('midi_fx1:chain_params',JSON.stringify(module.capabilities.chain_params));
    const port=portFor(track);
    port.getParam=key=>{if(key.endsWith(':chain_params')||key.endsWith(':ui_hierarchy'))contractReads++;return values.get(key)??null;};
    port.getMany=keys=>keys.map(key=>port.getParam(key));
    port.setParam=(key,value)=>{writes.push([track,key,value]);values.set(key,value);return true;};
}
const { writePrefFlag } = await import('../dist/esm/seq/prefs.js');
writePrefFlag('hbsteprow',2);resetFlags();
assert.equal(flagValue('hbsteprow'),0,'Old stored mode cannot change startup from Steps');
setFlag('hbsteprow',2);loadPerSetFlags(null);
assert.equal(flagValue('hbsteprow'),0,'Project load returns to Steps');
setFlag('hbsteprow',1);resetFlags();
assert.equal(flagValue('hbsteprow'),0,'Mode selection is session-only');
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
    assert.deepEqual([...page.ctl.state.metaIndex.get('motion_operation').options].sort(),[...module.capabilities.chain_params.find(p=>p.key==='motion_operation').options].sort(),'Lane assignment keeps every operation');
};
checkCadences();
assert(order('follower_explicit_root')<order('chord_mode'));
assert.equal(order('chord_mode'),3,'Chords follows Main, Global and Follower Root');
assert.equal(order('arp_playback'),5,'Arp / Strum follows Chord Forms');
for(const key of ['defaults_editor'])
    assert.equal(order(key),-1,'Role Defaults panel removed');
assert(order('render_channel')<order('chord_mode'));
let now=10000;const clock=Date.now;Date.now=()=>now;
const down=()=>seqHandleButtonCc(60,127,appState.shiftHeld);
const up=()=>seqHandleButtonCc(60,0,appState.shiftHeld);
const tap=()=>{down();now+=60;up();};
try {
    beforeCopy=contractReads;
    tap();assert.equal(contractReads,beforeCopy,'Copy layout reuses contract without DSP reads');assert.equal(flagValue('hbsteprow'),1);assert(page.ctl.page.keys.includes('motion_control_1'));
    assert(!has(page,'motif_slot'));assert(has(page,'motion_lane'));
    assert(!has(page,'motion_control_17'),'Approach Harmony belongs to Harm Play');
    assert(!has(page,'motion_control_35'),'Secondary belongs to Harm Play');
    checkCadences();
    const firstOps=order('motion_control_1');
    assert(firstOps>=0);
    assert.equal(order('monitor_status'),-1,'Diagnostics stay in Steps setup');
    assert.equal(order('pad_display'),-1,'Pad Colors moved to Set pages');
    assert.equal(order('fpath_0_0_0'),-1,'Note diagnostics stay in Steps setup');
    assert(!has(page,'target_scale_major'),'Scale setup does not clutter Perform');
    down();assert.equal(hbPerformancePage(),null,'Copy held exposes native input step editing');
    onUnit({kind:'step',track:0,step:0});now+=50;up();assert.equal(flagValue('hbsteprow'),1,'Copy source gesture does not cycle');
    down();now+=500;up();assert.equal(flagValue('hbsteprow'),1,'Long unused hold does not cycle');
    down();resetDuplicate();now+=40;up();assert.equal(flagValue('hbsteprow'),1,'Reset cannot manufacture a tap');
    heldOwner=hbPerformancePage();assert(heldOwner);
    hbPerformanceStep([0x90,16,100],heldOwner);hbPerformanceStep([0x80,16,0],heldOwner);
    beforeNavigation=writes.length;
    tap();assert(!writes.slice(beforeNavigation).some(([,key])=>key.endsWith(':performance_reset')),'Navigation must not reset musical state');assert.equal(flagValue('hbsteprow'),2);assert(page.ctl.page.keys.includes('approach_bank_1'));
    assert(has(page,'approach_bank_1'));assert(has(page,'approach_bank_12'));assert(has(page,'approach_motif_latch'));assert(has(page,'approach_bank_7'));assert(has(page,'approach_bank_15')); assert(has(page,'motion_control_32'));
    assert(!has(page,'motion_control_1'),'Approach bank is independent of Perform');
    assert(has(page,'motion_control_17'));assert(has(page,'motion_control_35'));
    assert.equal(order('monitor_status'),-1,'Harm Play excludes diagnostics');
    assert(!has(page,'motion_lane'),'Harm Play excludes operation editing');
    assert.equal(page.ctl.page.keys.length,8);
    assert(page.ctl.pages.some(p=>p.keys?.includes('approach_motif_latch')&&!p.keys.some(k=>/^approach_bank_/.test(k??''))),'Shared settings have their own panel');
    for(let bank=0;bank<2;bank++){
        const bankPage=page.ctl.pages.find(p=>p.keys?.includes('approach_bank_'+(bank*8+1)));
        assert.deepEqual(bankPage.keys,Array.from({length:8},(_,index)=>'approach_bank_'+(bank*8+index+1)),'All sixteen assignments retain their slot IDs');
    }
    const settingsIndex=order('approach_motif_latch');
    const assignmentIndex=order('approach_bank_1');
    const beforeSettings=writes.length;
    page.goToPage(settingsIndex);
    assert.deepEqual(page.ctl.page.keys,['key_center','parallel_mode','approach_motif_latch','motion_control_32','dominant_color','target_scale_source']);
    assert.equal(page.pageTitle,'Harm Play Settings');
    const settingsOwner=hbPerformancePage();assert(settingsOwner);
    for(let step=0;step<16;step++){
        hbPerformanceStep([0x90,16+step,100],settingsOwner);
        now+=40;hbPerformanceStep([0x80,16+step,0],settingsOwner);
        assert(writes.slice(beforeSettings).some(([,key,value])=>key==='midi_fx1:approach_step_touch_'+(step+1)&&value==='Down'));
        assert(writes.slice(beforeSettings).some(([,key,value])=>key==='midi_fx1:approach_step_touch_'+(step+1)&&value.startsWith('Up,')));
    }
    page.knobTouch(5,true);page.knobTurn(5,63);page.knobTouch(5,false);
    assert(writes.slice(beforeSettings).some(([,key,value])=>key==='midi_fx1:target_scale_source'&&value==='Simplified'),'Settings knobs edit scale policy alongside step performance');
    page.knobTouch(4,true);assert.deepEqual(writes.at(-1).slice(1),['midi_fx1:dominant_color','Down']);
    page.knobTouch(4,false);assert.deepEqual(writes.at(-1).slice(1),['midi_fx1:dominant_color','Up']);
    page.knobTurn(4,1);assert.deepEqual(writes.at(-1).slice(1),['midi_fx1:dominant_color','LatchOn']);
    page.knobTurn(4,-1);assert.deepEqual(writes.at(-1).slice(1),['midi_fx1:dominant_color','LatchOff']);
    appState.shiftHeld=true;page.knobTouch(4,true);page.knobTurn(4,1);
    assert.equal(page.ctl.state.peek.title,'Dominant Color');
    assert.equal(writes.at(-1)[1],'midi_fx1:dominant_color_family');
    page.knobTouch(4,false);appState.shiftHeld=false;
    page.goToPage(assignmentIndex);
    assert(!writes.slice(beforeSettings).some(([,key])=>key.endsWith(':performance_reset')||/^midi_fx1:approach_bank_/.test(key)),'Panel navigation preserves assignments and latches');
    assert.equal(page.ctl.metaAt(0).options.length,61);
    assert.deepEqual(page.ctl.metaAt(0).options.slice(2,8),['Secondary II','Secondary III','Secondary IV','Secondary Fifth','Secondary VI','Secondary VII']);
    assert.deepEqual(page.ctl.metaAt(0).options.slice(-16),Array.from({length:16},(_,index)=>'User '+(index+1)));
    assert(page.ctl.metaAt(0).options.includes('Stock: vi-ii-V'));
    assert(page.ctl.metaAt(0).options.includes('Connector Below'));
    assert(page.ctl.metaAt(0).options.includes('Secondary VII'));
    assert(page.ctl.metaAt(0).options.includes('Leading Tone'));
    assert(page.ctl.metaAt(0).options.includes('Upper Dim'));
    assert(!page.ctl.metaAt(0).options.includes('Scale Above'));
    assert(!page.ctl.metaAt(0).options.includes('Chromatic Below'));
    const {keyboardState: approachKeyboard}=await import('../dist/esm/keyboard/state.js');
    approachKeyboard.layout=2;
    page.knobTouch(0,true);page.knobTouch(1,true);
    assert(writes.some(([,key,value])=>key==='midi_fx1:approach_touch_1'&&value==='Down'));
    assert(writes.some(([,key,value])=>key==='midi_fx1:approach_touch_2'&&value==='Down'));
    page.knobTurn(0,1);page.knobTouch(0,false);page.knobTouch(1,false);
    assert(!writes.some(([,key])=>key==='midi_fx1:approach_control_1'),'Approach knob never latches');
    assert(!has(page,'approach_latch'));
    assert(order('approach_bank_1')>order('monitor_status'));
    const beforePlainTurn=writes.length;page.knobTurn(0,-1);assert.equal(writes.length,beforePlainTurn,'Unshifted approach turn does nothing');
    const beforeEdit=writes.length;
    appState.shiftHeld=true;page.knobTouch(0,true);page.knobTurn(0,1);assert.equal(page.ctl.state.peek?.title,'Connectors');assert.equal(writes.at(-1)[2],page.ctl.state.peek.options[page.ctl.state.peek.index]);assert(page.ctl.state.peek.options.length>1);page.knobTouch(0,false);appState.shiftHeld=false;
    assert(writes.slice(beforeEdit).some(([,key])=>key==='midi_fx1:approach_bank_1'),'Shift-turn edits the assignment');
    assert(!writes.slice(beforeEdit).some(([,key])=>/approach_touch_|approach_control_/.test(key)),'Shift editing does not trigger or latch');
    page.knobTouch(0,true);appState.shiftHeld=true;page.knobTurn(0,-1);page.knobTouch(0,false);appState.shiftHeld=false;
    assert(writes.some(([,key,value])=>key==='midi_fx1:approach_touch_1'&&value==='Cancel'),'Shift after touch cancels the trigger');
    approachKeyboard.layout=0;
    page.knobTurn(0,1);assert.equal(writes.at(-1)[1],'midi_fx1:approach_control_1');assert.equal(writes.at(-1)[2],'LatchOn');assert.equal(page.ctl.state.peek?.title,'Latched On');
    page.knobTurn(0,-1);assert.equal(writes.at(-1)[2],'LatchOff');
    approachKeyboard.layout=3;const beforeTripleTurn=writes.length;page.knobTurn(0,1);assert.equal(writes.length,beforeTripleTurn);
    approachKeyboard.layout=0;
    const owner=hbPerformancePage();assert(owner);
    hbPerformanceStep([0x90,16,100],owner);hbPerformanceStep([0x80,16,0],owner);
    assert(writes.some(([,key,value])=>key==='midi_fx1:approach_step_touch_1'&&value==='Down'));
    tap();assert.equal(flagValue('hbsteprow'),0);assert(page.ctl.page.keys.includes('version'));
    assert(!has(page,'motif_record'),'Motif editor has no permanent performance bank');
    assert(has(page,'monitor_status'),'Steps restores setup and diagnostics');
    beforeCopy=contractReads;
    tap();assert.equal(contractReads,beforeCopy,'Copy layout reuses contract without DSP reads');assert.equal(flagValue('hbsteprow'),1);
    setFlag('hbsteprow',0);schwungActiveFor(4,'midi_fx1');setFlag('hbsteprow',1);
    switchToTrack(4,beginTrackSwitch());const target=schwungActiveFor(4,'midi_fx1');
    assert(has(target,'motion_control_1'));assert(!has(target,'motif_record'));
    heldOwner=hbPerformancePage();assert(heldOwner);
    hbPerformanceStep([0x90,16,100],heldOwner);hbPerformanceStep([0x80,16,0],heldOwner);
    beforeNavigation=writes.length;
    tap();assert(!writes.slice(beforeNavigation).some(([,key])=>key.endsWith(':performance_reset')),'Navigation must not reset musical state');assert.equal(flagValue('hbsteprow'),2);tap();assert.equal(flagValue('hbsteprow'),0);assert(target.ctl.page.keys.includes('version'));
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

const {buildPadMap,MODE_IN_KEY,LAYOUT_TRIPLE_APPROACH}=await import('../dist/esm/keyboard/layouts.js');
const triple=buildPadMap(MODE_IN_KEY,LAYOUT_TRIPLE_APPROACH,0,60);
assert.deepEqual(Array.from(triple.slice(0,8)),[60,62,64,65,67,69,71,72]);
assert(Array.from(triple.slice(8)).every(note=>note===-1),'Three upper rows use explicit approach routing');
console.log('Triple Approach geometry: eight scale targets and three paired approach rows pass');

// Row display mirrors the hardware: oldest at top (3), newest at bottom (1).
{
    const { approachTouched, approachRowLines, drawApproachRows } = await import('../dist/esm/renderer/hb-approach.js');
    const mock={performanceTrack:0,performanceSet(){},performanceGet(key){return key==='approach_rows_view'?'3,Secondary V|2,Secondary II|1,Secondary VI':'1,0,1,0,-1,0,0,2,0,2,1,0';}};
    approachTouched(mock);
    assert.deepEqual(approachRowLines(),['3  1: Secondary VI','2  2: Secondary II','1  3: Secondary V']);
    drawApproachRows(mock);
}
console.log('FIFO row display: physical top-down 3-2-1 order and newest assignment pass');

// Generic value lights must not repaint LEDs owned by performance controls.
{
    const { updateKnobLEDs, resetKnobLedCache }=await import('../dist/esm/renderer/knob-leds.js');
    const { ledFrameReset }=await import('../dist/esm/seq/led-cache.js');
    const sends=[];const note=globalThis.setLED,button=globalThis.setButtonLED;
    globalThis.setLED=(...args)=>sends.push(args);globalThis.setButtonLED=(...args)=>sends.push(args);
    try{
        const vm={rows:Array.from({length:2},()=>Array.from({length:4},()=>({normalizedValue:1})))};
        resetKnobLedCache();ledFrameReset();updateKnobLEDs(vm,255);assert.equal(sends.length,0);
        ledFrameReset();updateKnobLEDs(vm,0);assert.equal(sends.length,16,'Leaving performance restores generic value LEDs');assert(sends.every(args=>args[1]===120),'Both parameter rows use white');
    }finally{globalThis.setLED=note;globalThis.setButtonLED=button;}
}
console.log('Knob LED ownership: generic values yield to performance and restore on exit');

{
    const { approachLight }=await import('../dist/esm/renderer/hb-approach.js');
    const { ANIM_NONE, ANIM_PULSE_SLOW }=await import('../dist/esm/seq/colors.js');
    const state=[1,0,1,0,-1,1,1,2,0,2,4,4];
    assert.deepEqual(approachLight(0,state),[120,120,ANIM_NONE]);
    state[8]=1;assert.deepEqual(approachLight(0,state),[124,120,ANIM_PULSE_SLOW]);
    state[9]=0;assert.deepEqual(approachLight(0,state),[124,120,ANIM_PULSE_SLOW],'Selected latch pulses white');
    state[9]=2;
    state[3]=1;assert.deepEqual(approachLight(0,state),[120,120,ANIM_NONE]);
    assert.deepEqual(approachLight(1,state),[0,0,ANIM_NONE]);
    const {keyboardState}=await import('../dist/esm/keyboard/state.js');
    keyboardState.layout=0;assert.deepEqual(approachLight(2,state),[0,0,ANIM_NONE]);assert.deepEqual(approachLight(4,state),[0,0,ANIM_NONE]);
    keyboardState.layout=3;assert.deepEqual(approachLight(4,state),[0,0,ANIM_NONE]);keyboardState.layout=0;
}
console.log('Approach lights: dark idle, solid white trigger/hold, smooth white latch, amber for every row assignment');

// The first hosted track can expose its hierarchy before DSP metadata is ready.
{
    const { createSchwungPage } = await import('../dist/esm/renderer/schwung-page.js');
    const startupPort = portFor(14);
    const originalGet = startupPort.getParam;
    const originalClock = Date.now;
    let startupNow = 100000;
    Date.now = () => startupNow;
    setFlag('hbsteprow', 0);
    try {
        for (const missing of ['', '[]', '{', null]) {
            let metadataReady = false;
            let metadataReads = 0;
            startupPort.getParam = key => {
                if (key === 'midi_fx1:chain_params') {
                    metadataReads++;
                    return metadataReady ? JSON.stringify(module.capabilities.chain_params) : missing;
                }
                return originalGet(key);
            };
            const startupPage = createSchwungPage(startupPort, 'midi_fx1');
            assert(startupPage.ready, 'Hierarchy-only startup already has drawable pages');
            assert(!startupPage.ctl.state.chainParams?.length);
            startupPage.ctl.goToPage(2);
            metadataReady = true;
            startupNow += 1001;
            startupPage.tick();
            assert.equal(startupPage.ctl.state.chainParams.length, module.capabilities.chain_params.length);
            assert.equal(startupPage.ctl.state.pageIndex, 2, 'Metadata recovery preserves the selected panel');
            for (const key of ['version', 'render_channel', 'receive_channel']) {
                const expected = module.capabilities.chain_params.find(parameter => parameter.key === key);
                const actual = startupPage.ctl.state.metaIndex.get(key);
                assert.equal(actual.name, expected.name);
                assert.equal(actual.type, expected.type);
            }
            const readsAfterRecovery = metadataReads;
            for (let tick = 0; tick < 5; tick++) {
                startupNow += 1001;
                startupPage.tick();
            }
            assert.equal(metadataReads, readsAfterRecovery, 'Complete HB metadata stops startup polling');
        }
    } finally {
        startupPort.getParam = originalGet;
        Date.now = originalClock;
    }
}
console.log('Startup metadata: empty, malformed and timed-out reads recover without ongoing polling');

// The inverse startup race: DSP parameters arrive before the page hierarchy.
// A generic chain-parameter page is drawable, but is not a complete HB contract.
{
    const { createSchwungPage } = await import('../dist/esm/renderer/schwung-page.js');
    const startupPort = portFor(14), originalGet = startupPort.getParam;
    const originalClock = Date.now;
    let now = 200000;
    Date.now = () => now;
    setFlag('hbsteprow', 0);
    try {
        const healthy = createSchwungPage(startupPort, 'midi_fx1');
        const layout = p => p.ctl.pages.map(page => [page.name, page.keys]);
        for (const missing of ['', '{}', '[]', '{', null]) {
            let hierarchyReady = false, hierarchyReads = 0;
            startupPort.getParam = key => {
                if (key === 'midi_fx1:ui_hierarchy') {
                    hierarchyReads++;
                    return hierarchyReady ? originalGet(key) : missing;
                }
                return originalGet(key);
            };
            const startup = createSchwungPage(startupPort, 'midi_fx1');
            hierarchyReady = true;
            now += 1001;
            for (let tick = 0; tick < 12; tick++) startup.tick();
            assert(startup.ctl.state.hierarchy?.levels?.root,
                `Late hierarchy must replace generic startup pages (${String(missing)})`);
            assert.deepEqual(layout(startup), layout(healthy));
            assert.equal(startup.ctl.state.metaIndex.get('track_role').type, 'enum');
            const settledReads = hierarchyReads;
            for (let tick = 0; tick < 5; tick++) { now += 1001; startup.tick(); }
            assert.equal(hierarchyReads, settledReads, 'Complete layout stops startup metadata reads');
        }
    } finally { startupPort.getParam = originalGet; Date.now = originalClock; }
}
console.log('Startup hierarchy: late layout replaces generic pages and then stops polling');

// Schwung's native module.json fallback is nonempty but loses string types,
// read-only flags and options_as_string (chain_host.c's MIDI FX fallback).
{
    const { createSchwungPage } = await import('../dist/esm/renderer/schwung-page.js');
    const port = portFor(14), originalGet = port.getParam, originalClock = Date.now;
    const fallback = process.env.HB_FALLBACK ? JSON.parse(readFileSync(process.env.HB_FALLBACK,'utf8')) : module.capabilities.chain_params.slice(0, 256).map(p => ({
        key:p.key, name:p.name, type:['int','enum'].includes(p.type)?p.type:'float',
        ...(p.type === 'enum' ? {options:p.options} : {min:p.min??0,max:p.max??1}),
    }));
    let ready = false, reads = 0, now = 300000;
    Date.now = () => now; setFlag('hbsteprow',0);
    port.getParam = key => {
        if(key==='midi_fx1:chain_params') { reads++;return JSON.stringify(ready?module.capabilities.chain_params:fallback); }
        return originalGet(key);
    };
    try {
        const page = createSchwungPage(port,'midi_fx1');
        assert(page.ready && page.ctl.state.chainParams.length, 'Fallback looks complete to a length-only check');
        assert.equal(page.ctl.state.metaIndex.get('version').type,'float','Reproduces the erroneous Version dial');
        for(const reinstall of [false,true]) {
            if(reinstall){ready=false;page.reload();}
            ready=true;now+=1001;page.tick();
            assert.equal(page.ctl.state.metaIndex.get('version').type,'string','Recover read-only version widget');
            assert.equal(page.ctl.state.metaIndex.get('track_role').options_as_string,true,'Recover named enum writes');
            assert.equal(page.ctl.state.chainParams.length,module.capabilities.chain_params.length);
            const settled=reads;now+=1001;page.tick();assert.equal(reads,settled);
        }
    } finally {port.getParam=originalGet;Date.now=originalClock;}
}
console.log('Native fallback: Version dial and enum metadata recover, including same-track reinstall');
