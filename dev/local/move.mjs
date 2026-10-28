import {openBrowserConnection} from '/wasm/full/joint-transport.mjs';
import {controls,dimensions,updateMirror} from './build/move-mirror.mjs';
import {mountMoveInput} from './move-input.mjs';
import {mountSessions} from './session-ui.mjs';

const errorBox=document.querySelector('#error'),feedback=document.querySelector('#feedback');
try{
 const {socket,audio,sessions,metadata}=await openBrowserConnection({surface:'move'});
 const send=message=>socket.send(JSON.stringify(message));
 const inputs=mountMoveInput({controls,dimensions,send});
 const audioButton=document.querySelector('#audio'),audioStatus=document.querySelector('#audio-status');
 let stopped=true,lastTrack=-1,frame=null,pendingFrame=null;
 const disableAudio=()=>audio.disable();
 audio.onStatus=text=>{audioStatus.textContent=text;};
 audio.onDisable=()=>{audioButton.textContent='Enable audio';audioButton.setAttribute('aria-pressed','false');};
 audio.onDiagnostic=value=>{document.querySelector('#audio-report').textContent=JSON.stringify(value,null,2);};
 audioButton.onclick=async()=>{
  if(audio.enabled){disableAudio();return;}
  audioButton.disabled=true;
  try{if(await audio.enable()){audioButton.textContent='Disable audio';audioButton.setAttribute('aria-pressed','true');}}
  catch(error){audioStatus.textContent=error.message;}finally{audioButton.disabled=false;}
 };
 document.querySelector('#audio-test').onclick=async()=>{try{await audio.testSpeaker();if(audio.enabled){audioButton.textContent='Disable audio';audioButton.setAttribute('aria-pressed','true');}}catch(error){audioStatus.textContent=error.message;}};
 document.querySelector('#monitor-level').oninput=event=>{audio.master=Number(event.target.value);if(audio.gain)audio.gain.gain.value=audio.master;};
 document.querySelector('#stop').onclick=()=>{inputs.release();errorBox.textContent='';};
 socket.onmessage=({data})=>{
  const message=JSON.parse(data);
  if(message.type==='error'||message.type==='audio_error'){errorBox.textContent=message.message;return;}
  if(!message.move)return;
  frame=message.move;
  if(pendingFrame===null)pendingFrame=requestAnimationFrame(()=>{pendingFrame=null;updateMirror(frame);});
  const status=Object.fromEntries((message.params?.status??'').split(' ').map(field=>field.split('=')));
  stopped=status.play==='0';
  const info=(message.params?.['motif_clip_info_'+frame.track]??'').split(','),notes=Number(info[4]??0);
  feedback.textContent=`Track ${frame.track+1} · ${status.cin==='1'?'Count-in':status.rec==='1'?'Recording':stopped?'Stopped':'Playing'} · ${notes} ${notes===1?'note':'notes'}`;
  if(lastTrack!==frame.track){lastTrack=frame.track;send({type:'dev_watch',keys:['motif_clip_info_'+frame.track]});}
  if(frame.ready)inputs.enable();
 };
 socket.onerror=error=>{errorBox.textContent=error.message??'Engine connection failed';};
 socket.onclose=()=>{feedback.textContent='Engine closed · reload to reconnect';};
 send({type:'subscribe_tool'});
 for(const id of ['audio','audio-test','stop'])document.querySelector('#'+id).disabled=false;
 document.querySelector('#build').textContent=`Movy ${audio.build?.integrationVersion??'unknown'} · HarmonyBus ${metadata.version} · engine ${audio.build?.engineSource?.commit?.slice(0,12)??'unknown'} · UI ${audio.build?.hostSource?.commit?.slice(0,12)??'local'} · 44,100 Hz`;
 audio.onDiagnostic(audio.diagnostic());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)disableAudio();});
 await mountSessions({sessions,storageKey:'move',captureUI:()=>({monitor:audio.master}),
  restoreUI:ui=>{audio.master=Number.isFinite(ui?.monitor)?Math.max(0,Math.min(1,ui.monitor)):.35;document.querySelector('#monitor-level').value=audio.master;},
  disableAudio,isStopped:()=>stopped&&!inputs.isHeld(),release:inputs.release});
}catch(error){errorBox.textContent='Cannot start Move: '+error.message;feedback.textContent='Engine unavailable';}
