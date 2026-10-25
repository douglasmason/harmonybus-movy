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
  await both('set','cmd','song 0;songadd 1;songadd 0;songsection 0 bars 1;songsection 1 bars 1;songsection 1 track 1 2');
  await both('get','state');await both('get','song_section_0');await both('get','song_section_1');
  await both('set','ch0:lfo1:shape','6');await both('get','ch0:lfo1:shape');await both('get','ch0:lfo1:field_source_version');
  await both('set','cmd','play');const visits=new Set();
  for(let index=0;index<8;index++){
   await both('step',512);const section=JSON.parse((await both('get','song_section')).value);visits.add(section.visit);
  }
  assert(visits.size>1,'section visits advance across the engine-owned boundaries');
  await both('set','cmd','stop');
 }finally{native.close();}
});

test('production NuSaw renders stereo PCM through Movy/Schwung and panic silences it',async()=>{
 const engine=await createFullEngine();
 engine.request('set','ch0:synth:module','nusaw');engine.request('step',64);
 assert.equal(engine.request('get','ch0:synth:name').value,'NuSaw');
 for(const key of ['chorus_mix','delay_mix'])engine.request('set',`ch0:synth:${key}`,'0');
 const quiet=engine.request('render',8).pcm;assert(quiet.every(value=>value===0));
 engine.request('set','joint_map',Array(32).fill('0,60,-1,0').join(';'));
 engine.request('midi','144,68,100');
 const output=engine.request('render',8);
 assert.equal(output.pcm.length,2048);assert(output.pcm.some(value=>Math.abs(value)>100));
 engine.request('midi','128,68,0');engine.request('set','cmd','stop');
 engine.request('set','ch0:synth:all_notes_off','1');engine.request('step',16);
 assert(engine.request('render',8).pcm.every(value=>Math.abs(value)<2));
 assert.throws(()=>engine.request('render',9),/Invalid/);
});
