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
 'lfo1:shape':'6','lfo1:target':'synth','lfo1:target_param':'cutoff','lfo1:depth':'0.5','lfo1:polarity':'1','lfo1:enabled':'1','lfo1:active':'1','lfo1:status':'applied',
 'lfo2:shape':'21','lfo2:target':'fx1','lfo2:target_param':'gain','lfo2:depth':'-0.25','lfo2:polarity':'0','lfo2:enabled':'0','lfo2:active':'0','lfo2:status':'disabled',
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
assert.equal(maxKeys,22);assert.equal(writes,0);
assert.equal(routes.fieldRouteStatus(snapshot.routes[0],5000),'Applied');
assert.equal(snapshot.routes[0].base,'20');assert.equal(snapshot.routes[0].effective,'51.75');assert.equal(snapshot.routes[1].channel,16);
snapshot.routes[0].target='corrupt';assert.equal(routes.fieldRoutesSnapshot().routes[0].target,'synth');
assert.equal(routes.fieldRouteStatus(snapshot.routes[1],5000),'Disabled');
routes.stepFieldRoute(1);assert.equal(routes.selectedFieldRoute().slot,2);
params['midi_fx1:bypassed']='1';
for(let now=5125;now<=5500;now+=125)routes.tickFieldRoutes(now);
assert.equal(routes.fieldRouteStatus(routes.selectedFieldRoute(),5500),'HB bypass');
// A target change must never display the old target's value under the new name.
params['lfo2:target_param']='mix';
for(let now=5625;now<=6000;now+=125)routes.tickFieldRoutes(now);
assert.equal(routes.selectedFieldRoute().base,null);
params['lfo1:field_source_version']='';
for(let now=6125;now<=6500;now+=125)routes.tickFieldRoutes(now);
assert.equal(routes.fieldRoutesSnapshot(6500).routes.length,2);
assert.equal(routes.fieldRouteStatus(routes.selectedFieldRoute(),6500),'Unavailable');
assert.equal(routes.fieldRoutesSnapshot(6500).routes[0].observedAt<6125,true);
params['lfo1:field_source_version']='0';
for(let now=6625;now<=7000;now+=125)routes.tickFieldRoutes(now);
assert.equal(routes.fieldRoutesSnapshot(7000).routes.length,0);
params['lfo1:field_source_version']='1';params['lfo2:target_param']='gain';
// Open exact existing LFO slot, preserving routing/parameter state.
seqState.sessionMode=false;field.setFieldEnabled(true);field.showFieldRoutes(true);
for(let now=7000;now<=12000;now+=125)routes.tickFieldRoutes(now);
routes.stepFieldRoute(1);
let page=-1;
appState.trackModels[4]=[];appState.trackModels[4][LFO_CHAIN_INDEX]={reset(){page=0;},changePage(delta){page+=delta;}};
const originalNow=Date.now;Date.now=()=>12000;
assert.equal(routes.fieldRouteStatus(routes.fieldRoutes()[0],12000),'HB bypass');
assert.equal(routes.fieldRouteStatus(routes.fieldRoutes()[0],20000),'Stale');
Date.now=()=>20000;assert.equal(field.openFieldRoute(),false);
Date.now=()=>12000;
const prior=JSON.stringify(params);assert.equal(field.openFieldRoute(),true);Date.now=originalNow;
assert.equal(appState.activeTrack.index,4);assert.equal(appState.currentView,VIEW_KNOBS);assert.equal(page,1);assert.equal(JSON.stringify(params),prior);
assert.equal(routes.routesOpen,false);const closedReads=reads;routes.tickFieldRoutes(20000);field.fieldSnapshot();assert.equal(reads,closedReads);
routes.resetFieldRoutes();assert.equal(routes.fieldRoutesSnapshot().routes.length,0);
console.log('Field status overview: bounded read-only scan, real slot navigation, retarget/unload cleanup, bypass and snapshot isolation passed');
// Status is callback evidence; old HB and partial replies remain distinguishable.
params['midi_fx1:bypassed']='0';routes.setFieldRoutesOpen(true);
for(let now=21000;now<=26000;now+=125)routes.tickFieldRoutes(now);
for(const [status,label] of [['pending','Pending'],['rejected','Rejected'],['applied','Applied'],[null,'Enabled']]){
 params['lfo1:status']=status;
 for(let now=26125;now<=26500;now+=125)routes.tickFieldRoutes(now);
 assert.equal(routes.fieldRouteStatus(routes.fieldRoutes()[0],26500),label);
 routes.resetFieldRoutes();
 for(let now=21000;now<=26000;now+=125)routes.tickFieldRoutes(now);
}
const previousObserved=routes.fieldRoutes()[0].observedAt;
params['lfo1:target_param']=null;
for(let now=26125;now<=26500;now+=125)routes.tickFieldRoutes(now);
assert.equal(routes.fieldRoutes()[0].observedAt,previousObserved);
assert.equal(routes.fieldRouteStatus(routes.fieldRoutes()[0],26500),'Unavailable');
params['lfo1:target_param']='cutoff';
for(let now=26625;now<=27000;now+=125)routes.tickFieldRoutes(now);
assert.equal(routes.fieldRouteStatus(routes.fieldRoutes()[0],27000),'Enabled');
routes.tickFieldRoutes(1);assert.equal(routes.fieldRoutes().length,0,'clock rollback clears old observations');
routes.setFieldRoutesOpen(false);
// Broken or absent bulk transport cannot fan out into blocking per-key reads.
const {resetPorts}=await load('dist/esm/track/registry.js');resetPorts();
const realPort=portFor(4);let singles=0;realPort.getParam=()=>{singles++;return 'fallback';};
globalThis.shadow_get_params=()=> 'malformed';
assert.deepEqual(realPort.getMany(['a','b'],false),[null,null]);assert.equal(singles,0);
assert.deepEqual(realPort.getMany(['a','b']),['fallback','fallback']);assert.equal(singles,2);
globalThis.shadow_get_params=undefined;
assert.deepEqual(realPort.getMany(['a','b'],false),[null,null]);assert.equal(singles,2);
