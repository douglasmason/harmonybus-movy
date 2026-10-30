/** Device host callbacks for the unmodified Movy app, beside its actual DSP. */
import './build/joint-env.mjs';
import {init} from 'movy/app/init.ts';
import {tick} from 'movy/app/tick.ts';
import {onMidiMessageInternal} from 'movy/midi/router.ts';
import {appState} from 'movy/app/state.ts';
import {seqState} from 'movy/seq/state.ts';
import {seqCmdFlush,engineReady,resetSeqEngine} from 'movy/seq/engine.ts';
import {setFlag,resetFlags} from 'movy/seq/flags.ts';
import {serializeUiState,applyUiState,resetUiState,freshHarmonyBusChains} from 'movy/seq/ui-state.ts';
import {readPrefDefaultQuant} from 'movy/seq/prefs.ts';
import {refreshModelsForSet} from 'movy/app/model-refresh.ts';
import {resetHeldInput} from 'movy/app/input-reset.ts';
import {releaseAllLive} from 'movy/keyboard/release.ts';
import {sessionPlayMode,selectInputMode} from 'movy/seq/router-buttons.ts';
import {selectTrack} from 'movy/track/focus.ts';
import {jointSnapshot,jointPanelSet} from 'movy/seq/joint-play.ts';
import {chordEnabled} from 'movy/seq/chord-play.ts';
import {decodeBulk,encodeBulk} from 'movy/track/bulk.ts';
import {resetBrowserUserParts} from 'movy/seq/part-storage.ts';
import {resetBrowserUsage} from 'movy/app/interface-usage.ts';
import {createPadLabels} from './move-labels.mjs';

// These are RAM-backed user files, never device paths or module overrides. Use
// the same boundary for writes and imports so every saved session can reopen.
const fileLimits=new Map([
 ['/data/UserData/movy/prefs.json',65536],
 ['/data/UserData/schwung/harmonybus-parts.json',600000],
 ['/data/UserData/schwung/movy-interface-usage-a.json',2000000],
 ['/data/UserData/schwung/movy-interface-usage-b.json',2000000],
 ['/data/UserData/schwung/movy-interface-report.json',2000000],
 ['/data/UserData/schwung/desired-tempo',128]
]);
function validFile(path,value){
 if(typeof value!=='string'||!fileLimits.has(path)||value.length>fileLimits.get(path))return false;
 if(path.endsWith('/desired-tempo'))return /^\s*\d+(\.\d+)?\s*$/.test(value)&&Number(value)>0;
 try{const parsed=JSON.parse(value);return !!parsed&&typeof parsed==='object'&&!Array.isArray(parsed);}catch{return false;}
}

export function createMoveRuntime({request:engineRequest,metadata}){
 const screen=new Uint8Array(8192),surface=new Uint8Array(2232),view=new DataView(surface.buffer);
 let display=[],displayRevision=0,drawingText=false;
 let knobLabels=Array(8).fill(null);
 surface.fill(255,152,280);surface.fill(255,408,536);
 const held=new Map(),files=new Map();
 let ticks=0,maxTickMs=0,totalTickMs=0,closed=false;
 let lastPlayed=null,lastOutput=null,pressSerial=0,outputSerial=0;
 const request=engineRequest;
 const get=key=>request('get',key).value;
 const padLabels=createPadLabels(get);
 const set=(key,value)=>{
  // The worker already instantiated the fixed registry. Device library paths
  // cannot replace it, and native transport/worker settings have no browser host.
  if(['chain_host','load'].includes(key))return true;
  if(key==='cmd')value=String(value).split(';').map(command=>/^link\s/.test(command)?'link 0':command).join(';');
  request('set',key,String(value));padLabels.route(key,value);return true;
 };
 const led=(kind,index,value,animation=0)=>{
  if(index<0||index>127)return;
  surface[(kind?280:24)+index]=value;surface[(kind?408:152)+index]=animation;
  surface[536+(kind*128+index)*4+3]=0;
 };
 let sysex=[];
 const rgbPacket=()=>{
  if(sysex[0]===240&&sysex[6]===59&&sysex.length>=16){
   const kind=sysex[7]>>4,index=sysex[8];
   if(kind<2&&index<128){const offset=536+(kind*128+index)*4;
    for(let color=0;color<3;color++)surface[offset+color]=Math.min(255,sysex[9+color*2]+128*sysex[10+color*2]);
    surface[offset+3]=1;
   }
  }
  sysex=[];
 };
 const midiOutput=bytes=>{
  for(let offset=0;offset+3<bytes.length;offset+=4){
   const header=bytes[offset]&15,status=bytes[offset+1],kind=status&240;
   if(kind===144||kind===176)led(kind===176?1:0,bytes[offset+2],bytes[offset+3],status&15);
   if(header>=4&&header<=7){
    if(status===240)sysex=[];
    sysex.push(...bytes.slice(offset+1,offset+1+(header===4?3:header-4)));
    if(header!==4)rgbPacket();
    if(sysex.length>64)sysex=[];
   }
  }
  return true;
 };
 const moduleRoot='/data/UserData/schwung/modules/';
 const synthMetadata={id:'nusaw',name:'NuSaw',component_type:'sound_generator',capabilities:{chain_params:JSON.parse(get('ch0:synth:chain_params')||'[]'),ui_hierarchy:JSON.parse(get('ch0:synth:ui_hierarchy')||'{}')}};
 const listDir=path=>path===moduleRoot+'midi_fx'?['harmonybus']:path===moduleRoot+'sound_generators'?['nusaw']:[];
 const clearScreen=()=>{screen.fill(0);display=[];displayRevision++;};
 Object.assign(globalThis,{
  host_browser_engine_ready:()=>!closed,
  host_module_get_param:get,host_module_set_param:set,host_module_set_param_blocking:set,
  shadow_get_params:(_slot,prefix,payload)=>{const keys=decodeBulk(payload);return keys?encodeBulk(keys.map(key=>get(key)??'')):null;},
  shadow_set_params:(_slot,prefix,payload)=>{const pairs=decodeBulk(payload);if(!pairs||pairs.length%2)return false;for(let index=0;index<pairs.length;index+=2)set(pairs[index],pairs[index+1]);return true;},
  shadow_get_param:(_slot,key)=>key.startsWith('master_fx:')?null:get(key),
  shadow_set_param:()=>false,shadow_set_param_timeout:()=>false,
  host_read_file:path=>files.get(path)??(path.endsWith('/harmonybus/module.json')?JSON.stringify(metadata):path.endsWith('/nusaw/module.json')?JSON.stringify(synthMetadata):null),
  host_write_file:(path,value)=>{if(!validFile(path,value))return false;files.set(path,value);return true;},
  host_file_exists:path=>files.has(path),host_ensure_dir:()=>true,
  host_list_dir:listDir,os:{...globalThis.os,readdir:path=>[listDir(path),0]},
  host_exit_module:()=>release(),host_suspend_overtake:()=>release(),
  shadow_get_ui_slot:()=>0,shadow_overtake_move_inject_active:()=>0,
  move_midi_internal_send:midiOutput,move_midi_cable_send:(cable,bytes)=>cable===0?midiOutput(bytes):false,
  move_midi_external_send:()=>false,move_midi_inject_to_move:()=>false,
  setLED:(index,value)=>led(0,index,value),setButtonLED:(index,value)=>led(1,index,value),
  clear_screen:()=>{clearScreen();knobLabels=Array(8).fill(null);},
  host_browser_clear_overlay:clearScreen,
  host_browser_knob:(slot,label)=>{if(Number.isInteger(slot)&&slot>=0&&slot<8)knobLabels[slot]={
   name:String(label.name??''),value:String(label.value??''),readOnly:!!label.readOnly,action:!!label.action};},
  host_browser_begin_text:(left,top,text,value,width,height)=>{
   display.push([1,left,top,width,height,value,text]);drawingText=true;displayRevision++;
   return ()=>{drawingText=false;};
  },
  fill_rect:(left,top,width,height,value)=>{
   if(!drawingText){display.push([0,left,top,width,height,value]);displayRevision++;}
   const startX=Math.min(128,Math.max(0,Math.trunc(left))),endX=Math.max(0,Math.min(128,Math.ceil(left+width)));
   if(endX<=startX)return;
   for(let row=Math.max(0,Math.trunc(top));row<Math.min(64,Math.ceil(top+height));row++)screen.fill(value?255:0,row*128+startX,row*128+endX);
  }
 });
 resetFlags();setFlag('chtracks',1);resetSeqEngine();init();
 // Musical defaults come from the same new-Set factory as the device. Only
 // the host instrument/mix remains browser-specific (audible NuSaw).
 resetUiState(true);
 for(const track of freshHarmonyBusChains())for(const component of track.comp)
  if(component.m==='harmonybus')set(`ch${track.t}:${component.c}:state`,component.s);
 refreshModelsForSet();
 for(let count=0;count<32;count++)runTick();
 seqCmdFlush();
 function runTick(){
  if(closed)return;const start=performance.now();tick();ticks++;
  const duration=performance.now()-start;maxTickMs=Math.max(maxTickMs,duration);totalTickMs+=duration;
 }
 function input(data){
  if(!Array.isArray(data)||data.length!==3||![128,144,160,176].includes(data[0])||data.slice(1).some(value=>!Number.isInteger(value)||value<0||value>127))throw new Error('Invalid Move input');
  const [status,index,value]=data,kind=status&240;
  if(kind!==176&&!(index<=9||index>=16&&index<=31||index>=68&&index<=99))throw new Error('Unavailable Move note');
  if(kind===176&&![3,14,40,41,42,43,49,50,51,52,54,55,56,58,60,62,63,71,72,73,74,75,76,77,78,79,85,86,88,118,119].includes(index))throw new Error('Unavailable Move control');
  const encoder=kind===176&&(index===14||index>=71&&index<=79);
  if(kind===160){surface[1688+index]=value;}
  else if(kind===176){surface[1816+index]=value;if(encoder){const offset=1944+(index===14?9:index-71)*2;view.setInt16(offset,view.getInt16(offset,true)+(value<64?value:value-128),true);}}
  else surface[1560+index]=kind===144?value:0;
  const key=(kind===176?'cc:':'note:')+index;
  if(!encoder&&kind!==160){if(kind!==128&&value)held.set(key,[kind===176?176:128,index,0]);else held.delete(key);}
  // Browser Stop/audio interruption can occur between production status polls.
  // A following transport press must toggle the engine's current state.
  if(kind===176&&(index===85||index===86)){
   const status=Object.fromEntries(get('status').split(' ').map(field=>field.split('=')));
   seqState.playing=status.play==='1';seqState.recording=status.rec==='1';seqState.countingIn=status.cin==='1';
  }
  // As on the device: dispatch UI, synchronize its routing, then deliver a raw
  // pad edge once to DSP. Session/clip-edit modes switch the native padmap off.
  const padPress=kind===144&&value>0&&index>=68&&index<=99;
  if(padPress)padLabels.invalidate();
  const label=padPress?padLabels.describe(sessionPlayMode(),appState.activeTrack.index,seqState.holdStep>=0)?.pads[index-68]:null;
  onMidiMessageInternal(data);runTick();
  if(index>=68&&index<=99&&kind!==176&&kind!==160)request('midi',data.join(','));
  seqCmdFlush();
  if(padPress)lastPlayed=label?{serial:++pressSerial,pad:index-68,label:{...label}}:null;
 }
 function context(){return {track:appState.activeTrack.index,mode:sessionPlayMode(),performance:sessionPlayMode(false)};}
 function restoreContext(value){
  selectTrack(value.track);
  selectInputMode(value.performance,false);
  if(value.mode!==value.performance)selectInputMode(value.mode);
  // Clips can focus a conductor/comp track while Chord Play is underneath.
  // Activating the performance owner may temporarily choose its playing track.
  selectTrack(value.track);
 }
 function release(preserveContext=true){
  // Cancellation is not a tap: a synthetic step/button release could toggle a
  // note or launch recording. Drop gesture latches and release musical gates.
  const previous=preserveContext?context():null;
  releaseAllLive();resetHeldInput(true);
  for(const data of held.values())if(data[0]===128&&data[1]>=68)request('midi',data.join(','));
  held.clear();
  if(previous)restoreContext(previous);
  seqCmdFlush();surface.fill(0,1560,1944);
 }
 function capture(){return {state:serializeUiState(),files:Object.fromEntries(files),context:context()};}
 function accompaniment(){
  const group=Math.floor(appState.activeTrack.index/4),base=group*4;
  return {group,melody:base+3,comp:base+2,source:jointSnapshot()[group].comp,overridden:chordEnabled()};
 }
 function setCompSource(group,source){
  if(!Number.isInteger(group)||group<0||group>3||!Number.isInteger(source)||source<0||source>3)throw new Error('Invalid Comp source');
  if(held.size)throw new Error('Release held controls before changing Comp source');
  if(chordEnabled())throw new Error('Chord Play controls its own accompaniment');
  // Use the production setting and its normal routing/held-note teardown.
  // An explicit group keeps a delayed edit tied to the bank shown when sent.
  jointPanelSet(group*4,'joint_comp',String(source));runTick();seqCmdFlush();
 }
 const initialState=serializeUiState();
 const initialContext=context();
 function fresh(){
  const state=JSON.parse(initialState);state.defaultQuant=readPrefDefaultQuant();
  return {state:JSON.stringify(state),files:Object.fromEntries(files),context:{...initialContext}};
 }
 function validate(saved){
  if(saved===undefined)return;
  if(!saved||typeof saved.state!=='string'||saved.state.length>65536)throw new Error('Invalid Move UI state');
  const state=JSON.parse(saved.state),defaults=JSON.parse(initialState);
  if(!state||typeof state!=='object'||Array.isArray(state)||'chains' in state||'sends' in state)throw new Error('Invalid Move UI state');
  for(const [key,value]of Object.entries(state)){
   if(!(key in defaults)||typeof value!==typeof defaults[key]||Array.isArray(value)!==Array.isArray(defaults[key]))throw new Error('Invalid Move UI field: '+key);
  }
  if(!saved.files||typeof saved.files!=='object'||Array.isArray(saved.files)||Object.entries(saved.files).some(([path,value])=>!validFile(path,value)))throw new Error('Invalid Move preferences');
  if(saved.context!==undefined){
   const value=saved.context;
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['track','mode','performance'].includes(key))||
    !Number.isInteger(value.track)||value.track<0||value.track>15||!Number.isInteger(value.mode)||value.mode<0||value.mode>7||
    !Number.isInteger(value.performance)||value.performance<1||value.performance>6||
    ![0,7,value.performance].includes(value.mode))throw new Error('Invalid Move performance context');
   if(value.mode===6&&[state.chordPlay?.conductor??0,state.chordPlay?.bass??1,state.chordPlay?.comp??2].includes(value.track))throw new Error('Invalid Chord Play track');
  }
 }
 function restore(saved){
  lastPlayed=lastOutput=null;padLabels.invalidate();
  files.clear();for(const [path,value]of Object.entries(saved?.files??{}))files.set(path,value);
  resetBrowserUserParts();resetBrowserUsage();
  resetFlags();setFlag('chtracks',1);resetSeqEngine();init();
  const state=JSON.parse(saved?.state??initialState);
  // The verified sequencer is authoritative when importing from either surface.
  const status=Object.fromEntries(get('status').split(' ').map(field=>field.split('=')));
  state.defaultQuant=Number(status.dquant)||0;seqState.sessionMode=false;
  applyUiState(JSON.stringify(state));
  // Older exports have no context; retain their flag-derived Normal/Motif mode.
  const previous=saved?.context??{track:0,mode:state.flags?.hbsteprow===2?2:1,performance:state.flags?.hbsteprow===2?2:1};
  selectTrack(previous.track);refreshModelsForSet();
  for(let count=0;count<32;count++)runTick();
  restoreContext(previous);runTick();seqCmdFlush();
 }
 return {observeOutput(packets){
   const outputs=padLabels.outputs(packets);
   if(outputs.length)lastOutput={serial:++outputSerial,outputs};
  },tick:runTick,input,release,capture,restore,validate,fresh,setCompSource,isHeld:()=>held.size>0,
  diagnostic:()=>({ticks,maxTickMs,meanTickMs:ticks?totalTickMs/ticks:0,held:held.size,track:appState.activeTrack.index,view:appState.currentView,mode:sessionPlayMode()}),
  snapshot:()=>({screen:Array.from(screen),display,displayRevision,knobLabels,surface:Array.from(surface),track:appState.activeTrack.index,mode:sessionPlayMode(),view:appState.currentView,ready:engineReady(),held:held.size,accompaniment:accompaniment(),padLabels:padLabels.describe(sessionPlayMode(),appState.activeTrack.index,seqState.holdStep>=0),lastPlayed,lastOutput,playing:seqState.playing,recording:seqState.recording,ticks,maxTickMs,meanTickMs:ticks?totalTickMs/ticks:0}),
  dispose:()=>{release(false);closed=true;}};
}
