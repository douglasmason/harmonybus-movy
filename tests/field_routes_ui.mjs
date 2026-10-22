import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]);
const load=relative=>import(pathToFileURL(root+'/'+relative));
const {installEnv}=await load('browser-test/env.mjs');installEnv();
await load('dist/esm/app/globals.js');
const routes=await load('dist/esm/seq/field-routes.js');
const field=await load('dist/esm/seq/field-play.js');
const {portFor}=await load('dist/esm/track/registry.js');
const {appState,VIEW_KNOBS}=await load('dist/esm/app/state.js');
const {seqState}=await load('dist/esm/seq/state.js');
const {LFO_CHAIN_INDEX}=await load('dist/esm/chain/config.js');
let reads=0,writes=0,maxKeys=0;
const params={
 'lfo1:field_source_version':'1','midi_fx1:bypassed':'0',
 'lfo1:shape':'6','lfo1:target':'synth','lfo1:target_param':'cutoff','lfo1:depth':'0.5','lfo1:polarity':'1','lfo1:enabled':'1','lfo1:active':'1',
 'lfo2:shape':'21','lfo2:target':'fx1','lfo2:target_param':'gain','lfo2:depth':'-0.25','lfo2:polarity':'0','lfo2:enabled':'0','lfo2:active':'0',
 'synth:cutoff:base':'20','synth:cutoff:effective':'51.75','fx1:gain:base':'0.5','fx1:gain:effective':'0.5'
};
for(let track=0;track<16;track++){
 const port=portFor(track);
 port.getMany=keys=>{reads++;maxKeys=Math.max(maxKeys,keys.length);return keys.map(key=>track===4?params[key]??null:null);};
 port.setParam=()=>{writes++;return true;};
}
routes.tickFieldRoutes(0);assert.equal(reads,0);
routes.setFieldRoutesOpen(true);
for(let now=0;now<=5000;now+=125){const before=reads;routes.tickFieldRoutes(now);assert.ok(reads-before<=1);routes.tickFieldRoutes(now+1);assert.ok(reads-before<=1);}
let snapshot=routes.fieldRoutesSnapshot();assert.equal(snapshot.scanned,16);assert.equal(snapshot.routes.length,2);
assert.equal(maxKeys,20);assert.equal(writes,0);
assert.equal(snapshot.routes[0].base,'20');assert.equal(snapshot.routes[0].effective,'51.75');assert.equal(snapshot.routes[1].channel,16);
snapshot.routes[0].target='corrupt';assert.equal(routes.fieldRoutesSnapshot().routes[0].target,'synth');
assert.equal(routes.fieldRouteStatus(snapshot.routes[1]),'Disabled');
routes.stepFieldRoute(1);assert.equal(routes.selectedFieldRoute().slot,2);
params['midi_fx1:bypassed']='1';
for(let now=5125;now<=5500;now+=125)routes.tickFieldRoutes(now);
assert.equal(routes.fieldRouteStatus(routes.selectedFieldRoute()),'HB bypass');
// A target change must never display the old target's value under the new name.
params['lfo2:target_param']='mix';
for(let now=5625;now<=6000;now+=125)routes.tickFieldRoutes(now);
assert.equal(routes.selectedFieldRoute().base,null);
params['lfo1:field_source_version']='';
for(let now=6125;now<=6500;now+=125)routes.tickFieldRoutes(now);
assert.equal(routes.fieldRoutesSnapshot().routes.length,0);
params['lfo1:field_source_version']='1';params['lfo2:target_param']='gain';
// Open exact existing LFO slot, preserving routing/parameter state.
seqState.sessionMode=false;field.setFieldEnabled(true);field.showFieldRoutes(true);
for(let now=7000;now<=12000;now+=125)routes.tickFieldRoutes(now);
routes.stepFieldRoute(1);
let page=-1;
appState.trackModels[4]=[];appState.trackModels[4][LFO_CHAIN_INDEX]={reset(){page=0;},changePage(delta){page+=delta;}};
const prior=JSON.stringify(params);assert.equal(field.openFieldRoute(),true);
assert.equal(appState.activeTrack.index,4);assert.equal(appState.currentView,VIEW_KNOBS);assert.equal(page,1);assert.equal(JSON.stringify(params),prior);
assert.equal(routes.routesOpen,false);const closedReads=reads;routes.tickFieldRoutes(20000);field.fieldSnapshot();assert.equal(reads,closedReads);
routes.resetFieldRoutes();assert.equal(routes.fieldRoutesSnapshot().routes.length,0);
console.log('Field overview: bounded read-only scan, real slot navigation, retarget/unload cleanup, bypass and snapshot isolation passed');
// Broken or absent bulk transport cannot fan out into blocking per-key reads.
const {resetPorts}=await load('dist/esm/track/registry.js');resetPorts();
const realPort=portFor(4);let singles=0;realPort.getParam=()=>{singles++;return 'fallback';};
globalThis.shadow_get_params=()=> 'malformed';
assert.deepEqual(realPort.getMany(['a','b'],false),[null,null]);assert.equal(singles,0);
assert.deepEqual(realPort.getMany(['a','b']),['fallback','fallback']);assert.equal(singles,2);
globalThis.shadow_get_params=undefined;
assert.deepEqual(realPort.getMany(['a','b'],false),[null,null]);assert.equal(singles,2);
