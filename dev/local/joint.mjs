import './build/joint-env.mjs';
import {openJointConnection} from './joint-connection.mjs';
import {AudioMonitor} from './audio-monitor.mjs';
import {engineReadKey} from './protocol-policy.mjs';
let monitor=new AudioMonitor();
const audioButton=document.querySelector('#audio');audioButton.disabled=true;
const disableAudio=()=>{monitor.disable();audioButton.textContent='Enable audio';audioButton.setAttribute('aria-pressed','false');};
audioButton.onclick=async()=>{if(monitor.enabled){disableAudio();return;}audioButton.disabled=true;try{if(await monitor.enable()){audioButton.textContent='Disable audio';audioButton.setAttribute('aria-pressed','true');}}catch(error){document.querySelector('#audio-status').textContent=error.message;}finally{audioButton.disabled=false;}};
for(const [actor,name] of ['Root','Bass','Comp','Melody'].entries()){
 const label=document.createElement('label');label.textContent=name+' ';
 const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.01';volume.value='.6';volume.setAttribute('aria-label',name+' volume');
 const mute=document.createElement('input');mute.type='checkbox';mute.setAttribute('aria-label',name+' mute');
 volume.oninput=mute.onchange=()=>monitor.mix(actor,Number(volume.value),mute.checked);
 label.append(volume,mute,document.createTextNode(' Mute'));document.querySelector('#audio-mix').append(label);
}
const status=document.querySelector('#status');
const {metadata,socket,label,audio,sessions}=await openJointConnection();
if(audio){monitor=audio;audio.onStatus=text=>{document.querySelector('#audio-status').textContent=text;};audio.onDisable=()=>{audioButton.textContent='Enable audio';audioButton.setAttribute('aria-pressed','false');};document.querySelector('#audio-status').textContent='NuSaw · compiled Schwung synth audio';}
audioButton.disabled=false;
if(audio){
 document.querySelector('#audio-test').hidden=false;document.querySelector('#audio-diagnostics').hidden=false;
 audio.onDiagnostic=value=>{document.querySelector('#audio-report').textContent=JSON.stringify(value,null,2);};
 audio.onDiagnostic(audio.diagnostic());
 const build=document.createElement('p');build.textContent=`Browser build ${audio.build?.engineSource?.commit?.slice(0,12)??'unknown'} · HB ${metadata.version??audio.build?.harmonyBus?.version??'unknown'} · 44,100 Hz`;
 document.querySelector('#status').after(build);
 document.querySelector('#audio-test').onclick=async()=>{try{await audio.testSpeaker();audioButton.textContent='Disable audio';audioButton.setAttribute('aria-pressed','true');}catch(error){document.querySelector('#audio-status').textContent=error.message;}};
 document.querySelector('#audio-copy').onclick=async()=>{try{await navigator.clipboard.writeText(document.querySelector('#audio-report').textContent);}catch{document.querySelector('#audio-status').textContent='Select and copy the diagnostics text, or take a screenshot.';}};
}
const cache=new Map(),demand=new Map();let connected=false;

const send=message=>{if(socket.readyState===1)socket.send(JSON.stringify(message));};
let routingCells=[];
const write=(key,value)=>{if(key==='joint_map')routingCells=value==='off'?[]:value.split(';').map(cell=>cell.split(',').map(Number));send({type:'set_param',key,value:String(value)});return connected;};
globalThis.host_browser_engine_ready=()=>connected;
globalThis.host_module_get_param=key=>{if(!engineReadKey.test(key))return null;demand.set(key,Date.now());return cache.get(key)??null;};
globalThis.host_module_set_param=(key,value)=>{if(key!=='cmd')return false;send({type:'dev_engine_edit',value});return connected;};
globalThis.host_module_set_param_blocking=globalThis.host_module_set_param;
await new Promise((resolve,reject)=>{
  socket.onopen=()=>send({type:'subscribe_tool'});
  socket.onerror=()=>reject(new Error('Native connection failed'));
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.type==='audio_error'){disableAudio();document.querySelector('#audio-status').textContent=message.message;return;}
    if(message.type==='error'){status.textContent=message.message;return;}
    if(message.events)monitor.consume(message.events);
    if(message.requestId==='monitor-stop')monitor.silence();
    for(const [key,value] of Object.entries(message.params??{}))cache.set(key,value);
    if(message.events)document.querySelector('#events').textContent=message.events.slice(-30).map(event=>event.packet.join(' ')).join('\n');
    if(!connected){connected=true;status.textContent=label;resolve();}
  };
  if(socket.readyState===1)socket.onopen();
});
import {setFlag} from 'movy/seq/flags.ts';setFlag('chtracks',1);
import {appState} from 'movy/app/state.ts';
import {seqState} from 'movy/seq/state.ts';
import {portFor} from 'movy/track/registry.ts';
import * as joint from 'movy/seq/joint-play.ts';
import {jointPage} from 'movy/seq/joint-panels.ts';
import {schwungLibAvailable} from 'movy/renderer/schwung-lib.ts';
import {ledFrameReset} from 'movy/seq/led-cache.ts';
import {hbPerformanceStep,paintHbPerformance} from 'movy/renderer/hb-performance.ts';
import {PAD_PALETTE} from 'movy/keyboard/pad-palette.ts';
if(!schwungLibAvailable())throw new Error('Production Schwung controller unavailable');
globalThis.host_read_file=path=>path.endsWith('/harmonybus/module.json')?JSON.stringify(metadata):null;
globalThis.host_write_file=()=>false;
const readable=new Set(metadata.dev.readable);
const read=(track,key)=>{
  if(key==='midi_fx1_module'||key==='midi_fx1:module')return 'harmonybus';
  if(key==='midi_fx1:name')return metadata.name;
  if(key==='midi_fx1:chain_params')return JSON.stringify(metadata.capabilities.chain_params);
  if(key==='midi_fx1:ui_hierarchy')return JSON.stringify(metadata.capabilities.ui_hierarchy);
  if(!key.startsWith('midi_fx1:')||!readable.has(key.slice(9).replace(/:(?:base|modulated)$/,'')))return null;
  const full=`ch${track}:${key}`;demand.set(full,Date.now());return cache.get(full)??null;
};
for(let track=0;track<16;track++){
 const port=portFor(track);port.bulkReads=true;
 port.getParam=key=>read(track,key);port.getMany=keys=>keys.map(key=>read(track,key));
 port.setParam=(key,value)=>write(`ch${track}:${key}`,value);
 port.setMany=pairs=>pairs.every(([key,value])=>port.setParam(key,value));
 port.setParamTimeout=port.setParam;
}
const context=document.querySelector('#display').getContext('2d');
globalThis.fill_rect=(x,y,width,height,value)=>{context.fillStyle=value?'#d4d0c8':'#000';context.fillRect(x,y,width,height);};
globalThis.clear_screen=()=>{context.fillStyle='#000';context.fillRect(0,0,128,64);};
const padColors=new Map();
globalThis.setLED=(note,color)=>padColors.set(note,color);
globalThis.setButtonLED=()=>{};
globalThis.move_midi_cable_send=(_cable,data)=>{for(let offset=0;offset+3<data.length;offset+=4)if((data[offset+1]&240)===144)padColors.set(data[offset+2],data[offset+3]);return true;};
globalThis.move_midi_internal_send=data=>globalThis.move_midi_cable_send(0,data);
appState.focusGroup=0;seqState.sessionMode=false;joint.restoreJoint(null);joint.setJointEnabled(true);
const heldPads=new Set(),heldKnobs=new Set(),heldSteps=new Set();
const midi=(status,note,value)=>{joint.jointMidi([status,note,value]);if(note>=68)send({type:'dev_midi',data:[status,note,value]});};
const knobs=Array.from({length:8},(_,slot)=>{
 const button=document.createElement('button');button.className='knob';button.dataset.slot=slot;
 button.setAttribute('aria-label',`Knob ${slot+1}`);document.querySelector('#knobs').append(button);
 const down=()=>{if(!heldKnobs.has(slot)){heldKnobs.add(slot);midi(144,slot,127);button.dataset.held='true';}};
 const up=()=>{if(heldKnobs.delete(slot)){midi(128,slot,0);button.dataset.held='false';}};
 let lastY=0;
 button.onpointerdown=event=>{button.setPointerCapture(event.pointerId);lastY=event.clientY;down();};
 button.onpointermove=event=>{if(!button.hasPointerCapture(event.pointerId))return;const delta=Math.trunc(lastY-event.clientY);if(delta){jointPage().knobTurn(slot,delta);lastY=event.clientY;}};
 button.onpointerup=button.onpointercancel=button.onlostpointercapture=up;
 button.onkeydown=event=>{if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();down();jointPage().knobTurn(slot,event.key==='ArrowUp'?4:-4);}};
 button.onkeyup=event=>{if(event.key.startsWith('Arrow'))up();};button.onblur=up;return button;
});
// The production handler owns timing, modifier routing and release ownership.
const steps=Array.from({length:16},(_,index)=>{
 const button=document.createElement('button');button.className='step';button.textContent=String(index+1);
 button.setAttribute('aria-label',`Step ${index+1}`);document.querySelector('#steps').append(button);
 const down=()=>{if(!heldSteps.has(index)&&joint.jointStepMode()!==0){heldSteps.add(index);hbPerformanceStep([144,16+index,100]);button.dataset.held='true';}};
 const up=()=>{if(heldSteps.delete(index)){hbPerformanceStep([128,16+index,0]);button.dataset.held='false';}};
 button.onpointerdown=event=>{event.preventDefault();button.setPointerCapture(event.pointerId);down();};
 button.onpointerup=button.onpointercancel=button.onlostpointercapture=up;
 button.onkeydown=event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();down();}};
 button.onkeyup=event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();up();}};button.onblur=up;return button;
});
const pads=Array.from({length:32},(_,index)=>{
 const button=document.createElement('button');button.className='pad';button.dataset.pad=index;
 button.style.gridRow=String(4-Math.floor(index/8));button.style.gridColumn=String(index%8+1);
 button.setAttribute('aria-label',`Pad ${index+1}`);document.querySelector('#pads').append(button);
 const down=()=>{if(!heldPads.has(index)){heldPads.add(index);midi(144,68+index,100);button.dataset.held='true';}};
 const up=()=>{if(heldPads.delete(index)){midi(128,68+index,0);button.dataset.held='false';}};
 button.onpointerdown=event=>{event.preventDefault();button.setPointerCapture(event.pointerId);down();};
 button.onpointerup=button.onpointercancel=button.onlostpointercapture=up;
 button.onkeydown=event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();down();}};
 button.onkeyup=event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();up();}};button.onblur=up;return button;
});
function release(){
 for(const index of [...heldSteps]){heldSteps.delete(index);hbPerformanceStep([128,16+index,0]);steps[index].dataset.held='false';}
 for(const index of [...heldPads]){heldPads.delete(index);midi(128,68+index,0);pads[index].dataset.held='false';}
 for(const slot of [...heldKnobs]){heldKnobs.delete(slot);midi(128,slot,0);knobs[slot].dataset.held='false';}
}
document.querySelector('#release').onclick=release;
document.querySelector('#play').onclick=()=>send({type:'dev_transport',action:'play'});
document.querySelector('#stop').onclick=()=>{release();monitor.silence();send({type:'dev_transport',action:'stop',id:'monitor-stop'});};
document.querySelector('#record').onclick=()=>{
 const command=joint.jointRecordCommand();if(!command)return;
 const [,mask,overwrite]=command.split(' ').map(Number);
 send({type:'dev_transport',action:'record',mask,overwrite});
};
window.addEventListener('blur',()=>{release();disableAudio();});document.addEventListener('visibilitychange',()=>{if(document.hidden){release();disableAudio();}});
window.addEventListener('pagehide',()=>{release();socket.close();});
socket.onclose=()=>{disableAudio();connected=false;release();clearInterval(timer);status.textContent='Disconnected — reload to reconnect';};
document.querySelector('#shift').onchange=event=>appState.shiftHeld=event.target.checked;
document.querySelector('#previous').onclick=()=>jointPage().changePage(-1);
document.querySelector('#next').onclick=()=>jointPage().changePage(1);
document.querySelector('#back').onclick=()=>jointPage().back();
document.querySelector('#enter').onclick=()=>jointPage().click(appState.shiftHeld);
const panel=document.querySelector('#panel');panel.onchange=()=>jointPage().goToPage(Number(panel.value));
let signature='',watchSignature='';
const timer=setInterval(()=>{
 if(!connected||document.hidden)return;
 const transport=Object.fromEntries(String(cache.get('status')??'').split(' ').map(field=>field.split('=')));
 seqState.playing=transport.play==='1';seqState.recording=transport.rec==='1';seqState.countingIn=transport.cin==='1';
 document.querySelector('#transport').textContent=seqState.countingIn?'Count-in':seqState.recording?'Recording':seqState.playing?'Playing':'Stopped';
 document.querySelector('#record').setAttribute('aria-pressed',String(seqState.recording||seqState.countingIn));
 ledFrameReset();joint.syncJoint(write);joint.paintJointPads();joint.renderJoint();
 const stepMode=joint.jointStepMode();if(stepMode)paintHbPerformance();
 document.querySelector('#step-mode').textContent=stepMode===0?'Step sequencing is not available in this host.':stepMode===1?'Operator buttons':'Motif buttons';
 for(let index=0;index<16;index++){const button=steps[index];button.setAttribute('aria-disabled',String(stepMode===0));const rgb=PAD_PALETTE[stepMode?(padColors.get(16+index)??0):0]??[30,30,30];button.style.backgroundColor=`rgb(${rgb.join(',')})`;button.style.color=rgb.reduce((sum,value)=>sum+value,0)>400?'#111':'#fff';}
 const page=jointPage(),pages=page.ctl?.pages??[];
 const nextSignature=JSON.stringify(pages.map(item=>[item.name,item.keys]));
 if(signature!==nextSignature){signature=nextSignature;panel.replaceChildren(...pages.map((item,index)=>{const option=document.createElement('option');option.value=index;option.textContent=`${index+1} · ${item.title??item.name??item.keys?.join(' / ')??'Page'}`;return option;}));}
 panel.value=String(page.pageIndex);
 for(let slot=0;slot<8;slot++){const key=page.keyAt(slot)??'',meta=page.ctl.metaAt(slot);const value=page.ctl.state.values[key]??'';const label=document.createElement('span'),readout=document.createElement('small');label.textContent=meta?.name??meta?.label??key;readout.textContent=String(value);knobs[slot].replaceChildren(label,readout);knobs[slot].dataset.key=key;}
 const base=appState.focusGroup*4;
 const cells=routingCells.map(([track,pitch,target])=>({track,pitch,target}));
 for(let index=0;index<32;index++){const cell=cells[index]??{track:base,pitch:-1,target:-1};pads[index].textContent=`${['Root','Bass','Comp','Melody'][cell.track-base]} ${cell.target>=0?'→'+cell.target:cell.pitch>=0?cell.pitch:'—'}`;const rgb=PAD_PALETTE[padColors.get(68+index)??0]??[30,30,30];pads[index].style.backgroundColor=`rgb(${rgb.join(',')})`;pads[index].style.color=rgb.reduce((total,value)=>total+value,0)>400?'#111':'#fff';}
 const now=Date.now(),keys=[...demand].filter(([,time])=>now-time<750).map(([key])=>key).slice(-64);
 const watch=keys.join('|');if(watch!==watchSignature){watchSignature=watch;send({type:'dev_watch',keys});}
},40);
// Read-only inspection for browser tests; all input still uses production handlers.
globalThis.__joint={joint,page:jointPage,monitor};

// The same production Joint snapshot/restore methods used by the hardware UI.
if(sessions){
 const {mountSessions}=await import('./session-ui.mjs');
 await mountSessions({sessions,captureUI:()=>({joint:joint.jointSnapshot(),focusGroup:appState.focusGroup,levels:monitor.levels,muted:monitor.muted}),
 restoreUI:ui=>{joint.restoreJoint(ui?.joint);appState.focusGroup=Number.isInteger(ui?.focusGroup)&&ui.focusGroup>=0&&ui.focusGroup<4?ui.focusGroup:0;joint.setJointEnabled(true);
  for(let actor=0;actor<4;actor++){const level=ui?.levels?.[actor]??.6,muted=ui?.muted?.[actor]??false;monitor.levels[actor]=level;monitor.muted[actor]=muted;document.querySelectorAll('#audio-mix input[type=range]')[actor].value=String(level);document.querySelectorAll('#audio-mix input[type=checkbox]')[actor].checked=muted;}
 },disableAudio,isStopped:()=>/(?:^| )play=0/.test(cache.get('status')??''),release:()=>document.querySelector('#release').click()});
}
