import assert from 'node:assert/strict';
import {installEnv} from './env.mjs';
installEnv();
const {portFor}=await import('../dist/esm/track/registry.js');
const {padMapFor,keyboardState}=await import('../dist/esm/keyboard/state.js');
const {restoreTrailSettings,trailHistory}=await import('../dist/esm/seq/trail-settings.js');
const {refreshHarmonyPads,harmonyPlaybackColor,withHarmonyPadFrame,finishPadColor,trailPadColor,pianoApproachTarget}=await import('../dist/esm/keyboard/harmony-pads.js');
const track=4,port=portFor(track);let reads=0,writes=0;
const targets=Array(32).fill(-1);targets[0]=62;targets[1]=74;
port.setParam=()=>{writes++;return true;};
port.getParam=key=>{reads++;return key.endsWith('pad_view')?'1,1,4095,1,1,2,0,0,4,2|targets1,'+targets.join(',')+'|th1,8,1;62,8,1':null;};
restoreTrailSettings([1,0,0,4,0,3,0,0,4,1]);
refreshHarmonyPads(track,Date.now());
assert.equal(harmonyPlaybackColor(127,track,0,false),125,'Resolved target receives blue overlay');
assert.equal(harmonyPlaybackColor(127,track,1,false),127,'Other octave remains context in exact-pitch mode');
assert.notEqual(finishPadColor(0,track,127,1/3),125,'Approach row dims blue overlay too');
assert.notEqual(finishPadColor(0,track,127,1/3,true,true),finishPadColor(0,track,127,1,true,true),'Played highlight also respects final row dimming');
const before=reads;
for(let frame=0;frame<100;frame++)withHarmonyPadFrame(()=>harmonyPlaybackColor(127,track,0,false));
assert.equal(reads,before,'Animation never calls native mapping');
restoreTrailSettings([1,1,0,4,0,3,0,0,4,1]);
refreshHarmonyPads(track,Date.now()+100);
assert.equal(harmonyPlaybackColor(127,track,1,false),125,'Pitch-class mode shares octaves');
const raw='th1,8,1;62,8,1';assert.equal(trailHistory.readSnapshot(raw),8);
assert.equal(trailHistory.readSnapshot('th1,8,1;999,8,1'),null);
assert(writes>0);
console.log('Pad trails: sounding-target overlay, octave scope, native snapshot validation and no animation native reads pass');

// The switch affects approach pads only, on both dedicated layouts.
keyboardState.mode=1;keyboardState.rootPc=0;keyboardState.scale=0;
for(const layout of [2,3]){
    keyboardState.layout=layout;
    targets.fill(62);
    port.getParam=key=>key.endsWith('pad_view')?'1,1,4095,1,1,2,0,0,4,2|piano1,1|targets1,'+targets.join(',')+'|th1,8,1;62,8,1':null;
    for(const enabled of [1,0]){
        restoreTrailSettings([1,0,2,4,0,3,0,0,4,1,enabled]);
        refreshHarmonyPads(track,Date.now()+1000+layout*100+enabled*1000);
        assert(pianoApproachTarget(track,8)>=0);
        assert.equal(trailPadColor(8,track,120),enabled?125:120);
        assert.equal(trailPadColor(0,track,120),125,'Target row keeps its trail');
    }
}
