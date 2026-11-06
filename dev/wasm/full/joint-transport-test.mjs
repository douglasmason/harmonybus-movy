import test from 'node:test';
import assert from 'node:assert/strict';
import {openBrowserConnection} from './joint-transport.mjs';

test('startup failure terminates its Worker, aborts preparation and ignores late replies',async context=>{
 for(const scenario of ['fatal','post','audio','timeout','audio-timeout','close','success'])await context.test(scenario,async testContext=>{
  const keys=['document','window','Worker','fetch','__wasmRead','__wasmStats'];
  const original=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const listeners=new Map(),messages=[];let worker,signal,terminated=0;
  const document={hidden:false,querySelector:()=>null,addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name)};
  const window={addEventListener:document.addEventListener,removeEventListener:document.removeEventListener};
  class Worker{
   constructor(){worker=this;}
   postMessage(message){messages.push(message);if(scenario==='post'&&message.type==='init')throw new Error('Cannot initialize Worker');}
   terminate(){terminated++;}
  }
  const fetch=async(_url,options)=>{
   signal=options.signal;
   if(scenario==='audio')return {ok:false};
   if(scenario==='audio-timeout'||scenario==='close')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true}));
   return {ok:true,text:async()=>'// audio processor'};
  };
  testContext.mock.timers.enable({apis:['setTimeout']});
  try{
   for(const [key,value] of Object.entries({document,window,Worker,fetch}))Object.defineProperty(globalThis,key,{value,configurable:true});
   const opening=openBrowserConnection({surface:'move'});
   const outcome=scenario==='success'?opening:assert.rejects(opening,/fatal|Cannot initialize|Missing audio|timed out|closed/);
   if(scenario==='fatal')worker.onmessage({data:{type:'fatal',message:'fatal engine fixture'}});
   else if(scenario!=='post'&&scenario!=='timeout')worker.onmessage({data:{type:'ready',metadata:{version:'test'},build:{}}});
   await Promise.resolve();
   if(scenario.includes('timeout'))testContext.mock.timers.tick(30000);
   if(scenario==='close')listeners.get('pagehide')();
   const connection=await outcome;
   if(scenario==='success'){
    testContext.mock.timers.tick(30000);assert.equal(terminated,0,'startup deadline is cancelled after success');
    assert.equal(connection.socket.readyState,1);connection.socket.close();assert.equal(connection.socket.readyState,3);
   }
   assert.equal(terminated,1);assert.equal(listeners.size,0);if(signal)assert.equal(signal.aborted,true);
   const count=messages.length;
   worker.onmessage({data:{type:'ready',metadata:{version:'late'}}});worker.onmessage({data:{type:'update',value:{}}});
   assert.equal(messages.length,count,'a terminated owner cannot acknowledge late updates');
   if(scenario!=='success')assert.equal(globalThis.__wasmRead,original.get('__wasmRead')?.value,'failed startup never exposes a browser session');
  }finally{for(const [key,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
 });
});
