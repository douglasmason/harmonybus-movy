import test from 'node:test';
import assert from 'node:assert/strict';
import {PcmMonitor} from './pcm-monitor.mjs';
test('music session is selected before audio startup and restored on disable or failure',async()=>{
 const original=new Map(['navigator','isSecureContext','AudioContext','AudioWorkletNode','MessageChannel'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const session={type:'ambient'},messages=[],statuses=[];let rate=44100;
 const node={connect(){},disconnect(){},port:{postMessage(){}}};
 class Context{
  constructor(){assert.equal(session.type,'playback');this.sampleRate=rate;this.state='suspended';this.audioWorklet={addModule:async()=>{}};}
  async resume(){this.state='running';}
  async close(){this.state='closed';}
  createAnalyser(){return {connect(){}};}
  createGain(){return {gain:{value:0},connect(){}};}
 }
 try{
  for(const [key,value] of Object.entries({navigator:{audioSession:session},isSecureContext:true,AudioContext:Context,AudioWorkletNode:class{constructor(){return node;}},MessageChannel:class{constructor(){this.port1={};this.port2={};}}}))Object.defineProperty(globalThis,key,{value,configurable:true});
  const monitor=new PcmMonitor({postMessage:message=>messages.push(message)});monitor.moduleSource='// fixture';monitor.onStatus=value=>statuses.push(value);
  assert(await monitor.enable());assert.equal(session.type,'playback');
  node.port.onmessage({data:{type:'stats',rendered:1024,peak:.2}});
  assert.match(statuses.at(-1),/sound generated/);
  node.port.onmessage({data:{type:'stats',rendered:2048,peak:0}});
  assert.match(statuses.at(-1),/no notes sounding/);
  monitor.disable();assert.equal(session.type,'ambient');assert.equal(messages.at(-1).type,'audio-stop');
  rate=48000;await assert.rejects(()=>monitor.enable(),/48000 Hz; engine requires 44100 Hz/);
  assert.equal(monitor.enabled,false);assert.equal(monitor.context,null);assert.equal(session.type,'ambient');
  rate=44100;assert(await monitor.enable());
  monitor.context.state='interrupted';monitor.context.onstatechange();
  assert.equal(monitor.enabled,false);assert.match(statuses.at(-1),/interrupted/);assert.equal(session.type,'ambient');
  monitor.levels[0]=.2;monitor.muted[0]=true;assert(await monitor.enable());
  assert.equal(monitor.levels[0],.2);assert.equal(monitor.muted[0],true);monitor.disable();
  Object.defineProperty(globalThis,'AudioContext',{value:class{constructor(){throw new Error('unavailable');}},configurable:true});
  await assert.rejects(()=>monitor.enable(),/unavailable/);assert.equal(session.type,'ambient');
 }finally{for(const [key,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
