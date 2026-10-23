import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createJointService} from './joint-service.mjs';
import {sealSession} from './session.mjs';
const raw=JSON.parse(await readFile(new URL('../build/full/modules/midi_fx/harmonybus/module.json',import.meta.url)));
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('shared source/variation edits, stopped live observations and transactional failed loads',async()=>{
 const updates=[],service=await createJointService(structuredClone(raw),value=>updates.push(value));
 try{
  service.visibility(true);
  const send=async value=>{service.socket.send(JSON.stringify(value));await settle();};
  await send({type:'dev_engine_edit',value:'usnap 1;source 1 1 0 0 1 0 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 2 0;variation 1 25 50 30 0 4'});
  assert.match(service.read('source_route_1'),/^1 1 0 0 1 0/);
  assert.match(service.read('source_route_1'),/ 2 0$/);
  assert.equal(service.read('variation_1'),'1 25 50 30 0 4');
  await send({type:'dev_watch',keys:['source_preview_1','source_route_1','variation_1']});
  const snapshot=updates.at(-1);assert(snapshot.observation.views.source_preview_1);assert.equal(snapshot.observation.clock.playing,false);
  assert.equal(snapshot.observation.structure.schema,1);assert.equal(snapshot.observation.structure.count,0);
  await send({type:'dev_engine_edit',value:'usnap 2;song 0;songadd 1; songsection 0 bars 2;songsection 1 enable;songsection 1 track 2 2;ucommit 2'});
  assert.notEqual(updates.at(-1).type,'error','shared section edits must finish their production Undo group');
  await send({type:'dev_watch',keys:['song_section_0','song_section_1','ch0:lfo1:field_source_version','ch0:lfo1:shape','ch0:synth:cutoff:base','ch0:synth:cutoff:effective']});
  assert.equal(updates.at(-1).observation.structure.count,2);
  assert.equal(updates.at(-1).params.song_section_0,'0 0 1 2 0000000000000000');
  assert.equal(updates.at(-1).observation.views['ch0:lfo1:field_source_version'],'1');
  const songBefore=service.read('state');
  for(const value of ['ucommit -1','ucommit 1 2','ucommit nope','song 8','songsection 128 enable','songsection 0 bars 257','songsection 0 track 16 0','songsection 0 track 0 3','songsectionclear -1','songsection 0 enable;load /tmp/no']){
   await send({type:'dev_engine_edit',value});assert.equal(updates.at(-1).type,'error');assert.equal(service.read('state'),songBefore);
  }
  for(const key of ['ch0:synth:state:base','ch16:lfo1:shape','song_section_128']){await send({type:'dev_watch',keys:[key]});assert.equal(updates.at(-1).type,'error');}
  await send({type:'set_param',key:'joint_map',value:Array(32).fill('0,60,-1,0').join(';')});
  await send({type:'dev_midi',data:[144,68,100]});
  assert(updates.at(-1).events.some(event=>event.provenance.trigger==='live-input'&&event.sampleRate===44100));
  await send({type:'dev_midi',data:[128,68,0]});
  const session=await service.save({});
  const before=service.read('state');
  const corrupt=structuredClone(session);corrupt.payload.sequencer+='broken';
  await assert.rejects(()=>service.open(corrupt),/checksum/);
  assert.equal(service.read('state'),before);
  const rejected=structuredClone(session.payload);rejected.chains[0].components[1].state='{}';
  const rejectedSession=await sealSession(rejected,{});
  await assert.rejects(()=>service.open(rejectedSession),/readback differs/);
  assert.equal(service.read('state'),before);
  assert.equal(service.read('variation_1'),'1 25 50 30 0 4');
  await service.open(session);assert.equal(service.read('state'),before);
  assert.equal(service.read('variation_1'),'1 25 50 30 0 4');
  await send({type:'dev_engine_edit',value:'load /tmp/anything'});assert.equal(updates.at(-1).type,'error');
 }finally{service.socket.close();}
});

test('Play finishes a real take before replay; clip feedback reports captured notes',async()=>{
 const updates=[],service=await createJointService(structuredClone(raw),value=>updates.push(value));
 const send=async value=>{service.socket.send(JSON.stringify(value));await settle();};
 const until=async predicate=>{const deadline=Date.now()+6000;while(!predicate()){if(Date.now()>deadline)throw new Error('Timed out waiting for production engine');await new Promise(resolve=>setTimeout(resolve,25));}};
 try{
  await send({type:'dev_watch',keys:['motif_clip_info_0']});
  await send({type:'set_param',key:'joint_map',value:Array(32).fill('0,60,-1,0').join(';')});
  await send({type:'dev_transport',action:'record',mask:1,overwrite:1});
  assert.match(service.read('status'),/cin=1/);
  await until(()=>/rec=1/.test(service.read('status')));
  await send({type:'dev_midi',data:[144,68,100]});await new Promise(resolve=>setTimeout(resolve,150));
  // Play also closes a held note. No separate Stop press is required.
  await send({type:'dev_transport',action:'play'});
  assert.match(service.read('status'),/play=1/);assert.match(service.read('status'),/rec=0/);
  assert(Number(service.read('motif_clip_info_0').split(',')[4])>0);
  assert(Number(updates.at(-1).params.motif_clip_info_0.split(',')[4])>0);
  const sequence=service.stats().sequence;
  await until(()=>updates.some(update=>update.events?.some(event=>event.sequence>sequence&&event.provenance.trigger==='render'&&(event.packet[1]&240)===144&&event.packet[3]>0)));
  await send({type:'dev_transport',action:'stop'});
 }finally{service.socket.close();}
});
