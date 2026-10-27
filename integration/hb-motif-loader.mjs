import assert from 'node:assert/strict';
import {installEnv} from './env.mjs';
installEnv();
const {installMockEngine,resetSeqEngine,seqEngineTick}=await import('./logic/harness.mjs');
installMockEngine();resetSeqEngine();seqEngineTick();
const {appState}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const loader=await import('../dist/esm/renderer/hb-motif-loader.js');
const {hbStepHierarchy,hbPanelVisible}=await import('../dist/esm/renderer/hb-step-panels.js');
for(let mode=0;mode<3;mode++){
    const h={levels:{root:{params:[]}}};loader.motifLoaderPanels(h);hbStepHierarchy(h,mode);
    assert(hbPanelVisible(h.levels.motif_load.visible_if));assert(hbPanelVisible(h.levels.motif_targets.visible_if));
    assert.equal(h.levels.motif_load.knobs.length,8);assert.equal(h.levels.motif_load.knobs[7],'motif_load_write');
    assert.equal(h.levels.motif_load.params[0].options.length,43);
    assert.deepEqual(h.levels.motif_load.params[7].options,['Fixed','Adaptive']);
    assert.equal(h.levels.motif_load.params[7].default,'Fixed');
}
const actions=Array(52).fill('0');actions[51]='8000000000000040';
let readCount=0,exportMode='Fixed';const writes=[],commands=[];
const originalGet=globalThis.host_module_get_param;
globalThis.host_module_get_param=key=>key.startsWith('motif_clip_info_')?'0,abcdef,16,0,1,1':key==='motif_load_result'?'Written — Undo available':originalGet(key);
globalThis.host_module_set_param_blocking=(key,value)=>commands.push([key,value]);
const port={performanceTrack:appState.activeTrack.index,
    performanceSet:(key,value)=>writes.push([key,value]),
    performanceGet:key=>{readCount++;return key==='motif_load_export_mode'?exportMode:key==='motif_load_adaptive'?'1':key==='motif_load_header'?'ml1,19,768,2,0,1,0':key.startsWith('motif_load_event_')?(key.endsWith('_0')?'0,384,60.100:':'384,384,60.100:')+actions.join(','):key==='motif_load_labels'?'V > T':key==='motif_load_choice'?'V-Target':key==='motif_load_target'?'60':'';}};
assert(loader.motifLoaderTouch(port,'motif_load_write',7,true));
assert(!loader.drawMotifLoader(port),'Touch-down leaves the mode available to turn');
loader.motifLoaderTouch(port,'motif_load_write',7,false);
assert(loader.drawMotifLoader(port));assert.equal(commands.length,0,'Preview cannot edit the clip');
const sampled=readCount;loader.drawMotifLoader(port);assert.equal(readCount,sampled,'Drawing performs no IPC');
loader.motifLoaderTouch(port,'motif_load_write',7,false);
loader.motifLoaderTouch(port,null,0,true);loader.motifLoaderTouch(port,null,0,false);
assert(!loader.drawMotifLoader(port));assert.equal(commands.length,0,'Cancel cannot edit');
loader.motifLoaderTouch(port,'motif_load_write',7,true);loader.motifLoaderTouch(port,'motif_load_write',7,false);
loader.motifLoaderTouch(port,null,3,true);loader.motifLoaderTouch(port,null,3,false);
const command=commands.find(([key,value])=>key==='cmd'&&value.includes('mload'))?.[1];
assert(command&&command.includes('usnap')&&command.includes('ucommit'),'Write uses existing Undo transaction');
assert(command.includes('mload 0 0 abcdef 2 768 0 1 '));assert(command.includes('8000000000000040'),'64-bit action words remain exact');
assert(!loader.drawMotifLoader(port));
seqState.recording=true;const before=writes.length;loader.motifLoaderTouch(port,'motif_load_write',7,true);loader.motifLoaderTouch(port,'motif_load_write',7,false);
assert.equal(writes.length,before,'Recording blocks even preparation');seqState.recording=false;
loader.motifLoaderTouch(port,'motif_load_write',7,true);loader.motifLoaderTouch(port,'motif_load_write',7,false);
appState.activeTrack.index=1;assert(!loader.drawMotifLoader({...port,performanceTrack:1}));
console.log('motif loader UI: panels, immutable preview, cancel, exact actions, Undo transaction and recording/selection guards pass');

appState.activeTrack.index=0;exportMode='Adaptive';
// Extended exact integer words pass through the UI unchanged.
actions[0]='80100003000003e8';actions[51]='0';
loader.motifLoaderTouch(port,'motif_load_write',7,true);loader.motifLoaderTouch(port,'motif_load_write',7,false);
loader.motifLoaderTouch(port,null,1,true);loader.motifLoaderTouch(port,null,1,false);
assert(commands.some(([key,value])=>key==='cmd'&&value.includes('80100003000003e8')));

const modeReads=readCount;
loader.motifLoaderTouch(port,'motif_load_write',7,true);
assert.equal(loader.motifLoaderTurn(port,7,1),false,'Mode turns go to the existing enum controller');
loader.motifLoaderTouch(port,'motif_load_write',7,false);
assert.equal(readCount,modeReads,'Touch-and-turn never opens or replaces a preview');assert(!loader.drawMotifLoader(port));
