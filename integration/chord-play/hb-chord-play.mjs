import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installEnv} from './env.mjs';
installEnv();await import('../dist/esm/app/globals.js');
const {installMockEngine}=await import('./mock-engine.mjs');
const engine=installMockEngine();
const {seqEngineTick}=await import('../dist/esm/seq/engine.js');seqEngineTick();
const {portFor}=await import('../dist/esm/track/registry.js');
const {appState}=await import('../dist/esm/app/state.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {setFlag}=await import('../dist/esm/seq/flags.js');
const chord=await import('../dist/esm/seq/chord-play.js');
const settings=await import('../dist/esm/seq/hb-settings.js');
const {padsPlayNotes}=await import('../dist/esm/seq/router-pads.js');
const {hbStepHierarchy}=await import('../dist/esm/renderer/hb-step-panels.js');
const metadata=JSON.parse(readFileSync(process.env.HB_MODULE,'utf8'));
const writes=[];let bankFrame='',bankReads=0;
const ledPackets=[];globalThis.move_midi_internal_send=packet=>{ledPackets.push([...packet]);return true;};
let now=10000;Date.now=()=>now;
for(let track=0;track<16;track++){
 const port=portFor(track),values=new Map(metadata.capabilities.chain_params.map(meta=>[meta.key,String(meta.default??meta.options?.[0]??'0')]));
 port.getParam=key=>{
  if(key==='midi_fx1_module')return 'harmonybus';
  const bare=key.replace(/:(base|modulated)$/,'').split(':').at(-1);
  if(bare==='hb_chord_bank_snapshot'){bankReads++;return bankFrame;}
  if(bare==='chain_params')return JSON.stringify(metadata.capabilities.chain_params);
  if(bare==='ui_hierarchy')return JSON.stringify(metadata.capabilities.ui_hierarchy);
  return values.get(bare)??'';
 };
 port.getMany=keys=>keys.map(key=>port.getParam(key));
 port.setParam=(key,value)=>{writes.push([track,key,value]);values.set(key.split(':').at(-1),value);return true;};
}
setFlag('chtracks',1);selectTrack(3);seqState.sessionMode=false;chord.restoreChord(null);chord.setChordEnabled(true);
assert(padsPlayNotes(),'main pads remain the selected melody instrument');
let page=chord.chordPage();assert(page.ready);
assert(!page.ctl.pages.some(item=>item.keys?.includes('monitor_status')),'Chord Play excludes diagnostics');
assert(!page.ctl.pages.some(item=>item.keys?.includes('render_channel')),'Chord Play excludes global routing');
const flush=()=>{for(let tick=0;tick<4;tick++){now+=100;page.tick();}};
const find=key=>{const index=page.ctl.pages.findIndex(item=>item.keys?.includes(key));assert(index>=0,key);page.goToPage(index);flush();};
find('cp_slot_0');assert.equal(chord.chordKnobLEDMask(),255,'bank owns all knob LED channels');assert.deepEqual(Array.from({length:8},(_,index)=>page.keyAt(index)),[...Array.from({length:7},(_,index)=>'cp_slot_'+index),'cp_off']);
chord.chordMidi([144,0,100]);assert.equal(engine.params.chord_select,'0,0,0,0,3,0,1,12,1,0');
chord.chordMidi([128,0,0]);assert.equal(engine.params.chord_select,'0,0,0,0,3,0,1,12,1,0','release retains harmony');
find('cp_slot_7');assert.equal(page.keyAt(7),'cp_off');
chord.chordMidi([144,16,100]);assert.equal(engine.params.chord_select,'0,0,0,0,3,0,1,12,12,0');
chord.chordMidi([128,16,0]);
assert.equal(appState.activeTrack.index,3);assert.equal(chord.chordRecordCommand(),'jrec 9 1');
find('cp_track_2_chord_quality');assert.equal(chord.chordKnobLEDMask(),128,'actor settings reserve knob eight for Off');const before=writes.length;
const quality=Array.from({length:8},(_,index)=>page.keyAt(index)).indexOf('cp_track_2_chord_quality');page.knobTurn(quality,4);flush();
assert(writes.slice(before).some(([track,key])=>track===2&&key==='midi_fx1:chord_quality'));
assert(!writes.slice(before).some(([track,key])=>track!==2&&key==='midi_fx1:chord_quality'));
find('travel_map');const travel=Array.from({length:8},(_,index)=>page.keyAt(index)).indexOf('travel_map');page.knobTurn(travel,4);flush();
assert(writes.some(([track,key])=>track===3&&key==='midi_fx1:travel_map'));
find('cp_quality');const editorBefore=chord.chordSnapshot();page.knobTurn(Array.from({length:8},(_,index)=>page.keyAt(index)).indexOf('cp_quality'),4);flush();
assert.notDeepEqual(chord.chordSnapshot().slots[7],editorBefore.slots[7]);
const snapshot=chord.chordSnapshot();chord.restoreChord(snapshot);assert.deepEqual(chord.chordSnapshot(),snapshot);
chord.setChordEnabled(true);chord.tickChord();assert.equal(engine.params.chord_route,'3,2,1');
const routing=engine.params.chord_route;const selected=appState.activeTrack.index;
settings.setSettingsOpen(true);assert(chord.chordEnabled());assert.equal(appState.activeTrack.index,selected);assert.equal(engine.params.chord_route,routing);assert(padsPlayNotes());
const settingsPage=settings.settingsPage();assert(settingsPage.ctl.pages.some(item=>item.keys?.includes('monitor_status')));
assert(!settingsPage.ctl.pages.some(item=>item.keys?.includes('arp_hold')),'HB Settings excludes performance arp controls');
settings.setSettingsOpen(false);assert(chord.chordEnabled());assert.equal(appState.activeTrack.index,selected);
seqState.sessionMode=true;settings.setSettingsOpen(true);assert.equal(seqState.sessionMode,false);
settings.setSettingsOpen(true);settings.setSettingsOpen(false);assert.equal(seqState.sessionMode,true,'repeated open preserves the Clips return destination');
settings.setSettingsOpen(true,false);settings.setSettingsOpen(false);assert.equal(seqState.sessionMode,false,'Session-cycle Settings returns to the underlying performance mode');
for(const mode of [0,1,2]){const hierarchy=hbStepHierarchy(structuredClone(metadata.capabilities.ui_hierarchy),mode);assert.equal(hierarchy.levels.diagnostics.visible_if.movyStepVisible,false);assert(!hierarchy.levels.root.knobs.includes('version'));}
chord.setChordEnabled(false);assert.equal(engine.params.chord_select,'off');assert.equal(engine.params.chord_route,'off');
console.log('Chord Play: three relative banks, conductor commands, fixed track aliases, persistence, settings overlay and curated pages pass');

// Native classifications drive hue/brightness. The UI must not infer harmony.
const {ledFrameReset}=await import('../dist/esm/seq/led-cache.js');
const saved=chord.chordSnapshot();saved.colorView=0;saved.slots[2].intent=2;saved.slots[2].target=4;saved.slots[3].intent=3;saved.slots[3].target=4;
const rows=Array.from({length:21},()=>[0,145,2741,7,0,0,1,0,'C']);
rows[1]=[10,1060,1717,7,0,10,1,1,'Bb'];
rows[2]=[9,657,2773,8,7,9,2,0,'Am7'];rows[3]=[2,581,2773,2,7,2,3,1,'D7'];
const frame=active=>'cb1|2741|'+active.join(',')+'|'+rows.map(row=>row.join(',')).join('|');
bankFrame=frame([-1,0,0,0,0,0]);chord.restoreChord(saved);chord.setChordEnabled(true);chord.tickChord();
assert.equal(chord.chordSlotColor(0),77);assert.equal(chord.chordSlotColor(1),7,'chromatic major uses the stronger same-hue color');
assert.equal(chord.chordSlotColor(2),97);assert.equal(chord.chordSlotColor(3),26,'dominant quality is independent of scale membership');
let colorPort=chord.chordPanelPort(3);colorPort.getParam('midi_fx1:chain_params');colorPort.setParam('midi_fx1:cp_colorView','Intent + Scale');
assert.equal(chord.chordSlotColor(2),109);assert.equal(chord.chordSlotColor(3),23,'ii/V and V/V share an intent hue, with binary scale brightness');
now+=250;bankFrame=frame(rows[3].slice(0,6));chord.tickChord();assert.equal(chord.chordSlotColor(3),120,'actual current harmony is white, never recording red');
page=chord.chordPage();find('cp_slot_0');chord.tickChord();
const readsBefore=bankReads,writesBefore=writes.length;ledPackets.length=0;ledFrameReset();chord.paintChordSteps();
for(let frameIndex=0;frameIndex<5;frameIndex++){ledFrameReset();chord.paintChordSteps();chord.tickChord();}
assert.equal(bankReads,readsBefore,'painting and fast ticks perform no extra snapshot reads');assert.equal(writes.length,writesBefore,'unchanged banks are not resent');
for(const address of [19,3,74])assert(ledPackets.some(packet=>packet[2]===address&&packet[3]===120),'step and both knob addresses share white selection');
colorPort.setParam('midi_fx1:cp_selected','3');colorPort.setParam('midi_fx1:cp_enabled','Off');
const previousCommand=engine.params.chord_select;chord.selectChordSlot(2);assert.equal(engine.params.chord_select,previousCommand);assert.equal(chord.chordSlotColor(2),0);
colorPort.setParam('midi_fx1:cp_selected','4');colorPort.setParam('midi_fx1:cp_intent','Secondary V');colorPort.setParam('midi_fx1:cp_target','V');
chord.selectChordSlot(3);assert(engine.params.chord_select.endsWith(',3,4'));
const persistence=chord.chordSnapshot();chord.restoreChord(persistence);assert.deepEqual(chord.chordSnapshot(),persistence);
const legacy=structuredClone(persistence);delete legacy.colorView;for(const slot of legacy.slots){delete slot.intent;delete slot.target;delete slot.enabled;}
chord.restoreChord(legacy);assert.equal(chord.chordSnapshot().colorView,0);assert(chord.chordSnapshot().slots.every(slot=>slot.enabled===1));
console.log('Chord colors: native quality/intent families, binary chromatic brightness, actual harmony, matching knobs, bounded reads, disabled slots and legacy migration pass');

// A regular step painter must recover after Chord Play's animated-address writer.
{
 const leds=await import('../dist/esm/seq/led-cache.js');
 leds.seqLedsInvalidate();leds.ledFrameReset();
 const plain=[];globalThis.setLED=(note,color)=>plain.push([note,color]);
 leds.cachedSetLED(16,123);leds.cachedSetAnimLED(16,0,0,0);leds.cachedSetLED(16,123);
 assert.deepEqual(plain,[[16,123],[16,123]],'returning painter restores a step even when its own old cache matches');
 const previous=ledPackets.length;leds.cachedSetAnimLED(16,0,0,0);
 assert.equal(ledPackets.length,previous+1,'animation cache also observes ordinary writes');
}
console.log('Mode LED owners: regular and animated caches invalidate each other');

// The normal route must not double-trigger the same Schwung chord instrument.
chord.restoreChord(null);selectTrack(3);seqState.sessionMode=false;chord.setChordEnabled(true);
portFor(0).setParam('midi_fx1:render_channel','3');now+=250;chord.tickChord();
assert.equal(engine.params.chord_route,'3,2,2','conductor output owns comp triggers by default');
portFor(0).setParam('midi_fx1:render_channel','Off');now+=250;chord.tickChord();
assert.equal(engine.params.chord_route,'3,2,1','silent conductor retains melody-triggered comp');
const routePort=chord.chordPanelPort(3);routePort.getParam('midi_fx1:chain_params');
routePort.setParam('midi_fx1:cp_source','Follow Melody');
portFor(0).setParam('midi_fx1:render_channel','3');now+=250;chord.tickChord();
assert.equal(engine.params.chord_route,'3,2,1','explicit extra melody trigger remains available');
console.log('Conductor output route avoids duplicate comp attacks; explicit extra triggers remain available');

// A single shared bank survives track changes; reset restores dynamic definitions.
chord.restoreChord(null);selectTrack(3);seqState.sessionMode=false;chord.setChordEnabled(true);
page=chord.chordPage();find('cp_slot_14');
assert.equal(page.keyAt(7),'cp_off');chord.chordMidi([144,0,100]);chord.chordMidi([128,0,0]);
assert.equal(engine.params.chord_select,'0,0,0,0,1,0,1,12,13,0');
chord.chordMidi([144,7,100]);assert.equal(engine.params.chord_select,'off');chord.chordMidi([128,7,0]);
chord.chordMidi([144,0,100]);assert.notEqual(engine.params.chord_select,'off','same chord remains a retrigger');chord.chordMidi([128,0,0]);
const edited=chord.chordSnapshot();edited.slots[0].root=5;edited.slots[0].intent=0;chord.restoreChord(edited);chord.setChordEnabled(true);
selectTrack(4);assert.equal(chord.chordSnapshot().slots[0].root,5,'manual definitions are global across melody tracks');
chord.resetChordDefaults();assert.deepEqual(chord.chordSnapshot().slots.map(slot=>slot.intent),[...Array(7).fill(1),...Array(7).fill(12),...Array(7).fill(13)]);
page=chord.chordPage();for(const panel of page.ctl.pages.filter(panel=>panel.keys?.length))assert.equal(panel.keys[7],'cp_off','every Chord Play settings panel reserves knob 8');
console.log('Global reset, home/parallel/blues banks and universal Harmony Off pass');

assert.equal(page.ctl.pages.filter(panel=>panel.keys?.includes('cp_selected')).length,1,'only one Edit Chord selector');
assert(!page.ctl.pages[0].keys.includes('cp_selected'),'Setup contains routing and defaults only');
