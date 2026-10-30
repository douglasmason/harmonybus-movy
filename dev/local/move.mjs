import {openBrowserConnection} from '/wasm/full/joint-transport.mjs';
import {controls,mountMoveSurface} from './build/move-surface.mjs';
import {mountMoveInput} from './move-input.mjs';
import {mountSessions} from './session-ui.mjs';

const errorBox=document.querySelector('#error'),feedback=document.querySelector('#feedback');
try{
 const {socket,audio,sessions,metadata}=await openBrowserConnection({surface:'move'});
 const send=message=>socket.send(JSON.stringify(message));
 const inputs=mountMoveInput({controls,send}),surface=mountMoveSurface(inputs);
 const audioButton=document.querySelector('#audio'),audioStatus=document.querySelector('#audio-status');
 const compSource=document.querySelector('#comp-source');
 const playMode=document.querySelector('#play-mode');
 let currentMode=null,modeNames='';
 playMode.onchange=()=>{
  if(currentMode===null)return;
  if(!inputs.isHeld())send({type:'move_mode',previous:currentMode,mode:Number(playMode.value)});
  // Reconcile from the engine, including a refused choice during motif editing.
  playMode.value=String(currentMode);playMode.disabled=true;
 };
 let accompaniment=null;
 compSource.onchange=()=>{
  if(!accompaniment)return;
  compSource.dataset.setting=''; // Reconcile the selection even if the engine refuses it.
  send({type:'move_comp_source',group:accompaniment.group,source:Number(compSource.value)});
 };
 let stopped=true,lastTrack=-1,lastPress=null,lastOutput=null;
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
  const frame=message.move;
  const names=JSON.stringify(frame.modes);
  if(names!==modeNames){
   modeNames=names;playMode.replaceChildren(...frame.modes.map((name,index)=>{
    const option=document.createElement('option');option.value=index;option.textContent=name;return option;
   }));
  }
  currentMode=frame.mode;playMode.value=String(currentMode);
  playMode.disabled=!frame.ready||frame.held>0||inputs.isHeld();
  accompaniment=frame.accompaniment;
  if(accompaniment){
   const {melody,comp,source}=accompaniment;
   if(compSource.dataset.setting!==`${accompaniment.group}:${source}`){compSource.value=String(source);compSource.dataset.setting=`${accompaniment.group}:${source}`;}
   compSource.disabled=!frame.ready||frame.held>0||accompaniment.overridden;
   document.querySelector('#comp-route').textContent=`Track ${melody+1} melody · Track ${comp+1} comp`;
   document.querySelector('#comp-explanation').textContent=[
    `Playing Track ${melody+1} also triggers Track ${comp+1}. Approach pads can sound together with their target. Choose Clip for independent playing.`,
    `Track ${comp+1} plays its own clip. Track ${melody+1} pads play without linked comp accompaniment.`,
    `Track ${comp+1} uses independent pads in Joint Play. It does not follow Track ${melody+1}.`,
    `Track ${comp+1} keeps its clip rhythm; Track ${melody+1} guides its register.`
   ][source];
   if(accompaniment.overridden){
    document.querySelector('#comp-route').textContent='Chord Play accompaniment';
    document.querySelector('#comp-explanation').textContent='Use the on-screen Chord Play controls for its accompaniment. The bank’s Comp source resumes when you leave Chord Play.';
   }
  }
  const status=Object.fromEntries((message.params?.status??'').split(' ').map(field=>field.split('=')));
  surface.update(frame,Number(status.bpm)/100);
  if(lastPress!==frame.lastPlayed?.serial){
   lastPress=frame.lastPlayed?.serial;
   document.querySelector('#played-intent').textContent=frame.lastPlayed?`Pad ${frame.lastPlayed.pad+1} · ${frame.lastPlayed.label.description}`:'Tap a pad to inspect its musical input.';
  }
  if(lastOutput!==frame.lastOutput?.serial){
   lastOutput=frame.lastOutput?.serial;
   document.querySelector('#played-output').textContent=frame.lastOutput?
    frame.lastOutput.outputs.map(output=>`Ch ${output.channel}: ${output.names.join(' · ')}`).join(' / '):
    'Rendered notes appear here, grouped by MIDI channel.';
  }
  stopped=status.play==='0';
  const info=(message.params?.['motif_clip_info_'+frame.track]??'').split(','),notes=Number(info[4]??0);
  const mode=frame.modes[frame.mode];
  feedback.textContent=`Track ${frame.track+1} · ${mode} · ${status.cin==='1'?'Count-in':status.rec==='1'?'Recording':stopped?'Stopped':'Playing'} · ${notes} ${notes===1?'note':'notes'}`;
  if(lastTrack!==frame.track){lastTrack=frame.track;send({type:'dev_watch',keys:['motif_clip_info_'+frame.track]});}
  if(frame.ready)inputs.enable();
 };
 socket.onerror=error=>{errorBox.textContent=error.message??'Engine connection failed';};
 socket.onclose=()=>{feedback.textContent='Engine closed · reload to reconnect';compSource.disabled=playMode.disabled=true;};
 send({type:'subscribe_tool'});
 for(const id of ['audio','audio-test','stop'])document.querySelector('#'+id).disabled=false;
 document.querySelector('#build').textContent=`Movy ${audio.build?.engineSource?.integrationVersion??'unknown'} · HarmonyBus ${metadata.version} · engine ${audio.build?.engineSource?.commit?.slice(0,12)??'unknown'} · UI ${audio.build?.hostSource?.commit?.slice(0,12)??'local'} · 44,100 Hz`;
 audio.onDiagnostic(audio.diagnostic());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)disableAudio();});
 const zoom=document.querySelector('#display-size'),expand=document.querySelector('#display-expand'),sharp=document.querySelector('#display-sharp');
 zoom.onchange=()=>document.documentElement.style.setProperty('--display-width',zoom.value+'px');
 expand.onclick=()=>{const enlarged=document.body.classList.toggle('display-expanded');expand.textContent=enlarged?'Close large display':'Enlarge display';expand.setAttribute('aria-expanded',String(enlarged));};
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.body.classList.remove('display-expanded');expand.textContent='Enlarge display';expand.setAttribute('aria-expanded','false');}});
 await mountSessions({sessions,storageKey:'move',captureUI:()=>({monitor:audio.master,displayWidth:Number(zoom.value),displaySharp:sharp.checked}),
  restoreUI:ui=>{audio.master=Number.isFinite(ui?.monitor)?Math.max(0,Math.min(1,ui.monitor)):.35;document.querySelector('#monitor-level').value=audio.master;zoom.value=String([384,512,640].includes(ui?.displayWidth)?ui.displayWidth:512);zoom.onchange();sharp.checked=ui?.displaySharp!==false;sharp.dispatchEvent(new Event('change'));},
  disableAudio,isStopped:()=>stopped&&!inputs.isHeld(),release:inputs.release});
}catch(error){errorBox.textContent='Cannot start Move: '+error.message;feedback.textContent='Engine unavailable';}
