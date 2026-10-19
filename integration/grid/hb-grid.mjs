import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installEnv} from './env.mjs';
installEnv();await import('../dist/esm/app/globals.js');
const grid=await import('../dist/esm/seq/grid.js');
const {appState}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {setFlag}=await import('../dist/esm/seq/flags.js');
const {padsPlayNotes}=await import('../dist/esm/seq/router-pads.js');
const {schwungLibAvailable}=await import('../dist/esm/renderer/schwung-lib.js');
const {installMockEngine}=await import('./mock-engine.mjs');
const {seqEngineTick}=await import('../dist/esm/seq/engine.js');
const {anyStepHeld}=await import('../dist/esm/seq/step-edit.js');
const module=JSON.parse(readFileSync(process.env.HB_MODULE,'utf8'));
for(let track=0;track<16;track++){
 const port=portFor(track),values=new Map(module.capabilities.chain_params.map(meta=>[meta.key,String(meta.default??meta.options?.[0]??'0')]));
 port.getParam=key=>{if(key==='midi_fx1_module')return 'harmonybus';const bare=key.split(':').at(-1);if(bare==='chain_params')return JSON.stringify(module.capabilities.chain_params);if(bare==='ui_hierarchy')return JSON.stringify(module.capabilities.ui_hierarchy);return values.get(bare)??'';};
 port.setParam=(key,value)=>{values.set(key.split(':').at(-1),value);return true;};
 port.getMany=keys=>keys.map(port.getParam);port.setMany=pairs=>pairs.every(([key,value])=>port.setParam(key,value));
}
installMockEngine();seqEngineTick();setFlag('chtracks',1);seqState.reportedTrack=0;seqState.sessionMode=false;
let now=10000;Date.now=()=>now;
grid.restoreGrid(null);grid.setGridEnabled(true);assert.equal(padsPlayNotes(),false,'grid never forwards cell edits to the synth');
assert(schwungLibAvailable());const page=grid.gridPage();for(let tick=0;tick<5;tick++){now+=100;page.tick();}
assert.equal(page.keyAt(0),'grid_row_0','shared panel owns row assignment');assert.equal(page.keyAt(7),'grid_follow');
seqState.playing=true;seqState.posTick=9*24;seqState.lenSteps=32;
assert.equal(grid.gridWindow('move').page,1);grid.gridNavigate('move',-1,0);assert.equal(grid.gridViews.move.follow,false);assert.equal(grid.gridWindow('move').page,0);
assert.equal(grid.gridWindow('launchpad').page,1,'external viewport follows independently');
seqState.playing=false;grid.gridAccept('0@0:24:60/1@192:24:60',0);
assert.equal(grid.gridColors('move',4,8).length,32);assert.equal(grid.gridColors('launchpad',8,8).length,64);assert.notEqual(grid.gridColors('move',4,8)[0],0);
const saved=grid.gridSnapshot();saved[0][0]=128;grid.restoreGrid(saved);grid.setGridEnabled(true);assert.equal(grid.gridSnapshot()[0][0],128);
grid.gridPad('move',0,true,100,4,8,true);grid.gridPad('move',0,false,0);assert(!anyStepHeld(),'operation focus is not note editing');
grid.restoreGrid(null);grid.setGridEnabled(true);seqState.playing=false;
grid.gridPad('move',0,true,100,4,8,true);grid.gridPad('move',0,false,0);assert(anyStepHeld(),'pitch focus reuses step editor');
grid.setGridEnabled(false);assert(!anyStepHeld(),'leaving releases focused step range');assert.equal(padsPlayNotes(),true);
console.log('grid shared panels, independent surfaces, and note ownership passed');
