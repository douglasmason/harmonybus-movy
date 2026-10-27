import './hb-chord-play.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const {parseDiscovery}=await import('../dist/esm/seq/chord-discovery.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {appState}=await import('../dist/esm/app/state.js');
const {setSettingsOpen}=await import('../dist/esm/seq/hb-settings.js');
setSettingsOpen(false);selectTrack(3);seqState.sessionMode=false;seqState.playing=false;appState.shiftHeld=false;
chord.restoreChord(null);chord.setChordEnabled(true);
const owner=portFor(0);owner.setParam('midi_fx1:render_channel','3');
const oldGet=owner.getParam,oldSet=owner.setParam,requests=[];
let response='--',context='--',epoch=0,shifted=0;
const snapshot=(root,variant=0,minor=false)=>{
 const notes=[48+root,48+root+(minor?3:4),55+root].map(note=>note+variant*2+shifted);
 const mask=[0,minor?3:4,7].reduce((value,interval)=>value|(1<<((root+interval)%12)),0);
 return `cd1|Chord${root}|${root},${mask},2741,7,0,${root},1,0|${notes.join(',')}|${variant>=4?[2,1,4][variant-4]:0},${variant>=1&&variant<=3?variant:0}`;
};
owner.setParam=(key,value)=>{
 requests.push([key,value]);
 if(key==='midi_fx1:hb_chord_discovery_context')context=`dc1|${++epoch}|${value.startsWith('0,1;')?'Queue':value.startsWith('0,2;')?'Edit':'Current'}|${snapshot(0)}`;
 if(key==='midi_fx1:hb_chord_discovery_probe'){
  const [prefix,payload]=value.split(';'),[,generation,variant,anchor]=prefix.split(',').map(Number),fields=payload.split(',').map(Number);
  const degree=[0,2,4,5,7,9,11][fields[8]],intent=fields[7];
  const root=anchor?0:intent===1?degree:intent===2?(degree+2)%12:intent===3?(degree+7)%12:intent===9?5:10;
  response=generation===epoch?snapshot(root,variant,intent===9):'--';
 }
 return oldSet(key,value);
};
owner.getParam=key=>key==='midi_fx1:hb_chord_discovery_probe'?response:key==='midi_fx1:hb_chord_discovery_context'?context:oldGet(key);
const commands=[],oldEngine=globalThis.host_module_set_param_blocking;
globalThis.host_module_set_param_blocking=(key,value)=>{commands.push([key,value]);return oldEngine(key,value);};
let now=Date.now()+1000;Date.now=()=>now;
chord.tickChord();let page=chord.chordPage();
const visit=level=>{page=chord.chordPage();const index=page.ctl.pages.findIndex(candidate=>candidate.level===level);assert(index>=0,level);page.goToPage(index);page.ctl.state.peek=null;page.ctl.state.touched=-1;};
const tick=()=>{now+=50;chord.tickChord();};
const probes=()=>requests.filter(([key])=>key==='midi_fx1:hb_chord_discovery_probe').length;
visit('cp_discovery');const saved=chord.chordSnapshot();
tick();assert.equal(probes(),0,'context capture precedes candidate probes');
for(let index=0;index<11;index++){const before=probes();tick();assert.equal(probes(),before+1,'one native probe per tick');}
const ready=probes();for(let repeat=0;repeat<20;repeat++){tick();chord.paintChordSteps();chord.renderChord();}
assert.equal(probes(),ready,'unchanged page never recomputes suggestions');
assert.equal(page.ctl.hbNavigation.state().category,'Discovery');
assert.equal(chord.chordKnobLEDMask(),255);
const selectedBefore=commands.filter(([key])=>key==='chord_select'||key==='chord_queue').length;
chord.chordMidi([144,0,100]);assert(requests.at(-1)[1].startsWith('notes:'));assert.equal(probes(),ready,'audition uses cached native notes');
chord.chordMidi([144,1,100]);const last= requests.length;
chord.chordMidi([128,0,0]);assert.equal(requests.length,last,'old control release cannot stop a newer preview');
chord.chordMidi([128,1,0]);assert.equal(requests.at(-1)[1],'off');
assert.equal(commands.filter(([key])=>key==='chord_select'||key==='chord_queue').length,selectedBefore,'audition never commits or enqueues');
assert.deepEqual(chord.chordSnapshot(),saved,'audition never changes the saved bank');
chord.chordMidi([144,25,100]);chord.chordMidi([128,25,0]);assert.deepEqual(chord.chordSnapshot(),saved,'first Save only arms review');
chord.chordMidi([144,25,100]);chord.chordMidi([128,25,0]);assert.notDeepEqual(chord.chordSnapshot().slots[0],saved.slots[0]);
chord.chordMidi([144,24,100]);chord.chordMidi([128,24,0]);assert(commands.some(([key,value])=>key==='chord_select'&&value!=='off'));
const controls=chord.chordPanelPort(0);controls.getParam('midi_fx1:chain_params');
assert(controls.setParam('midi_fx1:cp_play_mode','Queued'));owner.setParam('midi_fx1:chord_queue_depth','Touch Phrase');
const queuedBefore=commands.length;chord.chordMidi([144,24,100]);chord.chordMidi([128,24,0]);
const queued=commands.slice(queuedBefore).filter(([key])=>key==='chord_queue');
assert.equal(queued.length,2);assert(queued[0][1].startsWith('0,'));assert.equal(queued[1][1],'commit');
assert(controls.setParam('midi_fx1:cp_play_mode','Immediate'));
// Owner is captured at touch-down, even if the route changes before release.
chord.chordMidi([144,16,100]);chord.setChordCompSource(1);tick();assert.equal(requests.at(-1)[1],'off','routing changes release the original owner before physical release');chord.chordMidi([128,16,0]);
chord.setChordCompSource(0);tick();
visit('cp_voicings');for(let index=0;index<8;index++)tick();
chord.chordMidi([144,2,100]);chord.chordMidi([128,2,0]);const beforeKeep=commands.length;
chord.chordMidi([144,24,100]);chord.chordMidi([128,24,0]);
assert.equal(owner.getParam('midi_fx1:chord_inversion'),'First');
assert(!commands.slice(beforeKeep).some(([key])=>key==='chord_select'||key==='chord_queue'),'keeping a voicing changes the sound owner, not harmony');
chord.chordMidi([144,16,100]);const frozen=requests.at(-1)[1];chord.chordMidi([128,16,0]);shifted=1;
chord.chordMidi([144,16,100]);assert.equal(requests.at(-1)[1],frozen,'changed key cannot rewrite cached audition');chord.chordMidi([128,16,0]);
const editsBefore=requests.filter(([key])=>key==='midi_fx1:chord_inversion').length;chord.chordMidi([144,24,100]);
assert.equal(requests.filter(([key])=>key==='midi_fx1:chord_inversion').length,editsBefore,'stale Keep refuses a different voicing');
assert(chord.chordDiscovery.footer().includes('Refresh'));shifted=0;chord.chordDiscovery.refresh();for(let index=0;index<7;index++)tick();
chord.chordMidi([144,16,100]);visit('cp_bank_0');tick();assert.equal(requests.at(-1)[1],'off','leaving discovery releases the preview');
assert.equal(chord.chordMidi([176,62,127]),false,'arrow ownership remains with pad position');
chord.setChordEnabled(false);owner.getParam=oldGet;owner.setParam=oldSet;globalThis.host_module_set_param_blocking=oldEngine;
for(const invalid of ['--','cd1|C|0,145,2741,7,0,0,1,0||0,1','cd1|C|0,145|60|0,1','cd1|C|0,145,2741,7,0,0,1,0|128|0,1','cd1|C|0,145,2741,7,0,0,1,0|60|5,1'])assert.equal(parseDiscovery(invalid),null);
console.log('Discovery UI: bounded probes, stable candidates, audition ownership, explicit commit/save, sound voicing, navigation and compatibility pass');

// Top-note constraints may collapse several native voicing variants to one sound.
const {ChordDiscovery,voiceDistance,parseDiscoveryContext}=await import('../dist/esm/seq/chord-discovery.js');
let batch=0,mode='',probeCount=0;
const fixed='cd1|C|0,145,2741,7,0,0,1,0|60,64,67|0,1';
const isolated=new ChordDiscovery({conductor:()=>0,queued:()=>true,identity:()=> '0,0',source:()=>saved.slots[0],colorView:()=>0,
 sound:()=>({set:(key,value)=>{if(key==='hb_chord_discovery_context'){mode=value;batch++;}if(key==='hb_chord_discovery_probe')probeCount++;},get:key=>key==='hb_chord_discovery_context'?`dc1|${batch}|Queue|${fixed}`:fixed}),
 commit:()=>{throw new Error('unexpected commit');},save:()=>{throw new Error('unexpected save');},changed:()=>{},toast:()=>{}});
isolated.refresh('cp_voicings');for(let index=0;index<7;index++)isolated.tick('cp_voicings');
assert.equal(isolated.read('cp_voicing_choice_0'),'C');assert.equal(isolated.read('cp_voicing_choice_1'),'--');assert.equal(isolated.color(1),0);
assert(mode.startsWith('0,1;'));isolated.action('cp_discovery_source');assert(mode.startsWith('0,2;'));
assert.equal(voiceDistance([60,64,67],[60,64,67]),0);assert(voiceDistance([60,64,67],[60,65,69])<voiceDistance([60,64,67],[72,76,79]));
assert.equal(parseDiscoveryContext('dc1|0|Queue|'+fixed),null);
// Identical sounding notes may still represent different chord scales/functions.
let semanticProbe=fixed;
const semantic=new ChordDiscovery({conductor:()=>0,queued:()=>false,identity:()=> '0,0',source:()=>saved.slots[0],colorView:()=>0,
 sound:()=>({set:(key,value)=>{
  if(key!=='hb_chord_discovery_probe')return;
  const fields=value.split(';')[1].split(',').map(Number),intent=fields[7];
  const scale=intent===9?2733:2741,kind=intent===3?8:7;
  semanticProbe=`cd1|${intent===9?'Borrowed':intent===3?'Dominant':'Diatonic'}|0,145,${scale},${kind},0,0,1,0|60,64,67|0,1`;
 },get:key=>key==='hb_chord_discovery_context'?`dc1|1|Current|${fixed}`:semanticProbe}),
 commit:()=>{},save:()=>{},changed:()=>{},toast:()=>{}});
semantic.refresh('cp_discovery');for(let index=0;index<11;index++)semantic.tick('cp_discovery');
assert.deepEqual([0,1,2].map(index=>semantic.read('cp_discovery_choice_'+index)),['Diatonic','Dominant','Borrowed']);
assert.equal(semantic.read('cp_discovery_choice_3'),'--','same notes and semantic identity collapse');
console.log('Contextual discovery UI: captured source, frozen pitches, stale-commit rejection, manual anchor and deduplicated voicings pass');
