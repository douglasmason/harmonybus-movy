import assert from 'node:assert/strict';
import {installEnv} from './env.mjs';
installEnv();
await import('../dist/esm/app/globals.js');
const {TRACK_COUNT}=await import('../dist/esm/track/ref.js');
const {resetSeqEngine,setEditGuard}=await import('../dist/esm/seq/engine.js');
const {resetAutomation,assignLane,requestLaneWarm,laneWarmTick,verifyLaneMappings,
    syncLabelsFromEngine,automationRegistry,clearLane}=await import('../dist/esm/seq/automation.js');
const descriptor=(target='synth',key='cutoff')=>({gi:0,key,ioKey:key,target,
    value:0.5,min:0,max:1,type:'float',automatable:true});
const reset=()=>{resetSeqEngine();resetAutomation();};
const drain=(read,verify)=>{for(let tick=0;tick<96;tick++)laneWarmTick(read,verify);};

// New lanes on every bank receive the same finite post-load recovery window.
reset();
for(let track=0;track<TRACK_COUNT;track++)assignLane(track,track,descriptor(),()=>true);
const reads=[],verified=[];
drain((track,lane)=>reads.push([track,lane]),(track,lane)=>verified.push([track,lane]));
for(let track=0;track<TRACK_COUNT;track++){
    assert.equal(reads.filter(([owner])=>owner===track).length,6,'six bounded reads on track '+(track+1));
    assert.deepEqual(verified[track],[track,0]);
}
drain(()=>assert.fail('completed windows must stay idle'));

// Mixer fields and abstract generator controls have no chain metadata cache.
reset();
for(let track=0;track<TRACK_COUNT;track++){
    assignLane(track,track,descriptor('mix','send1'),()=>true);
    assignLane(track,track,descriptor('generator','density'),()=>true);
    requestLaneWarm(track);
}
drain(()=>assert.fail('virtual lanes must not read host knobs'),()=>assert.fail('no virtual diagnostics'));
for(let track=0;track<TRACK_COUNT;track++)verifyLaneMappings(
    ()=>assert.fail('virtual lanes must not probe mappings'),()=>assert.fail('no virtual remapping'));

// A mixed track warms one lane per chain component and verifies a chain lane.
reset();
const lastTrack=TRACK_COUNT-1;
for(const info of [descriptor('mix','send1'),descriptor('generator','density'),
    descriptor(),descriptor('synth','resonance'),descriptor('fx1','mix')])
    assignLane(lastTrack,lastTrack,info,()=>true);
const mixedReads=[],mixedVerify=[];
drain((track,lane)=>mixedReads.push([track,lane]),(track,lane)=>mixedVerify.push([track,lane]));
assert.equal(mixedReads.length,12);
assert.equal(mixedReads.filter(([,lane])=>lane===2).length,6);
assert.equal(mixedReads.filter(([,lane])=>lane===4).length,6);
assert.deepEqual(mixedVerify,[[lastTrack,2]]);

// A lost mapping is repaired, then its empty metadata cache is warmed too.
const remapped=[];
for(let track=0;track<TRACK_COUNT;track++)verifyLaneMappings(
    (owner,lane)=>{assert.equal(owner,lastTrack);assert.equal(lane,2);return null;},
    (owner,lane,target)=>remapped.push([owner,lane,target]));
assert.deepEqual(remapped,[[lastTrack,2,'synth:cutoff'],[lastTrack,3,'synth:resonance'],[lastTrack,4,'fx1:mix']]);
let repairedReads=0;
drain(()=>repairedReads++);
assert.equal(repairedReads,12,'repair must arm the same bounded recovery');
for(let track=0;track<TRACK_COUNT;track++)verifyLaneMappings(()=> 'synth: cutoff',()=>assert.fail('intact mapping'));
drain(()=>assert.fail('intact mappings must not keep warming'));

// Set restore warms newly restored chain targets, including the final bank.
reset();
const commands=[];setEditGuard(command=>commands.push(command));
try{
    const labels=Array.from({length:TRACK_COUNT},(_,track)=>[
        ...(track===lastTrack?['mix:send1','generator:density','synth:cutoff']:[]),
        ...Array(8).fill('-')].slice(0,8).join('.')).join(',');
    const mappings=[];
    const restore=()=>syncLabelsFromEngine(labels,(track,lane,target)=>mappings.push([track,lane,target]),
        ()=>({min:0,max:1,type:'float'}));
    restore();
    const restoredReads=[];
    drain((track,lane)=>restoredReads.push([track,lane]));
    assert.equal(restoredReads.length,6);
    assert(restoredReads.every(([track,lane])=>track===lastTrack&&lane===2));
    assert.equal(automationRegistry()[lastTrack][1].targetParam,'generator:density');
    assert(mappings.some(([,lane,target])=>lane===0&&target==='mix:send1'),'restore retains mixer mapping');
    assert(!commands.some(command=>command.startsWith('aclr')),'restore retains recorded lanes');
    restore();
    drain(()=>assert.fail('unchanged label sync must not restart recovery'));
    clearLane(lastTrack,2,false);
    requestLaneWarm(lastTrack);
    drain(()=>assert.fail('removed chain lane must not warm remaining virtual lanes'));
}finally{setEditGuard(null);}

// Reset or removal cancels pending work; invalid track requests never escape.
reset();
assignLane(lastTrack,lastTrack,descriptor(),()=>true);
resetAutomation();
for(const track of [-1,TRACK_COUNT,NaN,0.5])requestLaneWarm(track);
drain(()=>assert.fail('reset/invalid requests must not read'));
console.log('Automation recovery: all 16 tracks, bounded reads, component deduplication, restore/remap, virtual-lane isolation and idle/reset cancellation pass');
