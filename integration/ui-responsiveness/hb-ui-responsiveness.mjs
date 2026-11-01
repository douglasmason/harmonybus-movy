// Production app-loop regression: mocked host data, request counts, no hardware timing claims.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installEnv} from './env.mjs';
const env=installEnv();
await import('../dist/esm/app/globals.js');
const {installMockEngine}=await import('./mock-engine.mjs');
const engine=installMockEngine();
const {portFor}=await import('../dist/esm/track/registry.js');
const {appState,VIEW_CHAIN}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {setFlag}=await import('../dist/esm/seq/flags.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const chord=await import('../dist/esm/seq/chord-play.js');
const {setSettingsOpen}=await import('../dist/esm/seq/hb-settings.js');
const {sessionReady}=await import('../dist/esm/seq/set-session.js');
const joint=await import('../dist/esm/seq/joint-play.js');
const field=await import('../dist/esm/seq/field-play.js');
const module=JSON.parse(readFileSync(process.env.HB_MODULE,'utf8'));
let now=10000,requestDelay=0,measuring=false,currentCalls=[];
Date.now=()=>now;
const out=console.log;
console.log=()=>{};
function record(key){if(measuring){currentCalls.push(key);now+=requestDelay;}}
const valuesByTrack=[];
setFlag('chtracks',1);
for(let track=0;track<16;track++){
  const values=new Map(module.capabilities.chain_params.map(meta=>[meta.key,String(meta.default??meta.options?.[0]??'0')]));
  valuesByTrack.push(values);
  values.set('hb_chord_bank_snapshot','cb1|2741|-1,0,0,0,0,0|'+Array.from({length:21},()=> '0,145,2741,1,0,0,1,0,C,1').join('|'));
  values.set('hb_chord_queue_status','cq1|2|0|C|C|0|0|2|1');
  values.set('pad_view','145,145,2741,0,0,6,0,3,0,0|colors2,0|playcolor1,3|playpads1,0|outputs1,'+Array.from({length:32},(_,index)=>index).join(','));
  values.set('pad_render',values.get('pad_view'));
  values.set('hb_chord_range_top','67');
  values.set('motion_named_lights',Array(38).fill(0).join(','));
  values.set('motion_lights',Array(19).fill(0).join(','));
  values.set('key_center_view','Off|C Maj||Off|Altered V');
  values.set('render_channel',track===0?'Off':'3');
  const read=key=>{
    if(key==='midi_fx1_module')return 'harmonybus';
    if(key.endsWith(':modulated'))return '0';
    const bare=key.replace(/:(base|modulated|effective)$/,'').split(':').at(-1);
    if(bare==='chain_params')return JSON.stringify(module.capabilities.chain_params);
    if(bare==='ui_hierarchy')return JSON.stringify(module.capabilities.ui_hierarchy);
    return values.get(bare)??'';
  };
  const port=portFor(track);
  port.getParam=key=>{record('get T'+track+' '+key);return read(key);};
  port.getMany=keys=>{record('bulk T'+track+' '+keys.join('|'));return keys.map(read);};
  port.setParam=(key,value)=>{record('set T'+track+' '+key);values.set(key.split(':').at(-1),value);return true;};
  port.setMany=pairs=>{record('bulkset T'+track+' '+pairs.map(pair=>pair[0]).join('|'));for(const [key,value]of pairs)values.set(key.split(':').at(-1),value);return true;};
}
env.setParams({midi_fx1_module:'harmonybus','midi_fx1:ui_hierarchy':JSON.stringify(module.capabilities.ui_hierarchy),'midi_fx1:chain_params':JSON.stringify(module.capabilities.chain_params)});
// Keep disk persistence outside this UI polling fixture; it is audited separately.
delete globalThis.host_write_file;
for(const name of ['host_module_get_param','host_module_set_param_blocking','shadow_get_param','shadow_get_params']){
  const original=globalThis[name];
  if(original)globalThis[name]=(...args)=>{record(name+' '+(name.startsWith('shadow')?args[1]:args[0]));return original(...args);};
}
setFlag('chtracks',1);setFlag('setcommit',0);setFlag('hblaunchpad',0);
globalThis.init();
for(let index=0;index<40;index++){now+=100;globalThis.tick();}
if(!sessionReady())throw new Error('Fixture session did not become ready');
selectTrack(3);appState.currentView=VIEW_CHAIN;
appState.trackChainIndex[3]=appState.trackModels[3].findIndex(model=>model.getComponentKey()==='midi_fx1');
seqState.sessionMode=false;setSettingsOpen(false);chord.restoreChord(null);chord.setChordEnabled(true);
const grid=await import('../dist/esm/seq/grid.js');
const settings=await import('../dist/esm/seq/hb-settings.js');
const model=appState.trackModels[3][appState.trackChainIndex[3]],tickModel=model.tick;
let valueRefreshes=[];
model.tick=(refresh=true)=>{valueRefreshes.push(refresh);return tickModel(refresh);};
const results=[];
for(const mode of ['Chord','Settings','Joint','Field','Grid','Normal']){
    chord.setChordEnabled(false);joint.setJointEnabled(false);field.setFieldEnabled(false);grid.setGridEnabled(false);settings.setSettingsOpen(false);
    if(mode==='Chord')chord.setChordEnabled(true);
    if(mode==='Settings')settings.setSettingsOpen(true);
    if(mode==='Joint')joint.setJointEnabled(true);
    if(mode==='Field')field.setFieldEnabled(true);
    if(mode==='Grid')grid.setGridEnabled(true);
    appState.initLedsDone=true;
    for(let index=0;index<20;index++){now+=50;globalThis.tick();}
    currentCalls=[];valueRefreshes=[];measuring=true;
    for(let index=0;index<100;index++){now+=10;globalThis.tick();}
    measuring=false;
    assert(valueRefreshes.length>0,mode+' keeps the model lifecycle alive');
    assert(valueRefreshes.every(refresh=>refresh===false),mode+' leaves value polling to its visible shared page');
    const genericPreviews=currentCalls.filter(key=>key==='get T3 midi_fx1:pad_view').length;
    if(mode==='Field'||mode==='Grid')assert.equal(genericPreviews,0,mode+' owns its pad preview');
    if(mode==='Chord'||mode==='Normal')assert(genericPreviews>=19,mode+' retains melodic pad previews');
    if(mode==='Joint'){
        assert.equal(currentCalls.filter(key=>key.startsWith('get ')&&key.includes('approach_row_status')).length,0);
        assert.equal(currentCalls.filter(key=>key.startsWith('bulk ')&&key.includes('approach_row_status')).length,20);
    }
    results.push({mode,modelTicks:valueRefreshes.length,modelValueRefreshes:valueRefreshes.filter(Boolean).length,genericPreviews});
}
model.tick=tickModel;

// A hidden model still applies queued edits and detects/reloads a module swap.
const {createModel}=await import('../dist/esm/model/index.js');
const {MOCK_SYNTHS}=await import('./mock-synth.mjs');
const synthValues={...MOCK_SYNTHS.test8};
let modelReads=[],modelWrites=[];
const synthPort={track:portFor(15).track,bulkReads:false,
    getParam:key=>{modelReads.push(key);return synthValues[key]??null;},
    setParam:(key,value)=>{modelWrites.push([key,value]);synthValues[key]=value;return true;},
    getMany:keys=>keys.map(key=>synthPort.getParam(key)),
    setMany:pairs=>pairs.every(([key,value])=>synthPort.setParam(key,value)),sendMidi:()=>{}};
const underlying=createModel(synthPort);underlying.reload();underlying.tick();underlying.tick();
modelReads=[];for(let index=0;index<100;index++)underlying.tick(false);
assert(!modelReads.includes('synth:freq'),'hidden model does not poll a stale bank');
underlying.handleKnobDelta(0,4);underlying.tick(false);
assert(modelWrites.some(([key])=>key==='synth:freq'),'pending knob writes survive hidden polling suppression');
synthValues['synth:name']='Changed Synth';underlying.reload();underlying.tick(false);underlying.tick(false);
assert.equal(underlying.getModuleName(),'Changed Synth','hidden model detects module changes');
modelReads=[];for(let index=0;index<120;index++)underlying.tick();
assert(modelReads.includes('synth:freq'),'visible model resumes value refresh after mode exit');
console.log=out;
out('UI responsiveness: '+JSON.stringify(results));
