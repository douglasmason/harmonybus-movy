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
