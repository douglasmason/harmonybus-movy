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
        frame[markerIndex]='2.00';frame[7]='G7';liveFrame='dp1|'+frame.join('|');
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
