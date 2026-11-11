import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]);
const load=path=>import(pathToFileURL(root+'/'+path));
const {installEnv}=await load('browser-test/env.mjs');installEnv();
await load('dist/esm/app/globals.js');
const {installMockEngine}=await load('browser-test/mock-engine.mjs');installMockEngine();
const engine=await load('dist/esm/seq/engine.js');engine.seqEngineTick();
const {installEditGuard,setUndoStrict}=await load('dist/esm/undo/record.js');installEditGuard();setUndoStrict(true);
const automation=await load('dist/esm/seq/automation.js');
const source=await load('dist/esm/seq/source-panels.js');
const commands=[],routes=new Map();
const nativeGet=globalThis.host_module_get_param,nativeSet=globalThis.host_module_set_param_blocking;
globalThis.host_module_get_param=key=>key.startsWith('source_route_')?(routes.get(+key.slice(13))??`${key.slice(13)} 0 -1 -1 -1 -1 0`):nativeGet(key);
globalThis.host_module_set_param_blocking=(key,value,timeout)=>{
    if(key==='cmd')for(const command of value.split(';')){
        commands.push(command);
        if(command.startsWith('source ')){const fields=command.slice(7).split(' ').map(Number);routes.set(fields[0],fields.join(' '));}
    }
    return nativeSet?.(key,value,timeout);
};
const flush=()=>engine.seqCmdFlush();
const descriptor=(key,type='float',max=1,continuous=true)=>({gi:0,key,ioKey:key,target:'synth',value:0,min:0,max,type,continuous,automatable:true});
automation.resetAutomation();
for(const [key,type,max,continuous] of [['cutoff','float',1,true],['shape','enum',7,false],['switch','int',1,true],['choice','int',7,false]]){
    automation.assignLane(15,15,descriptor(key,type,max,continuous),()=>true);
}
flush();
assert(commands.includes('akind 15 0 1 synth:cutoff'));
for(const [lane,key] of [[1,'shape'],[2,'switch'],[3,'choice']])assert(commands.includes(`akind 15 ${lane} 0 synth:${key}`));
commands.length=0;
automation.assignLane(15,15,descriptor('cutoff','enum',7,false),()=>assert.fail('existing lane must not remap'));flush();
assert(commands.includes('akind 15 0 0 synth:cutoff'),'same-key target type changes revoke numeric eligibility');
commands.length=0;
const labels=Array.from({length:16},(_,track)=>track===15?'synth:cutoff':'-').join(',');
automation.syncLabelsFromEngine(labels,()=>{},()=> 'unknown');flush();
assert(commands.includes('akind 15 0 0 synth:cutoff'),'unknown metadata cannot opt in');
commands.length=0;
automation.syncLabelsFromEngine(labels,()=>{},()=>({min:0,max:1,type:'float',continuous:true}));flush();
assert(commands.includes('akind 15 0 1 synth:cutoff'));

assert.equal(source.sourcePanelGet(12,'joint_source_3_instrument_read'),'Step');
source.sourcePanelSet(12,'joint_source_3_instrument_read','Linear');flush();
assert.equal(routes.get(15).split(' ').length,25);
assert.equal(source.sourcePanelGet(12,'joint_source_3_instrument_read'),'Linear');
assert.equal(source.sourcePanelGet(12,'joint_source_3_hb_render_read'),'Step');
source.sourcePanelSet(12,'joint_source_3_instrument_track','1');flush();
assert.equal(routes.get(15).split(' ')[23],'1','source edits retain the reader mode');
source.sourcePanelSet(12,'joint_source_3_hb_render_read','Linear');flush();
assert.equal(routes.get(15).split(' ')[24],'1');
const previous=routes.get(15);source.sourcePanelSet(12,'joint_source_3_instrument_read','garbage');flush();assert.equal(routes.get(15),previous);
source.sourcePanelSet(12,'joint_source_3_instrument_read','Step');
source.sourcePanelSet(12,'joint_source_3_hb_render_read','Step');flush();
assert.equal(routes.get(15).split(' ').length,23,'Step preserves the legacy wire representation');
for(const key of ['instrument_read','hb_render_read']){
    const parameter=source.sourceParameters.find(parameter=>parameter.key==='joint_source_3_'+key);
    assert.deepEqual(parameter.options,['Step','Linear']);assert.equal(parameter.default,'Step');
}
console.log('Linear automation UI: validated types, independent readers, legacy settings and shared command/Undo path pass');
