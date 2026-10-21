import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {Processor} from '../../local/processor.mjs';
import {createFullEngine} from './engine.mjs';
const directory=resolve(process.env.HB_NATIVE_BUILD??'dev/local/build');
test('full production Wasm dispatch matches native chain host: harmony, operation, recording and replay',async()=>{
 const wasm=await createFullEngine();const native=new Processor(directory);
 const keys=['ch0:midi_fx1:harmony_snapshot','ch1:midi_fx1:follower_snapshot','ch0:midi_fx1:state','ch1:midi_fx1:state'];
 const observed=[];
 async function both(...args){
  const expected=await native.request(...args);const actual=wasm.request(...args);
  assert.deepEqual(actual.events,expected.events,`MIDI ${args.join(' ')}`);
  if(args[0]==='get')assert.equal(actual.value,expected.value,`state ${args[1]}`);
  observed.push(...actual.events);return actual;
 }
 try{
  await both('get','ch0:midi_fx1:version');
  let serial=0;
  const surface=(track,status,address,pitch,velocity)=>both('set','surface_events',`${++serial},${track},${status},${address},${pitch},${velocity},0,-1,0`);
  for(const pitch of [60,64,67])await surface(0,144,pitch,pitch,100);
  await both('step',256);await surface(1,144,44,60,100);await both('step',256);
  for(const pitch of [60,64,67])await surface(0,128,pitch,pitch,0);
  for(const pitch of [62,65,69])await surface(0,144,pitch,pitch,100);
  await both('step',256);
  for(const key of keys)await both('get',key);
  await surface(1,128,44,60,0);for(const pitch of [62,65,69])await surface(0,128,pitch,pitch,0);
  await both('set','ch0:midi_fx1:joint_pad_approach_touch_0','1|Down');
  await both('step',16);await both('set','ch0:midi_fx1:joint_pad_approach_touch_0','1|Cancel');
  await both('set','joint_map',Array(32).fill('0,60,-1,0').join(';'));
  await both('set','cmd','jrec 1 1');await both('step',1200);
  await both('midi','144,68,100');await both('step',64);await both('midi','128,68,0');
  await both('set','cmd','stop');await both('step',16);
  const state=await both('get','state');assert.match(state.value,/\d+:\d+:60:100:/);
  observed.length=0;await both('set','cmd','play');await both('step',1500);
  assert(observed.some(packet=>(packet[1]&240)===144&&packet[2]===60&&packet[3]>0));
  await both('set','cmd','stop');await both('step',32);
 }finally{native.close();}
});
