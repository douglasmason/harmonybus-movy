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
