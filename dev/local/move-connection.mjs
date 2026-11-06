/** Switch transport ownership without remounting the surface or transferring data. */
import {deviceStreamURL,openDeviceConnection,blankDeviceFrame} from './move-device.mjs';
export function createMoveConnection({browser,inputs,onState,onFrame,pageURL,openDevice=openDeviceConnection,diagnostics}){
 /** @type {import('./workspace-contract.d.ts').Engine} */
 let engine='browser',device=null,generation=0,busy=false,ready=true,signature='',failure=null;
 const watches=new Map();
 function flushWatches(){if(engine!=='browser'||busy||!ready)return;const keys=[...new Set([...watches.values()].flat())].sort(),next=JSON.stringify(keys);if(keys.length>64)throw new Error('Workspace watch limit exceeded');if(next!==signature){signature=next;browser.socket.send(JSON.stringify({type:'dev_watch',keys}));}}
 function watch(owner,keys){watches.set(owner,keys);flushWatches();}
 const notify=(state,message,capabilities)=>onState({engine,state,message,capabilities});
 const blank=()=>onFrame(blankDeviceFrame());
 function disconnect(reason='user'){++generation;const previous=device;device=null;if(previous){diagnostics?.event('mirror-closed',{reason});diagnostics?.event('transport-closed');}previous?.close(reason);if(engine==='move'&&!failure){blank();notify('disconnected','Disconnected from Move');}}
 function browserClosed(message='Browser engine closed'){
  if(failure)return;
  diagnostics?.event('browser-engine-failed');
  failure=`${message} · reload to restart; unsaved edits may be lost`;ready=false;busy=false;
  disconnect('browser-failed');inputs.disable();blank();notify('error',failure);
 }
 async function select(next){
  if(failure){notify('error',failure);return;}
  if(busy||next===engine||!['browser','move'].includes(next))return;
  inputs.disable();busy=true;ready=false; // Release to the old owner before changing it.
  disconnect('engine-change');engine=next;blank();notify('switching',next==='move'?'Stopping browser engine…':'Resuming browser session…');
  try{
   await browser.setActive(next==='browser');
   if(failure)return; // A late pause/resume reply cannot revive a failed owner.
   diagnostics?.event('browser-ownership-ready');busy=false;ready=true;signature='';flushWatches();
   notify(next==='browser'?'browser':'disconnected',next==='browser'?'Browser · session retained · audio off':'Disconnected from Move');
  }catch(error){if(!failure){diagnostics?.event('browser-activation-failed');notify('error',error.message);}}finally{busy=false;}
 }
 function connect(address,options={}){
  if(failure){notify('error',failure);return;}
  if(busy||engine!=='move')return;
  if(!ready){notify('error','Browser suspension was not acknowledged. Return to Browser and retry, or reload.');return;}
  disconnect('reconnect');const attempt=++generation;diagnostics?.begin(address,!!options.pairingKey);
  let url;try{url=deviceStreamURL(address,pageURL);}catch(error){diagnostics?.event('endpoint-rejected');notify('error',error.message);return;}
  device=openDevice({url,pairingKey:options.pairingKey,onDiagnostic:(...args)=>{if(attempt===generation&&engine==='move')diagnostics?.event(...args);},onControlState:(...args)=>{if(attempt===generation&&engine==='move')options.onControlState?.(...args);},onFrame:frame=>{if(attempt===generation&&engine==='move')onFrame(frame);},
   onState:(state,message,capabilities)=>{if(attempt!==generation||engine!=='move')return;if(['error','disconnected'].includes(state))blank();notify(state,message,capabilities);}});
 }
 return {select,connect,disconnect,watch,browserClosed,get engine(){return engine;},get busy(){return busy;},get ready(){return ready;},
  transport(action){return engine==='move'&&!busy&&ready?device?.transport?.(action)??false:false;},
  send(message){if(engine==='browser'&&!busy&&ready)browser.socket.send(JSON.stringify(message));},
  acceptBrowserFrame:()=>engine==='browser'&&!busy&&ready};
}
