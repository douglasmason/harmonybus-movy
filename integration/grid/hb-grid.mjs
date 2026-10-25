import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installEnv} from './env.mjs';
const env=installEnv();await import('../dist/esm/app/globals.js');
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
assert(grid.gridOverview());assert.equal(grid.gridTouchPage(),null,'overview never polls a hidden settings page');
assert.equal(page.keyAt(0),'grid_div');assert.equal(page.keyAt(3),'grid_follow');
page.goToPage(1);assert.equal(page.keyAt(0),'grid_row_0');page.goToPage(0);
assert(!page.ctl.pages.some(panel=>panel.keys?.includes('diagnostics')));
grid.gridMidi([176,14,1]);assert.equal(grid.gridTouchPage(),page);
grid.gridMidi([176,14,127]);assert(grid.gridOverview());
seqState.loopStart=0;seqState.lenSteps=16;seqState.playing=false;
assert.equal(grid.gridWindowLabel(),'B1 1/2');grid.gridNavigate('move',1,0);assert.equal(grid.gridWindowLabel(),'B1 2/2');
grid.gridNavigate('move',1,0);assert.equal(grid.gridWindowLabel(),'B1 2/2','last window clamps to loop');
// Physical arrows and +/- move the grid, independently of the settings panel.
const panelBefore=page.pageIndex;assert(grid.gridMidi([176,62,127]));assert.equal(grid.gridWindow('move').page,0);
assert(grid.gridMidi([176,63,127]));assert.equal(grid.gridWindow('move').page,1);
const laneBefore=grid.gridWindow('move').lane;assert(grid.gridMidi([176,55,127]));assert(grid.gridWindow('move').lane>laneBefore);
assert(grid.gridMidi([176,54,127]));assert.equal(grid.gridWindow('move').lane,laneBefore);assert.equal(page.pageIndex,panelBefore);
grid.gridViews.move.follow=true;
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

seqState.loopStart=16;seqState.lenSteps=32;seqState.playing=false;grid.gridViews.move.page=0;assert.equal(grid.gridWindowLabel(),'B2 1/2');
grid.gridViews.move.division=2;grid.gridViews.move.page=0;assert.equal(grid.gridWindowLabel(),'B1-2');
grid.gridViews.move.division=0;grid.setGridEnabled(true);seqState.playing=true;seqState.posTick=384;grid.gridTick();appState.dirty=false;seqState.posTick=408;grid.gridTick();assert(appState.dirty,'playhead redraws even when event payload is unchanged');
grid.gridAccept('0@384:24:60/1@/2@384:768:'+('3'.repeat(64)),0);grid.renderGrid();
console.log('Grid overview, two windows per bar, clip bounds, shared panel ownership and moving playhead pass');

// Exercise the real app's background feedback owner, with a hidden HB page present.
env.setParams({midi_fx1_module:'harmonybus','midi_fx1:ui_hierarchy':JSON.stringify(module.capabilities.ui_hierarchy),'midi_fx1:chain_params':JSON.stringify(module.capabilities.chain_params)});
setFlag('setcommit',0);globalThis.init();for(let count=0;count<30;count++){now+=100;globalThis.tick();}
const {VIEW_CHAIN}=await import('../dist/esm/app/state.js');
const {schwungPageFor}=await import('../dist/esm/renderer/schwung-grid.js');
appState.currentView=VIEW_CHAIN;seqState.sessionMode=false;
const modelIndex=appState.trackModels[0].findIndex(model=>model.getComponentKey()==='midi_fx1');
appState.trackChainIndex[0]=modelIndex;appState.activeTrack.index=0;
const hidden=schwungPageFor(0,'midi_fx1');let hiddenPolls=0;hidden.pollOperationFeedback=()=>{hiddenPolls++;};
grid.restoreGrid(null);grid.setGridEnabled(true);
for(let count=0;count<3;count++){now+=100;globalThis.tick();}
assert.equal(hiddenPolls,0,'Grid overview must not poll the underlying HB panel');
grid.gridMidi([176,14,1]);const visible=grid.gridPage();let visiblePolls=0;const poll=visible.pollOperationFeedback;visible.pollOperationFeedback=()=>{visiblePolls++;poll();};
for(let count=0;count<3;count++){now+=100;globalThis.tick();}
assert.equal(hiddenPolls,0);assert(visiblePolls>0,'Grid settings own feedback in the actual app tick');
console.log('Real app: Grid owns knob feedback; hidden HB panel cannot repaint it');
// Hidden-event directions follow row order and distinguish unassigned content.
grid.restoreGrid(null);grid.setGridEnabled(true);seqState.reportedTrack=0;
const occupancy=Array(144).fill('0');occupancy[60]='1';occupancy[128]='1';
grid.gridViews.move.lane=4;grid.gridAccept('0@/1@/3@'+occupancy.join(''),0);
assert.equal(grid.gridHiddenDirections(false),'^');assert.equal(grid.gridHiddenDirections(true),'v');
occupancy[55]='1';grid.gridAccept('0@/1@/3@'+occupancy.join(''),0);assert.equal(grid.gridHiddenDirections(false),'^v');
occupancy[61]='1';grid.gridAccept('0@/1@/3@'+occupancy.join(''),0);assert.equal(grid.gridHiddenDirections(false),'^v!');
grid.gridViews.move.lane=0;assert.equal(grid.gridHiddenDirections(false),'v!','visible notes are not counted as hidden');
