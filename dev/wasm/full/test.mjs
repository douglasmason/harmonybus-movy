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
  const state=await both('get','persistent_state');assert.match(state.value,/\d+:\d+:60:100:/);
  observed.length=0;await both('set','cmd','play');await both('step',1500);
  assert(observed.some(packet=>(packet[1]&240)===144&&packet[2]===60&&packet[3]>0));
  await both('set','cmd','stop');await both('step',32);
  await both('set','cmd','song 0;songadd 1;songadd 0;songsection 0 bars 1;songsection 1 bars 1;songsection 1 track 1 2');
  await both('get','persistent_state');await both('get','song_section_0');await both('get','song_section_1');
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

test('Note Blend operation arms through shared gestures and drives audible NuSaw pitch',async()=>{
 const engine=await createFullEngine();
 const set=(key,value)=>engine.request('set',key,String(value));
 const get=key=>engine.request('get',key).value;
 let serial=0;
 const surface=(status,pitch,pressure)=>set('surface_events',`${++serial},0,${status},${256+pitch},${pitch},${pressure},0,-1,0`);
 // NuSaw's normalized range 1.0 is +/-12 semitones. Do not change it implicitly.
 set('ch0:synth:module','nusaw');engine.request('step',32);
 for(const [key,value] of Object.entries({chorus_mix:0,delay_mix:0,detune:0,spread:0,sub_level:0,cutoff:1,resonance:0,f_amount:0,attack:0,sustain:1,bend_range:1}))set(`ch0:synth:${key}`,value);
 set('ch0:midi_fx1:chord_mode','Off');set('ch0:midi_fx1:note_blend','Off');
 set('ch0:midi_fx1:motion_operation_1','Note Blend');set('ch0:midi_fx1:motion_control_1','Bend 12');
 set('ch0:midi_fx1:motion_gesture_1','Knob,1000');set('ch0:midi_fx1:motion_gesture_1','Up,40,1040');
 assert.equal(get('ch0:midi_fx1:motion_status_1'),'Armed');
 assert.equal(get('ch0:midi_fx1:note_blend'),'Off');
 const params=JSON.parse(get('ch0:midi_fx1:chain_params'));
 assert.deepEqual(params.find(parameter=>parameter.key==='note_blend').options,['Off','Steps','Bend 2','Bend 12','Bend 24','Bend 48']);
 function measuredPitch(expected){
  const samples=[];
  for(let chunk=0;chunk<8;chunk++){
   const pcm=engine.request('render',8).pcm;
   for(let frame=0;frame<pcm.length;frame+=2)samples.push(pcm[frame]);
  }
  assert(samples.some(value=>Math.abs(value)>100),'audible PCM');
  // Compare one-period waveform error near the independently expected note.
  const nominal=44100/expected;let bestLag=0,bestError=Infinity;
  for(let lag=Math.floor(nominal*.85);lag<=Math.ceil(nominal*1.15);lag++){
   let error=0;
   for(let frame=lag;frame<samples.length;frame++)error+=(samples[frame]-samples[frame-lag])**2;
   error/=samples.length-lag;
   if(error<bestError){bestError=error;bestLag=lag;}
  }
  assert(Math.abs(44100/bestLag/expected-1)<.02,`expected ${expected} Hz, measured ${44100/bestLag}`);
 }
 try{
  surface(144,60,100);surface(144,72,100);
  let packets=engine.request('step',192).events;
  assert(packets.some(packet=>(packet[1]&240)===224&&((packet[3]<<7)|packet[2])===12288));
  assert.equal(get('ch0:midi_fx1:motion_status_1'),'Playing');
  measuredPitch(440*2**((66-69)/12));
  surface(160,60,25);surface(160,72,75);packets=engine.request('step',192).events;
  assert(packets.some(packet=>(packet[1]&240)===224&&((packet[3]<<7)|packet[2])===14336));
  measuredPitch(440);
  surface(128,60,0);const released=surface(128,72,0);
  assert([...released.events,...engine.request('step',16).events].some(packet=>(packet[1]&240)===224&&packet[2]===0&&packet[3]===64));
  assert.equal(get('ch0:midi_fx1:motion_status_1'),'Off');
 }finally{engine.dispose();}
});

test('Field operations share Remote note-phrase gestures and preserve direct Field controls',async()=>{
 const engine=await createFullEngine();
 const set=(key,value)=>engine.request('set',`ch0:midi_fx1:${key}`,String(value));
 const get=key=>engine.request('get',`ch0:midi_fx1:${key}`).value;
 const field=()=>get('field_view').split(',').slice(1,3).map(Number);
 let serial=0;
 const note=(status,pitch)=>engine.request('set','surface_events',`${++serial},0,${status},${256+pitch},${pitch},${status===144?100:0},0,-1,0`);
 try{
  set('chord_mode','Off');set('field_glide',0);set('motion_operation_1','Field Rate');set('motion_control_1',0);
  set('motion_gesture_1','Knob,1000');set('motion_gesture_1','Up,40,1040');engine.request('step',16);
  assert.equal(get('motion_status_1'),'Armed');assert.equal(field()[0],1);
  note(144,60);engine.request('step',16);assert.equal(field()[0],0);assert.equal(get('motion_status_1'),'Playing');
  note(144,64);note(128,60);engine.request('step',16);assert.equal(field()[0],0);
  note(128,64);engine.request('step',16);assert.equal(field()[0],1);assert.equal(get('motion_status_1'),'Off');
  set('motion_operation_2','Field Zoom');set('motion_control_2',200);set('motion_gesture_2','LatchOn');engine.request('step',16);
  assert.equal(field()[1],2);set('field_gesture','100,50');engine.request('step',16);assert.equal(field()[1],1);
  set('motion_gesture_2','LatchOff');engine.request('step',16);assert.equal(field()[1],.5);
  const params=JSON.parse(get('chain_params'));assert(params.find(param=>param.key==='motion_operation').options.includes('Field Output'));
 }finally{engine.dispose();}
});

test('Cloud Hold uses shared Remote gestures and overlapping precise cloud contacts',async()=>{
 const engine=await createFullEngine();
 const set=(key,value)=>engine.request('set',key,String(value));
 const get=key=>engine.request('get',key).value;
 const step=()=>engine.request('step',16);
 const gesture=value=>set('ch2:midi_fx1:motion_gesture_1',value);
 try{
  set('cmd','stop');step();set('ch2:midi_fx1:motion_operation_1','Cloud Hold');
  set('cmd','gexplore 2 16 127 96 71 0 127 50 64 80 64 100');step();
  gesture('Knob,1000');gesture('Up,40,1040');step();assert.equal(get('cloud_hold_2'),'0');
  set('cmd','gcloud 2 touch14 96 8193 10001 100');step();assert.equal(get('cloud_hold_2'),'1');
  set('cmd','gcloud 2 touch14 113 8194 10002 100;gcloud 2 touch14 96 8193 10001 0');step();assert.equal(get('cloud_hold_2'),'1');
  set('cmd','gcloud 2 touch14 113 8194 10002 0');step();assert.equal(get('cloud_hold_2'),'0');assert.equal(get('ch2:midi_fx1:motion_status_1'),'Off');
  gesture('Knob,2000');gesture('Up,40,2040');set('cmd','gcloud 2 touch14 96 8193 10001 100;gcloud 2 touch14 96 8193 10001 0');step();assert.equal(get('ch2:midi_fx1:motion_status_1'),'Off');
  gesture('LatchOn');step();assert.equal(get('cloud_hold_2'),'1');
  set('cmd','gcloud 2 hold 1;gcloud 2 shiftxy 1 2 0');gesture('LatchOff');step();assert.match(get('cloud_hold_state_2'),/^ch2\|1\|1\|2\|0\|[1-9]\d*$/);
  set('cmd','gcloud 2 hold 0');step();assert.equal(get('cloud_hold_2'),'0');
  gesture('LatchOn');step();set('cmd','gcloud 2 clear');step();assert.equal(get('ch2:midi_fx1:motion_status_1'),'Off');
  set('cmd','gcloud 2 touch14 96 8193 10001 100');step();assert.equal(get('cloud_hold_2'),'0');
 }finally{engine.dispose();}
});
