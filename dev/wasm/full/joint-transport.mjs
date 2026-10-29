/** Page transport only. A dedicated worker owns the engine and its clock. */
import {PcmMonitor} from './pcm-monitor.mjs';
export async function openBrowserConnection({surface='joint'}={}){
 document.title=surface==='move'?'Move · Browser Movy':'Joint Play · Browser HB';
 const moveLink=document.querySelector('a[href="/movy"]');
 if(moveLink){moveLink.href='/move/';moveLink.textContent='Full Move surface & clip editing';}
 const worker=new Worker(new URL('./joint-worker.mjs',import.meta.url),{type:'module'});
 const audio=new PcmMonitor(worker);
 let serial=0,closed=false;
 const pending=new Map();
 const socket={readyState:0,onmessage:null,onclose:null,onerror:null,onopen:null,
  send:data=>{if(socket.readyState===1)worker.postMessage({type:'send',data});},close};
 function close(){
  if(closed)return;closed=true;socket.readyState=3;
  audio.disable();worker.terminate();document.removeEventListener('visibilitychange',visibility);
  window.removeEventListener('pagehide',close);
  for(const {reject} of pending.values())reject(new Error('Browser engine closed'));pending.clear();
  socket.onclose?.();
 }
 function visibility(){worker.postMessage({type:'visibility',hidden:document.hidden});}
 function inspect(type,key,value){
  if(closed)return Promise.reject(new Error('Browser engine closed'));
  return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});worker.postMessage({type,key,value,id});});
 }
 const ready=new Promise((resolve,reject)=>{
  worker.onerror=event=>{reject(new Error(event.message));socket.onerror?.(event);close();};
  worker.onmessage=({data})=>{
   if(data.type==='ready'){audio.build=data.build;socket.readyState=1;resolve(data.metadata);}
   else if(data.type==='fatal'){const error=new Error(data.message);reject(error);socket.onerror?.(error);close();}
   else if(data.type==='reply'){const item=pending.get(data.id);pending.delete(data.id);if(data.error)item?.reject(new Error(data.error));else item?.resolve(data.value);}
   else if(data.type==='update'||data.type==='event'){
    if(data.value.type==='audio_error')audio.disable();
    socket.onmessage?.({data:JSON.stringify(data.value)});
    if(data.type==='update')worker.postMessage({type:'ack'});
   }
  };
 });
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',close);
 worker.postMessage({type:'init',hidden:document.hidden,surface});
 const metadata=await ready;
 try{await audio.prepare();}catch(error){close();throw error;}
 // Asynchronous, read-only development inspection across the worker boundary.
 globalThis.__wasmRead=key=>inspect('read',key);
 globalThis.__wasmStats=()=>inspect('stats');
 const sessions={save:ui=>inspect('session-save',null,ui),open:session=>inspect('session-open',null,session),newSession:ui=>inspect('session-new',null,ui)};
 return {metadata,socket,audio,sessions,label:'Browser Joint Play connected · WebAssembly Worker'};
}
