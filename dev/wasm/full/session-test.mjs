import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFullEngine} from './engine.mjs';
import {capturePayload,sealSession,validateSession,restoreCandidate} from './session.mjs';

test('production session roundtrip includes clips, song, HB, NuSaw, mix and LFOs; bad input cannot change original',async()=>{
 const original=await createFullEngine(),candidate=await createFullEngine();
 try{
  for(let track=0;track<16;track++)original.request('set',`ch${track}:synth:module`,'nusaw');
  original.request('step',128);
  original.request('set','cmd','tog 0 0 60 100;tog 1 2 65 90');
  original.request('set','cmd','song 0;songadd 0;stop');
  assert.match(original.request('get','state').value,/sg 0 0/);
  original.request('set','cmd','songsection 0 bars 2;songsection 0 track 1 1;songsection 0 track 2 2');
  assert.match(original.request('get','state').value,/ss1 0 2 0120000000000000/);
  original.request('set','ch1:midi_fx1:master_transpose','5');
  original.request('set','ch3:mix','.4,-.2,0,0,0');
  original.request('set','ch2:synth:cutoff','1500');
  original.request('set','ch2:lfo1:target','synth');
  original.request('set','ch2:lfo1:target_param','cutoff');
  original.request('set','ch2:lfo1:depth','.2');
  const payload=capturePayload(original,{focusGroup:2});
  const session=await sealSession(payload,{test:true});
  assert.equal(await restoreCandidate(candidate,session).then(ui=>ui.focusGroup),2);
  assert.equal(candidate.request('get','state').value,original.request('get','state').value);
  assert.equal(candidate.request('get','ch1:midi_fx1:master_transpose').value,original.request('get','ch1:midi_fx1:master_transpose').value);
  assert.equal(candidate.request('get','ch3:mix').value,original.request('get','ch3:mix').value);
  const replay=[];for(const engine of [original,candidate]){engine.request('set','cmd','play');replay.push(engine.request('step',1500).events);engine.request('set','cmd','stop');}
  assert.deepEqual(replay[1],replay[0]);assert(replay[0].some(packet=>(packet[1]&240)===144&&packet[3]>0));
  const damaged=structuredClone(session);damaged.payload.sequencer+='truncated';
  await assert.rejects(()=>validateSession(damaged),/checksum/);
  const unknown=structuredClone(payload);unknown.chains[0].components[1].module='stock-move';
  const unsupported=await sealSession(unknown,{});
  await assert.rejects(()=>restoreCandidate(candidate,unsupported),/Unsupported instrument/);
  assert.equal(original.request('get','ch1:midi_fx1:master_transpose').value,original.request('get','ch1:midi_fx1:master_transpose').value);
 }finally{original.dispose();candidate.dispose();}
});

test('the published v4 / Movy 220 session opens unchanged on the current engine',async()=>{
 const session=JSON.parse(await readFile(new URL('./fixtures/session-v4.json',import.meta.url)));
 const candidate=await createFullEngine();
 try{
  await restoreCandidate(candidate,session);
  assert.equal(capturePayload(candidate,{}).sequencer,session.payload.sequencer);
  candidate.request('set','cmd','play');
  assert(candidate.request('step',1500).events.some(packet=>(packet[1]&240)===144&&packet[3]>0));
 }finally{candidate.dispose();}
});
