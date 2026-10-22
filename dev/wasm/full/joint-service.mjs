/** Local protocol transport. Every musical command enters production Movy DSP. */
import {createFullEngine} from './engine.mjs';
import {prepareMetadata,trackKey,jointAction,routingKeys,readableKey,validateEngineCommand} from '../../local/protocol-policy.mjs';
import {capturePayload,sealSession,validateSession,restoreCandidate} from './session.mjs';
import {observation,eventObservation} from '../../local/observations.mjs';
export async function createJointService(raw,emit,build=null){
 const {metadata,readable,enabledWrites}=prepareMetadata(raw);
 let engine=await createFullEngine();
 // Browser fixture uses a production synth; the differential fixture retains probe.
 for(let track=0;track<16;track++)engine.request('set',`ch${track}:synth:module`,'nusaw');
 engine.request('step',64);
 for(let track=0;track<16;track++)for(const [key,value] of [['chorus_mix','0'],['delay_mix','0'],['volume','.6']])engine.request('set',`ch${track}:synth:${key}`,value);
 for(let track=0;track<16;track++)engine.request('set',`ch${track}:mix`,'.6,0,0,0,0');
 let audioPort=null,audioEpoch=0,audioLast=0;
 let hidden=false,blocksProcessed=0;
 let loading=false,epoch=1,snapshotSequence=0,sampleFrame=0;
 let sequence=0,recent=[],watches=[],timer=null,last=performance.now(),remainder=0,beat=0;
 const touches=new Map(),physical=new Set();
 const socket={readyState:1,onmessage:event=>emit(JSON.parse(event.data)),onclose:null,onerror:null,onopen:null,send,close};
 const base=['status','song_section'];
 for(let track=0;track<4;track++)for(const key of ['role','version','travel_map','master_transpose','harmony_snapshot','harmony_source_snapshot','follower_snapshot','shared_context_snapshot','pad_view','field_outputs_view2'])base.push(`ch${track}:midi_fx1:${key}`);
 function request(...args){
  const result=engine.request(...args);
  if(['step','render'].includes(args[0]))sampleFrame+=Number(args[1])*128;
  for(const packet of result.events)recent.push({...eventObservation(packet,{epoch,sequence:++sequence,sampleFrame,operation:args[0],key:args[1]}),beat});
  recent=recent.slice(-256);return result;
 }
 function snapshot(id){
  const params={};for(const key of new Set([...base,...watches]))params[key]=request('get',key).value;
  socket.onmessage?.({data:JSON.stringify({type:'param_update',params,beat,events:recent,observation:observation(params,{epoch,sequence:++snapshotSequence,sampleFrame,build}),requestId:id})});
 }
 function cleanup(){
  for(const note of physical)request('midi',`128,${note},0`);physical.clear();
  for(const [key,cancel] of touches)request('set',key,cancel);touches.clear();
  request('set','cmd','stop');request('set','joint_release','1');
  for(let track=0;track<16;track++)request('set',`ch${track}:synth:all_notes_off`,'1');
  flushAudio();
 }
 function flushAudio(){if(audioPort)audioPort.postMessage({type:'reset',epoch:++audioEpoch});}
 function detachAudio(){
  audioPort?.close();audioPort=null;cleanup();last=performance.now();remainder=0;
 }
 function attachAudio(port){
  detachAudio();audioPort=port;audioLast=performance.now();
  port.onmessage=({data})=>{
   if(port!==audioPort||hidden||data.type!=='pull'||data.epoch!==audioEpoch)return;
   audioLast=performance.now();
   const {pcm}=request('render',8);beat+=1024/44100*2;blocksProcessed+=8;
   let peak=0;for(const sample of pcm)peak=Math.max(peak,Math.abs(sample)/32768);
   port.postMessage({type:'pcm',epoch:audioEpoch,pcm,peak},[pcm.buffer]);
  };port.start();flushAudio();start();
 }
 function mix(actor,level){
  if(!Number.isInteger(actor)||actor<0||actor>3||!Number.isFinite(level)||level<0||level>1)throw new Error('Invalid mix');
  for(let track=actor;track<16;track+=4){const values=engine.request('get',`ch${track}:mix`).value.split(',');values[0]=String(level);request('set',`ch${track}:mix`,values.join(','));}
 }
 function close(){
  if(socket.readyState!==1)return;
  detachAudio();clearInterval(timer);
  socket.readyState=3;socket.onclose?.();
 }
 function visibility(value){hidden=value;if(hidden){cleanup();snapshot();}last=performance.now();remainder=0;}
 function start(){
  if(timer)return;last=performance.now();
  timer=setInterval(()=>{
   const now=performance.now(),elapsed=now-last;last=now;
   if(hidden||loading)return;
   if(audioPort){
    if(now-audioLast>2000){detachAudio();emit({type:'audio_error',message:'No AudioWorklet requests for 2 seconds; tap Enable audio to resume'});}
    snapshot();return;
   }
   // A suspended page stops rather than replaying a backlog of timed events.
   if(elapsed>250){cleanup();remainder=0;snapshot();return;}
   remainder+=elapsed*44.1;const blocks=Math.floor(remainder/128);remainder-=blocks*128;
   if(blocks){beat+=blocks*128/44100*2;request('step',blocks);blocksProcessed+=blocks;}snapshot();
  },40);
 }
 function send(encoded){
  if(socket.readyState!==1)return;
  queueMicrotask(()=>{
   if(socket.readyState!==1)return;
   try{
    const message=JSON.parse(encoded);
    if(message.type==='set_param'){
     const key=String(message.key??'').replace(/^overtake_dsp:/,''),value=String(message.value??'');
     if(value.length>1024||/[\r\n\t]/.test(value))throw new Error('Invalid value');
     const match=trackKey.exec(key);
     if(!routingKeys.has(key)&&(!match||(!enabledWrites.has(match[2])&&!jointAction.test(match[2]))))throw new Error('Parameter unavailable');
     if(match&&jointAction.test(match[2])){
      if(/(?:^|\|)(?:Down|Touch|Knob)/.test(value))touches.set(key,(value.includes('|')?value.split('|')[0]+'|':'')+'Cancel');
      else if(/(?:Up|Cancel)/.test(value))touches.delete(key);
     }
     request('set',key,value);
    }else if(message.type==='dev_midi'){
     const data=message.data;
     if(!Array.isArray(data)||data.length!==3||data.some(value=>!Number.isInteger(value)))throw new Error('Invalid MIDI');
     request('midi',data.join(','));
     if(data[0]===144&&data[2])physical.add(data[1]);else if(data[0]===128||data[0]===144)physical.delete(data[1]);
    }else if(message.type==='dev_transport'){
     const {action,mask,overwrite}=message;let command;
     if(action==='play'||action==='stop')command=action;
     else if(action==='record'&&Number.isInteger(mask)&&mask>0&&mask<=65535&&Number.isInteger(overwrite)&&overwrite>=0&&overwrite<=65535&&(overwrite&mask)===overwrite)command=`jrec ${mask} ${overwrite}`;
     else throw new Error('Invalid transport');
     if(action==='stop')cleanup();else request('set','cmd',command);
    }else if(message.type==='dev_engine_edit')request('set','cmd',validateEngineCommand(message.value));
    else if(message.type==='dev_watch'){
     if(!Array.isArray(message.keys)||message.keys.length>64||message.keys.some(key=>!readableKey(key,readable)))throw new Error('Invalid watch');
     watches=[...new Set(message.keys)];
    }else if(message.type==='dev_release')cleanup();
    else if(!['subscribe_tool','refetch_tool','subscribe','get_hierarchy'].includes(message.type))throw new Error('Unsupported message');
    snapshot(message.id);start();
   }catch(error){socket.onmessage?.({data:JSON.stringify({type:'error',message:error.message})});}
  });
 }
 async function save(ui){
  if(/(?:^| )play=1/.test(engine.request('get','status').value))throw new Error('Stop playback before saving a session');
  if(physical.size||touches.size)throw new Error('Release held controls before saving');
  return sealSession(capturePayload(engine,ui),build??{harmonybus:raw.version});
 }
 async function open(session){
  await validateSession(session);
  loading=true;
  let candidate;
  try{
   candidate=await createFullEngine();
   const ui=await restoreCandidate(candidate,session);
   cleanup();const previous=engine;engine=candidate;candidate=null;previous.dispose?.();
   epoch++;recent=[];last=performance.now();remainder=0;beat=0;sampleFrame=0;
   snapshot();return ui;
  }finally{candidate?.dispose?.();loading=false;last=performance.now();}
 }
 return {metadata,socket,visibility,attachAudio,detachAudio,mix,save,open,read:key=>engine.request('get',key).value,stats:()=>({blocksProcessed,sequence,epoch,audioClock:!!audioPort})};
}
