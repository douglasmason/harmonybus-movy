/** Single owner of compiled musical state. Updates have one outstanding delivery. */
import {createJointService} from './joint-service.mjs';
let service,inFlight=false,latest=null;
function emit(value){
 if(value.requestId!==undefined||value.type==='error'||value.type==='audio_error'){if(value.type==='param_update')latest=null;postMessage({type:'event',value});return;}
 if(inFlight){latest=value;return;}
 inFlight=true;postMessage({type:'update',value});
}
// Initialization and commands share one ordered queue, including asynchronous startup.
let queue=Promise.resolve();
self.onmessage=({data})=>{
 queue=queue.then(async()=>{
  if(data.type==='init'){
   if(service)throw new Error('Already initialized');
   const response=await fetch('../build/full/modules/midi_fx/harmonybus/module.json');
   if(!response.ok)throw new Error('Missing HB metadata');
   const info=await fetch('../build/full/build-info.json');
   if(!info.ok)throw new Error('Missing engine build identification');
   const build=await info.json();
   if(data.surface!==undefined&&!['joint','move'].includes(data.surface))throw new Error('Unknown surface');
   const createSurface=data.surface==='move'?(await import('../../local/build/move-runtime.mjs')).createMoveRuntime:null;
   service=await createJointService(await response.json(),emit,build,createSurface);
   service.visibility(data.hidden);postMessage({type:'ready',metadata:service.metadata,build});
  }else if(!service)throw new Error('Engine not initialized');
  else if(data.type==='audio-start')service.attachAudio(data.port);
  else if(data.type==='audio-stop')service.detachAudio();
  else if(data.type==='audio-mix')service.mix(data.actor,data.level);
  else if(data.type==='session-save'||data.type==='session-open'){
   try{postMessage({type:'reply',id:data.id,value:await (data.type==='session-save'?service.save(data.value):service.open(data.value))});}
   catch(error){postMessage({type:'reply',id:data.id,error:error.message});}
  }
  else if(data.type==='send')service.socket.send(data.data);
  else if(data.type==='visibility')service.visibility(data.hidden);
  else if(data.type==='read'||data.type==='stats')postMessage({type:'reply',id:data.id,value:data.type==='read'?service.read(data.key):service.stats()});
  else if(data.type==='ack'){inFlight=false;if(latest){const value=latest;latest=null;emit(value);}}
 }).catch(error=>{service?.socket.close();postMessage({type:'fatal',message:error.message});self.close();});
};
