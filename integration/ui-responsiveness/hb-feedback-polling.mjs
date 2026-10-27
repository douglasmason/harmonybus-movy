// Exercise real feedback painters and ports; count IPC rather than mock time cost.
import assert from 'node:assert/strict';
import {installEnv} from './env.mjs';
installEnv();
await import('../dist/esm/app/globals.js');
const performance=await import('../dist/esm/renderer/hb-performance.js');
const approach=await import('../dist/esm/renderer/hb-approach.js');
const {createSchwungPage}=await import('../dist/esm/renderer/schwung-page.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {setFlag}=await import('../dist/esm/seq/flags.js');
const {encodeBulk}=await import('../dist/esm/track/bulk.js');
let now=10000;Date.now=()=>now;
const noop=()=>{};
const lightFrame=(size,active)=>[active,0,0,...Array(size-3).fill(1)].join(',');
for(const [key,control,size]of [['motion_lights',1,19],['motion_named_lights',17,38]]){
    let reads=0,frame='';
    const port={performanceGet:name=>{if(name===key){reads++;return frame;}return '';},performanceSet:noop};
    const colors=[];
    const paint=()=>performance.paintHbOperationKnobs(port,['motion_control_'+control],{},(knob,base,color)=>{if(knob===0)colors.push(color);});
    for(let index=0;index<100;index++){paint();paint();now+=10;}
    assert.equal(reads,20,key+' failure retries are bounded across both painters');
    frame=lightFrame(size,1);paint();assert.equal(colors.at(-1),120,key+' recovers without a gesture');
    frame='malformed';now+=50;paint();assert.equal(colors.at(-1),120,key+' preserves last valid light');
    const before=reads;paint();assert.equal(reads,before,'failure has the same 50 ms cadence');
    frame=lightFrame(size,0);now+=50;paint();assert.equal(colors.at(-1),0,'fresh note-off clears light');
    now-=100;paint();assert.equal(reads,before+2,'clock rewind does not freeze feedback');
    performance.setHbLaneLatch(port,control-1,true);paint();assert.equal(reads,before+3,'explicit gesture invalidates feedback immediately');
    const other={...port};performance.paintHbOperationKnobs(other,['motion_control_'+control],{},noop);
    assert.equal(reads,before+4,'different owners do not share failed/valid frames');
}
// A missing status must not retire a clip action; only an accepted inactive frame may.
let frame='',commands=[];
globalThis.host_module_set_param_blocking=(key,value)=>{commands.push([key,value]);return true;};
const clipOwner={performanceTrack:14,performanceSet:noop,performanceGet:key=>key.startsWith('motion_gesture_binding_')?'12,1,1,2,350,0,1':frame};
performance.setHbLaneLatch(clipOwner,0,true);commands=[];
performance.pollHbOperationClips();assert.equal(commands.length,0);
now+=50;frame=lightFrame(19,1);performance.pollHbOperationClips();assert.equal(commands.length,0);
now+=50;frame='';performance.pollHbOperationClips();assert.equal(commands.length,0);
now+=50;frame=lightFrame(19,0);performance.pollHbOperationClips();
assert.deepEqual(commands,[['hbperform','14,0,0,0,0,0']]);

const values={approach_row_status:'1,0,1,0,0,1,1,0,0,0,1,2,1,0,0,0,1,0',
    harm_play_release_control:'Latch',key_center_view:'Armed|C Maj|D Min|On|Harmonic Minor',
    parallel_mode:'On',approach_motif_latch:'On',approach_sequence_view:'0,1,0|V',
    approach_rows_view:'1,Secondary V|2,Secondary II|3,Backdoor V',key_center:'Armed'};
let batches=0,individuals=0,missing=false;
const port={performanceSet:noop,performanceGet:()=>{individuals++;return '';},
    performanceGetMany:keys=>{batches++;return keys.map(key=>missing?null:values[key]??null);}};
approach.syncApproachOwner(port);
for(let index=0;index<100;index++){
    approach.paintApproach(port);approach.paintApproachKnobs(port,['approach_bank_1'],noop);approach.drawApproachRows(port);now+=10;
}
assert.equal(batches,20);assert.equal(individuals,0,'status uses one bulk read, including legacy key-center fallback');
assert.equal(approach.performKnobCaption('key_center'),'D Min');
assert.equal(approach.performKnobCaption('harm_play_release_control'),'Latch');
const rows=approach.approachRowLines();missing=true;
for(let index=0;index<100;index++){approach.paintApproach(port);approach.drawApproachRows(port);now+=10;}
assert.equal(batches,40,'failed batch does not fan out or retry on every painter');
assert.equal(individuals,0);assert.deepEqual(approach.approachRowLines(),rows);
assert.equal(approach.performKnobCaption('key_center'),'D Min');
missing=false;values.key_center_view='On|E Maj||Off|Altered V';approach.approachTouched(port);
assert.equal(batches,41);assert.equal(approach.performKnobCaption('key_center'),'E Maj');
approach.approachTouched(port);assert.equal(batches,42,'gesture forces feedback within the cadence');
now-=100;approach.paintApproach(port);assert.equal(batches,43);
const legacy={performanceSet:noop,performanceGet:key=>key==='key_center_view'?'':key==='key_center'?'On':values[key]??''};
approach.syncApproachOwner(legacy);approach.paintApproach(legacy);
assert.equal(approach.performKnobCaption('key_center'),'On','old owners keep individual-read fallback');
approach.syncApproachOwner({...port,performanceGetMany:keys=>keys.map(()=>null)});
assert.equal(approach.performKnobCaption('key_center'),'Off','owner handoff clears prior labels');

// Actual shared-page adapter and actual bulk wire: never fan out a failed batch.
setFlag('chtracks',1);
const native=portFor(7),page=createSchwungPage(native,'midi_fx1');
let gets=0,bulkCalls=0;
globalThis.host_module_get_param=key=>{gets++;return key.endsWith(':key_center')?'On':null;};
globalThis.shadow_get_params=()=>{bulkCalls++;return 'invalid';};
approach.syncApproachOwner(page);approach.paintApproach(page);
assert.equal(bulkCalls,1);assert.equal(gets,0,'failed supported bulk does not issue eight fallback reads');
globalThis.shadow_get_params=()=>{bulkCalls++;return encodeBulk(Object.values(values));};
now+=50;approach.paintApproach(page);
assert.equal(approach.performKnobCaption('key_center'),'E Maj');
delete globalThis.shadow_get_params;now+=50;approach.paintApproach(page);
assert.equal(gets,8,'hosts without bulk IPC keep their compatibility path');
console.log('Feedback polling: 200 failed light reads -> 20; 140 approach reads -> 20 batches per simulated second; recovery, clip ownership and legacy hosts pass');
