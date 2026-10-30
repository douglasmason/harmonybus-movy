import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createJointService} from './joint-service.mjs';
import {createMoveRuntime} from '../../local/build/move-runtime.mjs';
import {sealSession} from './session.mjs';

test('complete Movy UI edits real clips, undoes, records, replays and restores without a device',async()=>{
 const raw=JSON.parse(await readFile(new URL('../build/full/modules/midi_fx/harmonybus/module.json',import.meta.url)));
 const fixture=await createJointService(raw,()=>{});
 const legacy=await fixture.save({});fixture.socket.close();
 const updates=[],service=await createJointService(raw,value=>updates.push(value),null,createMoveRuntime);
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const send=async message=>{service.socket.send(JSON.stringify(message));await wait(8);};
 const midi=data=>send({type:'move_midi',data});
 const note=async index=>{await midi([144,index,100]);await midi([128,index,0]);};
 const cc=async index=>{await midi([176,index,127]);await midi([176,index,0]);};
 const count=track=>Number(service.read('motif_clip_info_'+track).split(',')[4]);
 const until=async predicate=>{const deadline=Date.now()+6000;while(!predicate()){if(Date.now()>deadline)throw new Error('Timed out waiting for real Movy UI/DSP: '+service.read('status')+' '+JSON.stringify(service.stats().move));await wait(20);}};
 try{
  await send({type:'subscribe_tool'});await until(()=>updates.at(-1)?.move?.ready&&updates.at(-1).move.screen.some(value=>value>0));
  assert(updates.at(-1).move.screen.some(value=>value>0),'production renderer must draw a screen');
  assert(updates.at(-1).move.display.some(command=>command[0]===1&&typeof command[6]==='string'),'shared production text is available before rasterization');
  assert(updates.at(-1).move.display.some(command=>command[0]===0),'graphics retain their original draw order beside text');
  assert(updates.at(-1).move.surface.slice(24,152).some(value=>value>0),'production LED writers must paint the surface');
  const fresh=await service.save({});
  const freshUI=JSON.parse(fresh.payload.ui.move.state);
  assert.equal(freshUI.roleLayout,1,'one conductor in new production sessions');
  assert.deepEqual(freshUI.jointPlay.map(group=>group.bass),[0,1,1,1]);
  for(let track=0;track<16;track++){
   assert.equal(service.read(`ch${track}:midi_fx1:role`),track===0?'Conductor':track%4===0?'Off':'Follower');
   assert.equal(service.read(`ch${track}:midi_fx1:travel_map`),track%4===1?'Closest Split':'None');
   assert.equal(service.read(`ch${track}:midi_fx1:render_channel`),track%4===0?'Off':String(track%4+1));
  }
  assert.equal(service.read('ch2:midi_fx1:chord_mode'),'Conductor Chord');
  assert.equal(service.read('ch2:midi_fx1:chord_inversion'),'Played Top Note');
  // Visible knob labels are the renderer's full strings, and follow real turns.
  await cc(40);await until(()=>updates.at(-1).move.knobLabels[1]?.name==='Follower Travel');
  assert.equal(updates.at(-1).move.knobLabels[1].value,'None');
  assert.equal(updates.at(-1).move.knobLabels[0].name,'Follower Content');
  const travelCell=updates.at(-1).move.screenTargets.find(target=>target.slot===1);
  assert(travelCell&&travelCell.bounds.length===4,'production cell provides its interactive bounds');
  assert(travelCell.bounds[0]>=0&&travelCell.bounds[0]+travelCell.bounds[2]<=128);
  assert(travelCell.bounds[1]>=0&&travelCell.bounds[1]+travelCell.bounds[3]<=64);
  // The production enum controller advances one option per four detents.
  await midi([144,1,127]);await midi([176,72,4]);await midi([128,1,0]);
  await until(()=>updates.at(-1).move.knobLabels[1]?.value===service.read('ch3:midi_fx1:travel_map')&&updates.at(-1).move.knobLabels[1]?.value!=='None');
  await midi([144,1,127]);await midi([176,72,124]);await midi([128,1,0]);
  await until(()=>updates.at(-1).move.knobLabels[1]?.value==='None');
  await cc(50);await until(()=>updates.at(-1).move.knobLabels.every(label=>label===null));
  assert.deepEqual(updates.at(-1).move.screenTargets,[],'menus cannot adjust hidden parameters');
  await cc(51);await until(()=>updates.at(-1).move.knobLabels[1]?.name==='Follower Travel');
  // Existing browser sessions retain their original fixture settings. Exercise
  // the previous pad regression on that saved configuration, never as defaults.
  legacy.payload.ui.move={...fresh.payload.ui.move,state:JSON.stringify({...freshUI,roleLayout:0})};
  delete legacy.payload.ui.move.context; // Older exports predate mode/focus storage.
  await service.open(await sealSession(legacy.payload,{}));
  assert.equal(service.read('ch2:midi_fx1:chord_mode'),'Off');
  // Melody approaches sound against the target on the linked Comp track.
  // The browser shortcut changes that production source, without remapping pads.
  await cc(40);assert.equal(service.stats().move.track,3);
  const strike=async pad=>{
   const after=service.stats().sequence;await midi([144,pad,100]);await wait(80);
   const events=new Map();for(const frame of updates)for(const event of frame.events??[])if(event.sequence>after&&(event.packet[1]&240)===144&&event.packet[3])events.set(event.sequence,event.packet);
   const notes=[...events.values()].map(packet=>[packet[1]&15,packet[2]]).sort((a,b)=>a[0]-b[0]);
   await midi([128,pad,0]);return notes;
  };
  assert.deepEqual(await strike(68),[[2,48],[3,48]],'target is doubled in unison');
  assert.equal(updates.at(-1).move.lastPlayed.label.primary,'1');
  assert.equal(updates.at(-1).move.lastPlayed.label.secondary,'C3');
  assert.deepEqual(await strike(76),[[2,48],[3,43]],'approach and comp target form the reported harmony');
  assert.equal(updates.at(-1).move.lastPlayed.label.primary,'→1');
  assert.equal(updates.at(-1).move.lastPlayed.label.target,48,'approach label identifies its resolution, not its output');
  assert.deepEqual(updates.at(-1).move.lastOutput.outputs.map(output=>[output.channel,...output.notes]),[[3,48],[4,43]],'readout reports actual deferred Comp and melody output');
  assert.equal(updates.at(-1).move.padLabels.rows[1].kind,'Approach');
  await send({type:'move_comp_source',group:0,source:1});
  assert.equal(updates.at(-1).move.accompaniment.source,1);
  for(let pad=68;pad<100;pad++){
   const notes=await strike(pad);assert.equal(notes.length,1,'independent pad '+pad);assert.equal(notes[0][0],3);
  }
  const independent=await service.save({});
  await send({type:'move_comp_source',group:0,source:0});
  assert.deepEqual(await strike(76),[[2,48],[3,43]],'Follow can be restored');
  await service.open(independent);await wait(100);
  // Opening retains the source choice, regardless of the restored active track.
  assert.equal(JSON.parse((await service.save({})).payload.ui.move.state).jointPlay[0].comp,1);
  await cc(40);assert.deepEqual(await strike(76),[[3,43]]);
  assert.deepEqual(updates.at(-1).move.lastOutput.outputs.map(output=>output.channel),[4],'independent source removes the Comp output');
  // Physical tonic-location shifts change the labels through the real padmap.
  await cc(63);await wait(100);
  assert.equal(updates.at(-1).move.padLabels.pads[1].primary,'1');
  assert.equal(updates.at(-1).move.padLabels.pads[1].secondary,'C3');
  assert.equal(updates.at(-1).move.padLabels.pads[9].primary,'→1');
  await cc(62);await wait(100);
  for(const [scale,expected] of [
   ['Whole Tone',['1','2','3','4','5','6','1','2']],
   ['Whole-Half Diminished',['1','2','3','4','5','6','7','8']],
   ['Harmonic Minor',['1','2','3','4','5','6','7','1']]
  ]){
   globalThis.host_module_set_param('ch3:midi_fx1:follower_scale',scale);await wait(200);
   const pads=updates.at(-1).move.padLabels.pads;
   assert.deepEqual(pads.slice(0,8).map(pad=>pad.primary),expected,scale+' uses the production scale cardinality');
   if(scale==='Harmonic Minor')assert.equal(pads[6].pitch-pads[5].pitch,3,'augmented second is preserved');
   const notes=await strike(69);
   assert.deepEqual(updates.at(-1).move.lastOutput.outputs.flatMap(output=>output.notes),notes.map(note=>note[1]),'display reports engine output for '+scale);
  }
  globalThis.host_module_set_param('ch3:midi_fx1:follower_scale','Major');await wait(200);
  await send({type:'move_comp_source',group:1,source:2});
  let groups=JSON.parse((await service.save({})).payload.ui.move.state).jointPlay;
  assert.equal(groups[0].comp,1);assert.equal(groups[1].comp,2,'edit is scoped to its displayed bank');
  await send({type:'move_comp_source',group:0,source:0});
  await send({type:'move_comp_source',group:1,source:0});
  await cc(43);
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
  await wait(100);
  assert(new Set(updates.at(-1).move.padLabels.pads.map(pad=>pad.track)).size>1,'Joint rows expose their actual actor allocation');
  // New session discards clips/Undo, restores production settings, and retains
  // machine preferences and user parts. The old envelope remains reopenable.
  globalThis.host_write_file('/data/UserData/movy/prefs.json','{"defaultQuant":100}');
  await service.newSession({monitor:.25});await wait(100);
  for(let track=0;track<16;track++)assert.equal(count(track),0);
  assert.equal(service.read('ch2:midi_fx1:chord_mode'),'Conductor Chord');
  assert.equal(globalThis.host_read_file(parts),partsText);
  assert.match(service.read('status'),/dquant=100(?: |$)/);
  const blank=service.read('state');await cc(56);assert.equal(service.read('state'),blank);
  // Chord Play chooses abstract chords through physical steps; Record captures
  // them on the conductor. With its output off, melody triggers the Comp voice.
  // Record both actors, then verify abstract intent and multi-note rendering.
  assert.equal(service.stats().move.mode,1);
  await cc(50);await midi([176,14,5]);await cc(3);
  assert.equal(service.stats().move.mode,6);
  await wait(100);assert.equal(updates.at(-1).move.padLabels.rows[0].owner,'T4 Melody');
  await note(16);await cc(86);await until(()=>/rec=1/.test(service.read('status')));
  await note(17);await midi([144,70,100]);await wait(300);await midi([128,70,0]);
  await note(18);await midi([144,72,100]);await wait(300);await midi([128,72,0]);
  await send({type:'dev_release'});assert.match(service.read('status'),/play=0/);
  assert.equal(service.stats().move.mode,6,'Stop & release retains Chord Play');
  assert.equal(service.stats().move.track,3);
  assert(count(0)>=2,'chord choices are recorded on the conductor');
  const chordSession=await service.save({}),chordState=service.read('state');
  assert.deepEqual(chordSession.payload.ui.move.context,{mode:6,performance:6,track:3});
  const descriptors=chordState.split('\n').filter(line=>line.startsWith('ra 0 0 ')).map(line=>BigInt(line.split(' ')[4].split(',')[1]));
  assert(descriptors.length>=2,'recordings retain abstract harmonic descriptors');
  assert(new Set(descriptors).size>=2,'different chord choices retain distinct intent');
  assert(descriptors.every(word=>[0xc858n,0xc859n].includes(word>>48n)),'production chord descriptor schema');
  const replay=async()=>{
   const after=service.stats().sequence;await cc(85);await wait(2200);
   const notes=new Map();for(const update of updates)for(const event of update.events??[])
    if(event.sequence>after&&event.provenance.trigger==='render'&&(event.packet[1]&240)===144&&event.packet[3])notes.set(event.sequence,event.packet);
   await cc(85);return [...notes.values()];
  };
  const replayed=await replay();
  assert(new Set(replayed.filter(packet=>(packet[1]&15)===2).map(packet=>packet[2])).size>=3);
  // Invalid context must be rejected before it can replace the current engine.
  const badContext=structuredClone(chordSession.payload);badContext.ui.move.context.track=16;
  await assert.rejects(()=>sealSession(badContext,{}).then(session=>service.open(session)),/Invalid Move performance context/);
  assert.equal(service.read('state'),chordState);assert.equal(service.stats().move.mode,6);
  // Cancellation releases a physical pad without leaving the selected mode.
  await midi([144,70,100]);assert.equal(service.stats().move.held,1);
  service.visibility(true);assert.equal(service.stats().move.held,0);assert.equal(service.stats().move.mode,6);
  service.visibility(false);
  await service.newSession({});assert.equal(count(0),0);
  await service.open(chordSession);assert.equal(service.read('state'),chordState);
  assert.equal(service.stats().move.mode,6,'reopening restores Chord Play with no mode-selection gesture');
  assert.equal(service.stats().move.track,3,'reopening restores the playing track');
  const loadedReplay=await replay();
  assert(new Set(loadedReplay.filter(packet=>(packet[1]&15)===2).map(packet=>packet[2])).size>=3);
  const pitches=events=>[...new Set(events.map(packet=>`${packet[1]&15}:${packet[2]}`))].sort();
  assert.deepEqual(pitches(loadedReplay),pitches(replayed),'reloaded intent renders the same Comp and melody pitches');
  await midi([176,49,127]);await cc(50);await midi([176,49,0]);await note(20);
  assert.equal(service.stats().move.track,4);
  const beforeCustomMelody=service.stats().move.mode;
  await cc(50);await midi([176,14,(6-beforeCustomMelody+128)%128]);await cc(3);await wait(100);
  assert.equal(updates.at(-1).move.padLabels.rows[0].owner,'T5 Melody','Chord Play owns the chosen playing track regardless of its bank position');
  // Every selector destination survives Stop and reopen. Settings and Clips
  // retain their underlying performance owner, rather than forcing Normal.
  await midi([176,49,127]);await cc(50);await midi([176,49,0]);await note(31);
  assert.equal(service.stats().move.track,15,'exercise context in the fourth bank');
  for(const mode of [7,0,1,2,3,4,5,6]){
   const previous=service.stats().move.mode;
   await cc(50);await midi([176,14,(mode-previous+128)%128]);await cc(3);
   assert.equal(service.stats().move.mode,mode,'select mode '+mode);
   const context=(await service.save({})).payload.ui.move.context;
   await send({type:'dev_release'});
   assert.deepEqual((await service.save({})).payload.ui.move.context,context,'Stop preserves mode '+mode);
   const session=await service.save({});await service.open(session);
   assert.deepEqual((await service.save({})).payload.ui.move.context,context,'open preserves mode '+mode);
  }
  await service.open(saved);assert.equal(service.read('state'),before);
  assert.equal(service.read('ch2:midi_fx1:chord_mode'),'Off','older sessions keep their own settings');
  assert.deepEqual(updates.filter(update=>update.type==='error'),[]);
 }finally{service.socket.close();}
});
