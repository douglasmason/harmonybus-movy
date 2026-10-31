/** Switch transport ownership without remounting the surface or transferring data. */
import {deviceStreamURL,openDeviceConnection,blankDeviceFrame} from './move-device.mjs';
export function createMoveConnection({browser,inputs,onState,onFrame,pageURL,openDevice=openDeviceConnection}){
 /** @type {import('./workspace-contract.d.ts').Engine} */
 let engine='browser',device=null,generation=0,busy=false,signature='';
 const watches=new Map();
 function flushWatches(){if(engine!=='browser'||busy)return;const keys=[...new Set([...watches.values()].flat())].sort(),next=JSON.stringify(keys);if(keys.length>64)throw new Error('Workspace watch limit exceeded');if(next!==signature){signature=next;browser.socket.send(JSON.stringify({type:'dev_watch',keys}));}}
 function watch(owner,keys){watches.set(owner,keys);flushWatches();}
 const notify=(state,message,capabilities)=>onState({engine,state,message,capabilities});
 const blank=()=>onFrame(blankDeviceFrame());
 function disconnect(){++generation;const previous=device;device=null;previous?.close();if(engine==='move'){blank();notify('disconnected','Disconnected from Move');}}
 async function select(next){
  if(busy||next===engine||!['browser','move'].includes(next))return;
  inputs.disable();busy=true; // Release to the old owner before changing it.
  disconnect();engine=next;blank();notify('switching',next==='move'?'Stopping browser engine…':'Resuming browser session…');
  try{
   await browser.setActive(next==='browser');
   busy=false;signature='';flushWatches();
   notify(next==='browser'?'browser':'disconnected',next==='browser'?'Browser · session retained · audio off':'Disconnected from Move');
  }catch(error){notify('error',error.message);}finally{busy=false;}
 }
 function connect(address){
  if(busy||engine!=='move')return;
  disconnect();const attempt=++generation;
  let url;try{url=deviceStreamURL(address,pageURL);}catch(error){notify('error',error.message);return;}
  device=openDevice({url,onFrame:frame=>{if(attempt===generation&&engine==='move')onFrame(frame);},
   onState:(state,message,capabilities)=>{if(attempt!==generation||engine!=='move')return;if(['error','disconnected'].includes(state))blank();notify(state,message,capabilities);}});
 }
 return {select,connect,disconnect,watch,get engine(){return engine;},get busy(){return busy;},
  send(message){if(engine==='browser'&&!busy)browser.socket.send(JSON.stringify(message));},
  acceptBrowserFrame:()=>engine==='browser'&&!busy};
}
