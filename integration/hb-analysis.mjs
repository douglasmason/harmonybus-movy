import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installEnv } from './env.mjs';
import { installMockEngine } from './mock-engine.mjs';
const env = installEnv();
const engine = installMockEngine();
const module = JSON.parse(readFileSync(process.env.HB_MODULE, 'utf8'));
const params = {
    midi_fx1_module: 'harmonybus',
    'midi_fx1:name': 'Harmony Bus',
    'midi_fx1:ui_hierarchy': JSON.stringify(module.capabilities.ui_hierarchy),
    'midi_fx1:chain_params': JSON.stringify(module.capabilities.chain_params),
    ...Object.fromEntries(module.capabilities.chain_params.map(p => ['midi_fx1:' + p.key, String(p.default ?? p.options?.[0] ?? '--')])),
};
let frame = 'fp1|G4|5th|3rd|E4|--|--|--|--';
let reads = 0;
const port = {track:{index:0},bulkReads:false,
    getParam(key) { if(key === 'midi_fx1:follower_snapshot') {reads++;return frame;} return params[key] ?? ''; },
    setParam() { throw new Error('Analysis must never write'); },
};
const { createModel } = await import('../dist/esm/model/index.js');
const fallbackModel = createModel(port,'midi_fx1');
fallbackModel.reloadNow();
for(let index=0;index<100 && fallbackModel.getKnobParamInfo(0)?.key!=='fpath_0_0_0';index++)fallbackModel.changePage(1);
assert.equal(fallbackModel.getKnobParamInfo(0)?.key,'fpath_0_0_0');
const savedNow=Date.now;
let now=100000;
Date.now=()=>now;
try {
    fallbackModel.tick();
    const texts=()=>fallbackModel.getViewModel().rows.flat().filter(Boolean).map(p=>p.displayValue);
    assert.deepEqual(texts(),frame.split('|').slice(1),'Fallback renderer receives a complete frame');
    frame='fp1|G4|5th|Root|A4|C4|Root|5th|E4';
    now+=40;fallbackModel.tick();
    assert.deepEqual(texts(),frame.split('|').slice(1),'Both fallback rows update together');
    const before=reads;
    for(let index=0;index<20;index++)fallbackModel.tick();
    assert.equal(reads,before,'Fallback refresh is bounded');
    frame='';now+=40;fallbackModel.tick();
    assert.equal(texts()[0],'G4','Unavailable frame retains previous row');
} finally {Date.now=savedNow;}
console.log('Fallback analysis: full rendered rows, bounded reads, failed-read retention pass');

// Exercise the actual app dirty gate with a real Schwung page. Keep Movy's
// independent model quiet so it cannot accidentally trigger the redraw.
await import('../dist/esm/app/globals.js');
const { appState, VIEW_CHAIN } = await import('../dist/esm/app/state.js');
const { setFlag } = await import('../dist/esm/seq/flags.js');
const { schwungPageFor } = await import('../dist/esm/renderer/schwung-grid.js');
const { resetSeqState } = await import('../dist/esm/seq/state.js');
const { resetSeqEngine } = await import('../dist/esm/seq/engine.js');
engine.reset();resetSeqState();resetSeqEngine();
setFlag('chtracks',0);setFlag('setcommit',0);
env.setParams(params);
const oldRead=globalThis.shadow_get_param;
globalThis.shadow_get_param=(slot,key)=>key==='midi_fx1:follower_snapshot' ? (reads++,frame) : oldRead(slot,key);
globalThis.init();
appState.currentView=VIEW_CHAIN;
const index=appState.trackModels[0].findIndex(model=>model.getComponentKey()==='midi_fx1');
assert(index>=0);appState.trackChainIndex[0]=index;
const model=appState.trackModels[0][index];model.reload();
for(let tick=0;tick<30;tick++)globalThis.tick();
const page=schwungPageFor(0,'midi_fx1');
const pageIndex=page.ctl.pages.findIndex(candidate=>candidate.keys?.includes('fpath_0_0_0'));
assert(pageIndex>=0);page.goToPage(pageIndex);
model.tick=()=>false;
frame='fp1|G4|5th|3rd|E4|--|--|--|--';
now=savedNow()+10000;Date.now=()=>now;
try {
    appState.dirty=false;globalThis.tick();
    assert.equal(page.ctl.state.values.fpath_0_0_3,'E4');
    frame='fp1|G4|5th|Root|A4|--|--|--|--';now+=40;
    appState.dirty=false;globalThis.tick();
    assert.deepEqual(page.ctl.page.keys.map(key=>page.ctl.state.values[key]),frame.split('|').slice(1),'Quiet app still publishes the entire changed frame');
    const originalRender=page.render,originalTick=model.tick;
    let paints=0,refreshes=[];
    page.render=(...args)=>{paints++;return originalRender(...args);};
    model.tick=(refresh=true)=>{refreshes.push(refresh);return false;};
    try {
        const before=reads;paints=0;
        for(let index=0;index<100;index++){now+=10;appState.dirty=false;globalThis.tick();}
        assert.equal(reads-before,25,'unchanged diagnostics retain 25Hz acquisition');
        assert.equal(paints,0,'unchanged diagnostic values do not redraw the hosted page');
        assert.equal(refreshes.length,100,'covered model lifecycle continues every tick');
        assert(refreshes.every(refresh=>refresh===false),'covered model does not duplicate diagnostic value reads');
        const accepted=page.ctl.page.keys.map(key=>page.ctl.state.values[key]);
        frame='fp1|partial';now+=40;appState.dirty=false;globalThis.tick();
        assert.equal(paints,0,'invalid snapshots retain the old display without redraw');
        assert.deepEqual(page.ctl.page.keys.map(key=>page.ctl.state.values[key]),accepted);
        frame='fp1|C4|Root|3rd|E4|G4|5th|Root|C5';now+=40;appState.dirty=false;globalThis.tick();
        assert.equal(paints,1,'recovery paints a changed complete frame immediately');
        assert.deepEqual(page.ctl.page.keys.map(key=>page.ctl.state.values[key]),frame.split('|').slice(1));
        frame='fp1|D4|Root|3rd|F#4|A4|5th|Root|D5';now-=1000;appState.dirty=false;globalThis.tick();
        assert.equal(paints,2,'clock rollback cannot freeze diagnostic acquisition');
        page.reload();now+=1;appState.dirty=false;globalThis.tick();
        assert.equal(page.ctl.state.values.fpath_0_0_3,'F#4','reload refreshes a same-kind snapshot');
        console.log('Diagnostic redraw work: 100 idle ticks, 25 snapshots, 0 page redraws, 0 covered model value polls');
    } finally {page.render=originalRender;model.tick=originalTick;}

} finally {Date.now=savedNow;globalThis.shadow_get_param=oldRead;}
console.log('Real app analysis: held-note refresh does not depend on control-model dirtiness');

// A real MIDI touch must repaint a hosted page even when Movy's model is quiet.
const painted=[];
const previousFill=globalThis.fill_rect;
globalThis.fill_rect=(...args)=>{painted.push(args);previousFill?.(...args);};
try {
    for(const key of ['arp_hold','travel_map','next_anti_buffer_ms']) {
        const index=page.ctl.pages.findIndex(candidate=>candidate.keys?.includes(key));
        assert(index>=0);page.goToPage(index);
        appState.dirty=true;globalThis.tick();
        const slot=page.ctl.page.keys.indexOf(key);
        painted.length=0;appState.dirty=false;
        globalThis.onMidiMessageInternal([0x90,slot,127]);
        assert(appState.dirty,'Knob touch must request a redraw without any turn');
        globalThis.tick();
        assert.equal(page.ctl.describePage().header.left,page.ctl.metaAt(slot).name);
        assert(painted.some(([x,y,w,h,color])=>x===0&&y===0&&w===128&&h>=7&&color===1),'Touch paints full-name/value header');
        painted.length=0;appState.dirty=false;
        globalThis.onMidiMessageInternal([0x90,slot,0]);
        assert(appState.dirty,'Release must request a redraw');globalThis.tick();
        assert.equal(page.ctl.describePage().header.inverted,false);
    }
} finally {globalThis.fill_rect=previousFill;}
console.log('Real MIDI knob touch/release redraws arp, follower and lookahead pages without turning');

// A consumed trigger changes DSP status, not parameter values. Exercise the
// real app dirty gate with a deliberately quiet control model, on both banks.
const oldStatusRead=globalThis.shadow_get_param,oldSend=globalThis.move_midi_internal_send;
const feedbackPackets=[];let activeMask=0,statusReads=0;
globalThis.move_midi_internal_send=packet=>feedbackPackets.push([...packet]);
globalThis.shadow_get_param=(slot,key)=>{
    if(key==='midi_fx1:motion_lights'){statusReads++;return [activeMask,0,0,...Array(16).fill(22)].join(',');}
    if(key==='midi_fx1:motion_named_lights'){statusReads++;return [activeMask,0,0,...Array(35).fill(22)].join(',');}
    return oldStatusRead(slot,key);
};
setFlag('hbsteprow',1);page.reload();
now=savedNow()+100000;Date.now=()=>now;
try {
    for(const key of ['motion_control_1','motion_control_20']){
        setFlag('hbsteprow',key==='motion_control_1'?1:2);page.reload();
        const pageIndex=page.ctl.pages.findIndex(candidate=>candidate.keys?.includes(key));assert(pageIndex>=0);page.goToPage(pageIndex);
        const knob=page.ctl.page.keys.indexOf(key),lane=Number(key.slice(15))-1;
        activeMask=2**(lane<16?lane:lane-16);
        appState.dirty=false;globalThis.tick();
        assert(feedbackPackets.some(packet=>packet[1]===0x90&&packet[2]===knob&&packet[3]!==0),'Quiet app lights armed trigger');
        const readsBefore=statusReads;
        for(let frameIndex=0;frameIndex<5;frameIndex++)page.pollOperationFeedback();
        assert.equal(statusReads,readsBefore,'Repeated feedback polls share the 50ms snapshot');
        feedbackPackets.length=0;activeMask=0;now+=50;appState.dirty=false;
        let rendered=false;const originalRender=page.render;page.render=(...args)=>{rendered=true;originalRender(...args);};
        try {globalThis.tick();} finally {page.render=originalRender;}
        assert(feedbackPackets.some(packet=>packet[1]===0x90&&packet[2]===knob&&packet[3]===0),'Consumed trigger clears at the next status poll without knob movement');
        assert(rendered,'Consumed trigger requests its display update too');
        feedbackPackets.length=0;now+=100;
    }
} finally {Date.now=savedNow;globalThis.shadow_get_param=oldStatusRead;globalThis.move_midi_internal_send=oldSend;}
console.log('Quiet app: user/named trigger LEDs and display clear within the 50ms poll window; shared reads stay bounded');

// Position and detection pages publish every visible cell in one read, even
// when Movy's parameter model reports no changes at all.
setFlag('hbsteprow',0);page.reload();
const liveRead=globalThis.shadow_get_param;
const livePages=[['shared_context_0','shared_context_snapshot'],['next_position','next_harm_snapshot'],['timing_position','grid_timing_snapshot'],['inferred_root','follower_root_snapshot']];
let liveEndpoint='',liveFrame='',liveReads=0,cellReads=0,liveKeys=[];
globalThis.shadow_get_param=(slot,key)=>{
    if(key==='midi_fx1:'+liveEndpoint){liveReads++;return liveFrame;}
    if(liveKeys.some(field=>key==='midi_fx1:'+field))cellReads++;
    return liveRead(slot,key);
};
now=savedNow()+200000;Date.now=()=>now;
try {
    for(const [marker,endpoint] of livePages){
        const pageIndex=page.ctl.pages.findIndex(candidate=>candidate.keys?.includes(marker));assert(pageIndex>=0);
        page.goToPage(pageIndex);liveKeys=[...page.ctl.page.keys];liveEndpoint=endpoint;
        const frame=liveKeys.map(key=>String(params['midi_fx1:'+key]??'--'));
        const markerIndex=liveKeys.indexOf(marker);frame[markerIndex]='1.00';
        liveFrame='dp1|'+frame.join('|');now+=40;appState.dirty=false;globalThis.tick();
        assert.deepEqual(liveKeys.map(key=>page.ctl.state.values[key]),frame,endpoint+' publishes the complete initial page');
        frame[markerIndex]='2.00';frame[frame.length-1]='G7';liveFrame='dp1|'+frame.join('|');
        liveReads=cellReads=0;now+=40;appState.dirty=false;globalThis.tick();
        assert.deepEqual(liveKeys.map(key=>page.ctl.state.values[key]),frame,endpoint+' publishes position and harmony together');
        assert.equal(liveReads,1,'One host snapshot per refresh');assert.equal(cellReads,0,'No individual cell sweep');
        for(let repeat=0;repeat<10;repeat++)page.tick();assert.equal(liveReads,1,'Repeated ticks share the 40ms budget');
        liveFrame='dp1|partial';now+=40;appState.dirty=false;globalThis.tick();
        assert.deepEqual(liveKeys.map(key=>page.ctl.state.values[key]),frame,'Incomplete snapshot retains the complete old frame');
    }
} finally {Date.now=savedNow;globalThis.shadow_get_param=liveRead;}
console.log('Live display snapshots: Next Harm, Chord Timing and Follower Root update together at 25Hz without per-cell reads');

// Rejected Full Both Lookahead frames must retry intact; accepted frames
// disappear from the app's next color diff.
{
    const read=globalThis.shadow_get_param,send=globalThis.move_midi_internal_send,clock=Date.now;
    const {keyboardState}=await import('../dist/esm/keyboard/state.js');
    const {seqState}=await import('../dist/esm/seq/state.js');
    let frameTime=clock()+400000, reject=false, next=false;
    const batches=[];
    Date.now=()=>frameTime;
    seqState.playing=false;seqState.sessionMode=false;
    keyboardState.mode=0;keyboardState.layout=0;
    setFlag('hbsteprow',0);page.reload();page.goToPage(0);
    globalThis.shadow_get_param=(slot,key)=>key==='midi_fx1:pad_view'
        ? `${next?0:4095},4095,4095,1,4095,6,0,3,2,0|full1,1,${next?4095:0}`
        : read(slot,key);
    globalThis.move_midi_internal_send=packets=>{
        if(packets.length===4&&(packets[1]&0xf0)===0x90&&packets[2]>=68&&packets[2]<100){batches.push([...packets]);return !reject;}
        return send(packets);
    };
    try {
        for(let tick=0;tick<4;tick++){frameTime+=100;globalThis.tick();}
        batches.length=0;next=true;reject=true;frameTime+=100;globalThis.tick();
        assert.equal(batches.length,32,'All 32 changed pads are submitted individually');
        const rejected=batches.slice();assert.equal(new Set(rejected.map(packet=>packet[2])).size,32);
        reject=false;frameTime+=100;globalThis.tick();
        assert.equal(batches.length,64);assert.deepEqual(batches.slice(32),rejected,'Rejected colors remain dirty and retry intact');
        frameTime+=100;globalThis.tick();assert.equal(batches.length,64,'Accepted colors are cached');
    } finally {globalThis.shadow_get_param=read;globalThis.move_midi_internal_send=send;Date.now=clock;}
}
console.log('Full Both Lookahead: actual app delivers all pads and retries rejected colors');

// The ordinary Normal Play settings surface used to force 25 whole redraws/s.
// Keep its existing control model quiet, but observe whether it was asked to poll.
{
    const settings=await import('../dist/esm/seq/hb-settings.js');
    const {seqState}=await import('../dist/esm/seq/state.js');
    const clock=Date.now,read=globalThis.shadow_get_param,modelTick=model.tick;
    settings.setSettingsOpen(false);seqState.sessionMode=false;setFlag('hbsteprow',0);
    const normal=schwungPageFor(0,'midi_fx1');normal.reload();
    const index=normal.ctl.pages.findIndex(entry=>entry.keys?.includes('inferred_root'));
    assert(index>=0,'Normal Play retains its follower root diagnostics');normal.goToPage(index);
    const keys=[...normal.ctl.page.keys],values=keys.map(key=>String(params['midi_fx1:'+key]??'--'));
    let snapshot='dp1|'+values.join('|'),count=0,paints=0,refreshes=[];
    let time=clock()+600000;Date.now=()=>time;
    globalThis.shadow_get_param=(slot,key)=>key==='midi_fx1:follower_root_snapshot'?(count++,snapshot):read(slot,key);
    const render=normal.render;
    normal.render=(...args)=>{paints++;return render(...args);};
    model.tick=(refresh=true)=>{refreshes.push(refresh);return false;};
    try {
        appState.dirty=true;globalThis.tick();time+=40;globalThis.tick();
        paints=count=0;refreshes=[];const controllerTicks=normal.ctl.state.tickCount;
        for(let index=0;index<100;index++){time+=10;appState.dirty=false;globalThis.tick();}
        assert.equal(count,25,'Normal Play retains 25 diagnostic snapshots/s');
        assert.equal(normal.ctl.state.tickCount-controllerTicks,25,'controller retries and writes retain their existing cadence without painting');
        assert.equal(paints,0,'Normal Play skips unchanged full-page draws');
        assert.equal(refreshes.length,100);assert(refreshes.every(value=>value===false),'Normal Play covered model skips duplicate value polls');
        values[keys.indexOf('inferred_root')]='D';snapshot='dp1|'+values.join('|');
        time+=40;appState.dirty=false;globalThis.tick();assert.equal(paints,1,'changed diagnostic paints without independent model dirtiness');
        snapshot='dp1|partial';time+=40;appState.dirty=false;globalThis.tick();assert.equal(paints,1,'failed diagnostic retains old frame');
        assert.equal(normal.ctl.state.values.inferred_root,'D');
        normal.ctl.state.peek={key:keys[0],title:'Root',options:['Auto'],index:0,at:time};
        appState.dirty=true;globalThis.tick();const withPeek=paints;
        time+=10000;appState.dirty=false;globalThis.tick();
        assert.equal(normal.ctl.state.peek,null,'peek expires while its underlying snapshot is unchanged');
        assert.equal(paints,withPeek+1,'expired overlay repaints the underlying settings exactly once');
        const ordinary=normal.ctl.pages.findIndex(entry=>entry.keys?.includes('play_rotate'));assert(ordinary>=0);
        normal.goToPage(ordinary);refreshes=[];time+=40;globalThis.tick();
        // The visible controller must discover host edits even when the legacy
        // model is on another bank and reports no dirtiness.
        let rotate='0';
        globalThis.shadow_get_param=(slot,key)=>key==='midi_fx1:play_rotate'?rotate:read(slot,key);
        for(let index=0;index<80;index++){time+=40;globalThis.tick();}
        rotate='2';paints=0;
        for(let index=0;index<80;index++){time+=40;appState.dirty=false;globalThis.tick();}
        assert.equal(normal.ctl.state.values.play_rotate,'2','visible settings discover external edits without legacy model dirtiness');
        assert(paints>0,'accepted external edit repaints the visible controls');
        paints=0;refreshes=[];const ordinaryTicks=normal.ctl.state.tickCount;
        for(let index=0;index<100;index++){time+=10;appState.dirty=false;globalThis.tick();}
        assert.equal(normal.ctl.state.tickCount-ordinaryTicks,25,'ordinary visible controller retains bounded polling');
        assert.equal(paints,0,'unchanged ordinary controls do not repaint');
        assert.equal(refreshes.length,100);assert(refreshes.every(value=>value===false),'ordinary shared controls do not duplicate legacy value polls');
        rotate=null;
        for(let index=0;index<40;index++){time+=40;appState.dirty=false;globalThis.tick();}
        assert.equal(normal.ctl.state.values.play_rotate,'2','unavailable host values retain the accepted value');
        assert.equal(paints,0,'failed reads do not repaint unchanged values');
        rotate='3';time-=10000;
        for(let index=0;index<40;index++){time+=40;appState.dirty=false;globalThis.tick();}
        assert.equal(normal.ctl.state.values.play_rotate,'3','clock rewind does not freeze ordinary settings');
        normal.ctl.state.peek={key:'play_rotate',title:'Rotate',options:['0','1'],index:0,at:time};
        appState.dirty=true;globalThis.tick();const ordinaryPeek=paints;
        time+=10000;appState.dirty=false;globalThis.tick();
        assert.equal(normal.ctl.state.peek,null);assert.equal(paints,ordinaryPeek+1,'ordinary enum peek expires with one repaint');
        const send=globalThis.setLED,buttonSend=globalThis.setButtonLED,ledPackets=[];
        globalThis.setLED=(note,color)=>ledPackets.push(['note',note,color]);
        globalThis.setButtonLED=(cc,color)=>ledPackets.push(['cc',cc,color]);
        try {
            const knob=normal.ctl.page.keys.indexOf('play_rotate');
            for(const [value,color] of [['24',120],['-24',124]]){
                rotate=value;ledPackets.length=0;
                for(let index=0;index<40;index++){time+=40;appState.dirty=false;globalThis.tick();}
                assert(ledPackets.some(packet=>packet[0]==='note'&&packet[1]===knob&&packet[2]===color),
                    'knob LED follows the displayed controller value, not the hidden model bank');
                assert(ledPackets.some(packet=>packet[0]==='cc'&&packet[1]===71+knob&&packet[2]===color),'both physical LED addresses use the visible value');
            }
        } finally {globalThis.setLED=send;globalThis.setButtonLED=buttonSend;}
        // A host-native modulation flag/value is presentation state, separate
        // from Movy's abstract musical automation descriptors.
        globalThis.shadow_get_param=(slot,key)=>key==='midi_fx1:play_rotate:modulated'?'1':
            key==='midi_fx1:play_rotate'?'4':read(slot,key);
        for(let index=0;index<80;index++){time+=40;appState.dirty=false;globalThis.tick();}
        assert.equal(normal.ctl.state.modCache.play_rotate,true);
        assert.equal(normal.ctl.state.modValues.play_rotate,'4','upstream controller keeps host-native live values current');
        normal.reload();const reloaded=normal.ctl.pages.findIndex(entry=>entry.keys?.includes('play_rotate'));
        normal.goToPage(reloaded);const afterReload=normal.ctl.state.tickCount;
        time+=1;globalThis.tick();assert(normal.ctl.state.tickCount>afterReload,'reload rearms visible polling immediately');
        const {setSchwungGridMode}=await import('../dist/esm/renderer/schwung-grid.js');
        setSchwungGridMode('off');refreshes=[];time+=40;globalThis.tick();
        assert.deepEqual(refreshes,[true],'fallback controls resume their own value polling');
        setSchwungGridMode('page');
        console.log('Normal Play controls and diagnostics: independent 25Hz polling, zero unchanged redraws, no duplicate model polls, host modulation, failed-read retention, reload, expiry and fallback pass');
    } finally {normal.render=render;model.tick=modelTick;Date.now=clock;globalThis.shadow_get_param=read;}
}
