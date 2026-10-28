import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createJointService} from './joint-service.mjs';
import {createMoveRuntime} from '../../local/build/move-runtime.mjs';
import {sealSession} from './session.mjs';

test('complete Movy UI edits real clips, undoes, records, replays and restores without a device',async()=>{
 const raw=JSON.parse(await readFile(new URL('../build/full/modules/midi_fx/harmonybus/module.json',import.meta.url)));
 const updates=[],service=await createJointService(raw,value=>updates.push(value),null,createMoveRuntime);
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const send=async message=>{service.socket.send(JSON.stringify(message));await wait(8);};
 const midi=data=>send({type:'move_midi',data});
 const note=async index=>{await midi([144,index,100]);await midi([128,index,0]);};
 const cc=async index=>{await midi([176,index,127]);await midi([176,index,0]);};
 const count=track=>Number(service.read('motif_clip_info_'+track).split(',')[4]);
 const until=async predicate=>{const deadline=Date.now()+6000;while(!predicate()){if(Date.now()>deadline)throw new Error('Timed out waiting for real Movy UI/DSP');await wait(20);}};
 try{
  await send({type:'subscribe_tool'});await until(()=>updates.at(-1)?.move?.ready&&updates.at(-1).move.screen.some(value=>value>0));
  assert(updates.at(-1).move.screen.some(value=>value>0),'production renderer must draw a screen');
  assert(updates.at(-1).move.surface.slice(24,152).some(value=>value>0),'production LED writers must paint the surface');
  assert.equal(count(0),0);
  await note(69);await note(16);assert.equal(count(0),1);
  const first=service.read('state');assert.match(first,/cl 0 0 .*:[0-9]+:100:0/);
  await cc(56);assert.equal(count(0),0);
  await midi([176,49,127]);await cc(56);await midi([176,49,0]);assert.equal(service.read('state'),first);
  // Hold-step editing reaches the production velocity gesture and grouped Undo.
  await midi([144,16,100]);await midi([144,8,127]);await midi([176,79,127]);await midi([128,8,0]);await midi([128,16,0]);
  assert.notEqual(service.read('state'),first);assert.equal(count(0),1);
  await cc(56);assert.equal(service.read('state'),first);
  // Cancellation must NOT turn an interrupted step press into a note toggle.
  await midi([144,17,100]);service.visibility(true);await wait(15);
  assert.equal(count(0),1);assert.equal(service.stats().move.held,0);service.visibility(false);
  // Physical track and Session+step controls address all sixteen tracks.
  await cc(42);assert.equal(service.stats().move.track,1);
  await note(70);await note(16);assert.equal(count(1),1);assert.equal(count(0),1);
  await midi([176,49,127]);await cc(50);await midi([176,49,0]);await note(31);
  assert.equal(service.stats().move.track,15);await note(16);assert.equal(count(15),1);
  await midi([176,49,127]);await cc(50);await midi([176,49,0]);await note(18);
  assert.equal(service.stats().move.track,2);
  // A genuine Record button tap counts in, captures raw pads once, and plays PCM.
  await cc(86);await until(()=>/rec=1/.test(service.read('status')));
  await midi([144,70,100]);await wait(180);await midi([128,70,0]);
  await send({type:'dev_transport',action:'stop'});assert.equal(count(2),1,'no duplicate UI + raw pad capture');
  const atStop=service.stats().sequence;await cc(85);
  await until(()=>updates.some(update=>update.events?.some(event=>event.sequence>atStop&&event.provenance.trigger==='render'&&(event.packet[1]&240)===144&&event.packet[3]>0)));
  await send({type:'dev_transport',action:'stop'});
  // Normal runtime journal/tempo writes must not make a session unrestorable.
  const journal='/data/UserData/schwung/movy-interface-usage-a.json';
  const parts='/data/UserData/schwung/harmonybus-parts.json';
  const journalText=JSON.stringify({schema:1,generation:1,history:{}});
  const partsText=JSON.stringify({version:2,comp:[{synth:'nusaw',payload:'aabb'}],bass:[]});
  assert.equal(globalThis.host_write_file(journal,journalText),true);
  assert.equal(globalThis.host_write_file(parts,partsText),true);
  assert.equal(globalThis.host_write_file('/data/UserData/schwung/desired-tempo','120.0000\n'),true);
  assert.equal(globalThis.host_write_file('/data/UserData/schwung/modules/midi_fx/harmonybus/module.json','{}'),false);
  const saved=await service.save({monitor:.25}),before=service.read('state');
  assert(saved.payload.ui.move.state);assert(!('chains' in JSON.parse(saved.payload.ui.move.state)));
  const bad=structuredClone(saved.payload);bad.ui.move.files={'/data/UserData/unrelated':'x'};
  // Use a valid checksum so rejection exercises the UI host boundary.
  await assert.rejects(()=>sealSession(bad,{}).then(session=>service.open(session)),/Invalid Move preferences/);
  assert.equal(service.read('state'),before);
  await service.open(saved);await wait(100);assert.equal(service.read('state'),before);
  assert.equal(globalThis.host_read_file(journal),journalText);
  assert.equal(globalThis.host_read_file(parts),partsText);
  for(const track of [0,1,2,15])assert.equal(count(track),1);
  assert.equal(service.stats().move.held,0);
  await cc(56);assert.equal(service.read('state'),before,'opening resets production Undo history');
  await cc(50);await midi([176,14,1]);await cc(3);
  assert.equal(service.stats().move.mode,2,'current Motif Play controller is reachable');
  await cc(50);await midi([176,14,1]);await cc(3);
  assert.equal(service.stats().move.mode,3,'production Joint Play is reachable from the full app');
  assert.deepEqual(updates.filter(update=>update.type==='error'),[]);
 }finally{service.socket.close();}
});
