import {checkDeviceCapabilities,discoverPageCompanion} from './move-device.mjs';
import {openBrowserConnection} from '/wasm/full/joint-transport.mjs';
import {controls,mountMoveSurface} from './build/move-surface.mjs';
import {mountMoveInput} from './move-input.mjs';
import {mountSessions} from './session-ui.mjs';
import {createMoveConnection} from './move-connection.mjs';
import {mountMoveWorkspace} from './move-workspace.mjs';

const errorBox=document.querySelector('#error'),feedback=document.querySelector('#feedback');
try{
 const browser=await openBrowserConnection({surface:'move'});
 const {socket,audio,sessions,metadata}=browser;
 let connection,sessionUI,workspace,workspaceAvailable=true;
 const send=message=>connection?.send(message);
 const inputs=mountMoveInput({controls,send,releaseOthers:()=>workspace?.release(),othersHeld:()=>workspace?.isHeld()??false}),surface=mountMoveSurface(inputs);
 const audioButton=document.querySelector('#audio'),audioStatus=document.querySelector('#audio-status');
 const compSource=document.querySelector('#comp-source');
 const playMode=document.querySelector('#play-mode');
 let currentMode=null,modeNames='';
 const engineSelector=document.querySelector('#engine'),address=document.querySelector('#move-address');
 const connect=document.querySelector('#move-connect'),disconnect=document.querySelector('#move-disconnect');
 const transportEnabled=document.querySelector('#move-transport-enabled'),pairingKey=document.querySelector('#move-pairing-key'),transportStatus=document.querySelector('#move-transport-status');
 const check=document.querySelector('#move-check'),capabilityStatus=document.querySelector('#move-capabilities');
 let capabilityRequest=null;
 const cancelCheck=()=>{capabilityRequest?.abort();capabilityRequest=null;check.disabled=false;capabilityStatus.textContent='Capabilities not checked. Check reads installed module metadata only.';};
 const transportButtons=[...document.querySelectorAll('[data-move-transport]')];
 const controlState=(ready,message)=>{for(const button of transportButtons)button.disabled=!ready;transportStatus.textContent=message;};
 const isBrowser=()=>connection.engine==='browser'&&!connection.busy&&connection.ready;
 connection=createMoveConnection({browser,inputs:{disable(){workspace?.suspend();inputs.disable();}},pageURL:location.href,onFrame:frame=>surface.update(frame),
  onState:({engine,state,message})=>{
   if(state==='switching')cancelCheck();
   const local=engine==='browser',switching=state==='switching'||(local&&state==='error');
   if(workspaceAvailable!==(local&&!switching)){workspaceAvailable=local&&!switching;workspace?.setAvailable(workspaceAvailable);}
   engineSelector.value=engine;engineSelector.disabled=state==='switching';
   document.querySelector('#engine-status').textContent=message;
   document.querySelector('#engine-status').dataset.state=state;
   document.querySelector('#move-connection').hidden=local;
   document.querySelector('#engine-mode-label').textContent=local?'Browser studio':'Move device';
   if(!['connecting','connected'].includes(state))controlState(false,local?'':'Read-only · enable paired transport before connecting');
   transportEnabled.disabled=pairingKey.disabled=address.disabled=connect.disabled=switching||state==='connecting'||state==='connected';
   disconnect.disabled=local||switching||!['connecting','connected'].includes(state);
   for(const id of ['audio','audio-test','stop','monitor-level'])document.querySelector('#'+id).disabled=!local||switching;
   for(const selector of ['.accompaniment','.played-readout','#sessions','#audio-settings'])document.querySelector(selector).hidden=!local;
   document.querySelector('.screen-hint').textContent=local?'Drag a displayed parameter to adjust it; tap to touch its knob.':'Live device pixels. Rich labels and remote gestures are unavailable in this protocol.';
   if(!local){
    playMode.disabled=true;playMode.replaceChildren(new Option('Read on Move display',''));
    currentMode=null;modeNames='';lastTrack=-1;
    feedback.textContent=state==='connected'?'Use physical controls for pads, knobs and recording · audio plays on Move':message;
    audioStatus.textContent=connection.ready?'Browser engine suspended · browser session retained · no session transfer':'Waiting for browser suspension acknowledgment';
   }else if(!switching){audioStatus.textContent='Browser audio off · tap Enable audio to listen';}
  }});
 workspace=mountMoveWorkspace({connection,inputs});
 engineSelector.onchange=async()=>{
  if(sessionUI?.isBusy()){engineSelector.value=connection.engine;return;}
  errorBox.textContent='';await connection.select(engineSelector.value);
 };
 let addressEdited=false;
 address.addEventListener('input',()=>{addressEdited=true;cancelCheck();});
 const discovery=new AbortController(),discoveryTimeout=setTimeout(()=>discovery.abort(),3000);
 discoverPageCompanion(location.href,{signal:discovery.signal}).then(endpoint=>{
  if(!endpoint||discovery.signal.aborted||addressEdited||address.value||connection.engine==='move'&&address.disabled)return;
  address.value=endpoint;
  document.querySelector('#move-endpoint-hint').textContent='This local companion address is ready. Choose Connect explicitly; Move has not been contacted.';
 }).finally(()=>clearTimeout(discoveryTimeout));
 check.onclick=async()=>{
  cancelCheck();const request=new AbortController();capabilityRequest=request;check.disabled=true;capabilityStatus.textContent='Checking installed module metadata…';
  const timeout=setTimeout(()=>request.abort(),6000);
  try{const report=await checkDeviceCapabilities(address.value,location.href,{signal:request.signal});if(capabilityRequest===request)capabilityStatus.textContent=report;}
  catch(error){if(capabilityRequest===request)capabilityStatus.textContent=request.signal.aborted?'Capability check timed out. Check the companion and Move addresses.':error.message;}
  finally{clearTimeout(timeout);if(capabilityRequest===request){capabilityRequest=null;check.disabled=false;}}
 };
 transportEnabled.onchange=()=>{pairingKey.hidden=!transportEnabled.checked;if(!transportEnabled.checked)pairingKey.value='';};
 connect.onclick=()=>{const key=transportEnabled.checked?pairingKey.value.trim():undefined;pairingKey.value='';if(transportEnabled.checked&&!/^[a-f0-9]{64}$/.test(key)){controlState(false,'Enter the 64-character pairing key printed by the companion.');return;}connection.connect(address.value,{pairingKey:key,onControlState:controlState});};
 for(const button of transportButtons)button.onclick=()=>{if(!connection.transport(button.dataset.moveTransport))transportStatus.textContent='Request not sent · transport unavailable or busy';};
 disconnect.onclick=()=>connection.disconnect();
 window.addEventListener('pagehide',()=>{discovery.abort();cancelCheck();connection.disconnect();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&connection.engine==='move')connection.disconnect();});
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
  if(!isBrowser())return;
  if(audio.enabled){disableAudio();return;}
  audioButton.disabled=true;
  try{if(await audio.enable()){audioButton.textContent='Disable audio';audioButton.setAttribute('aria-pressed','true');}}
  catch(error){audioStatus.textContent=error.message;}finally{audioButton.disabled=!isBrowser();}
 };
 document.querySelector('#audio-test').onclick=async()=>{if(!isBrowser())return;try{await audio.testSpeaker();if(audio.enabled){audioButton.textContent='Disable audio';audioButton.setAttribute('aria-pressed','true');}}catch(error){audioStatus.textContent=error.message;}};
 document.querySelector('#monitor-level').oninput=event=>{audio.master=Number(event.target.value);if(audio.gain)audio.gain.gain.value=audio.master;};
 document.querySelector('#stop').onclick=()=>{inputs.release();errorBox.textContent='';};
 socket.onmessage=({data})=>{
  if(!connection.acceptBrowserFrame())return;
  const message=JSON.parse(data);
  if(message.type==='error'||message.type==='audio_error'){errorBox.textContent=message.message;return;}
  workspace.receive(message);
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
  if(lastTrack!==frame.track){lastTrack=frame.track;connection.watch('surface',['motif_clip_info_'+frame.track]);}
  if(frame.ready)inputs.enable();
 };
 socket.onerror=error=>{errorBox.textContent=error.message??'Engine connection failed';};
 socket.onclose=()=>{feedback.textContent='Engine closed · reload to reconnect';compSource.disabled=playMode.disabled=true;};
 send({type:'subscribe_tool'});
 for(const id of ['audio','audio-test','stop'])document.querySelector('#'+id).disabled=false;
 document.querySelector('#build').textContent=`Movy ${audio.build?.engineSource?.integrationVersion??'unknown'} · HarmonyBus ${metadata.version} · engine ${audio.build?.engineSource?.commit?.slice(0,12)??'unknown'} · UI ${audio.build?.hostSource?.commit?.slice(0,12)??'local'} · 44,100 Hz`;
 audio.onDiagnostic(audio.diagnostic());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)disableAudio();});
 const zoom=document.querySelector('#display-size'),sharp=document.querySelector('#display-sharp');
 zoom.onchange=()=>document.documentElement.style.setProperty('--display-width',zoom.value+'px');
 sessionUI=await mountSessions({sessions,storageKey:'move',legacyStorageKeys:['current'],isActive:isBrowser,captureUI:()=>({monitor:audio.master,displayWidth:Number(zoom.value),displaySharp:sharp.checked,workspace:workspace.capture()}),
  restoreUI:ui=>{workspace.restore(ui?.workspace);audio.master=Number.isFinite(ui?.monitor)?Math.max(0,Math.min(1,ui.monitor)):.35;document.querySelector('#monitor-level').value=audio.master;zoom.value=String([384,512,640].includes(ui?.displayWidth)?ui.displayWidth:512);zoom.onchange();sharp.checked=ui?.displaySharp!==false;sharp.dispatchEvent(new Event('change'));},
  disableAudio,isStopped:()=>isBrowser()&&stopped&&!inputs.isHeld(),release:()=>{inputs.release();}});
 engineSelector.disabled=false;
}catch(error){errorBox.textContent='Cannot start Move: '+error.message;feedback.textContent='Engine unavailable';}
