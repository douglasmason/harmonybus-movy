import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFullEngine} from './engine.mjs';
import {Lighting,parseField} from '../../local/lighting.mjs';
import {prepareMetadata} from '../../local/protocol-policy.mjs';
import {observation} from '../../local/observations.mjs';

test('compiled HB drives live lighting; polling cannot advance field time or change output MIDI',async()=>{
 const engine=await createFullEngine(),control=await createFullEngine(),model=new Lighting();
 let sequence=0;
 const snapshot=now=>{
  const field=engine.request('get','ch3:midi_fx1:field_view').value;
  const shared=engine.request('get','ch3:midi_fx1:shared_context_snapshot').value;
  const harmony=engine.request('get','ch3:midi_fx1:harmony_snapshot').value;
  model.ingest({field,shared,harmony,status:engine.request('get','status').value,events:[]},now);
  return field;
 };
 const initial=snapshot(0);assert.equal(parseField(initial).length,64);
 for(let repeat=0;repeat<20;repeat++)assert.equal(snapshot(0),initial);
 for(const host of [engine,control]){
  host.request('set','joint_map',Array(32).fill('3,72,-1,0').join(';'));
 }
 for(const [index,command] of [['midi','144,69,100'],['step',32],['midi','128,69,0'],['step',32]].entries()){
  const actual=engine.request(...command),expected=control.request(...command);
  assert.deepEqual(actual.events,expected.events,'lighting reads must not change generated MIDI');
  model.ingest({events:actual.events.map(packet=>({sequence:++sequence,packet})),status:engine.request('get','status').value},index*100+40);
  snapshot(index*100+40);
  const frame=model.render(index*100+40);
  if(index===1){assert(frame.held>0,'live HB note is held with transport stopped');assert.equal(frame.playing,false);assert(frame.voices[3].energy>0);}
 }
 assert.equal(model.notes.size,0,'HB paired release clears lighting hold');assert.notEqual(snapshot(440),initial,'compiled field advances with render blocks');
 assert.deepEqual(engine.request('get','state').value,control.request('get','state').value,'preview must not modify session state');
 const {readable}=prepareMetadata({capabilities:{chain_params:[]}});
 for(const key of ['field_view','field_outputs_view2','harmony_snapshot','shared_context_snapshot'])assert(readable.has(key));
});

test('actual production section traversals cue lighting without changing MIDI or state',async()=>{
 const engine=await createFullEngine(),control=await createFullEngine(),model=new Lighting();
 let sampleFrame=0,sequence=0,arrivals=0,lastArrival=null;
 try{
  for(const host of [engine,control]){
   host.request('set','cmd','song 0;songadd 1;songsection 0 bars 1;songsection 1 bars 1');
   host.request('set','cmd','play');
  }
  for(let index=0;index<300;index++){
   const actual=engine.request('step',12),expected=control.request('step',12);
   assert.deepEqual(actual.events,expected.events,'observer must preserve final musical output');
   sampleFrame+=12*128;const now=sampleFrame/44.1;
   const params={status:engine.request('get','status').value,song_section:engine.request('get','song_section').value};
   model.ingest({field:engine.request('get','ch3:midi_fx1:field_view').value,
    observation:observation(params,{epoch:1,sequence:++sequence,sampleFrame})},now);
   model.render(now);
   if(model.gesture?.kind==='arrival'&&model.gesture.start!==lastArrival){arrivals++;lastArrival=model.gesture.start;}
  }
  assert(arrivals>=3,`expected multiple real section arrivals, observed ${arrivals}`);
  assert.deepEqual(engine.request('get','state').value,control.request('get','state').value);
  assert.equal(engine.request('get','song_section').value,control.request('get','song_section').value);
 }finally{engine.dispose();control.dispose();}
});
