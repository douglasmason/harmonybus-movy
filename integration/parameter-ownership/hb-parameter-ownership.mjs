// Exercise the real MIDI dispatcher, app renderer and LED writers together.
import './hb-ui-responsiveness.mjs';
import assert from 'node:assert/strict';
const state = await import('../dist/esm/app/state.js');
const { appState, VIEW_MAIN_PARAMS, VIEW_CLIP_PARAMS, VIEW_FLAGS, VIEW_CPU, VIEW_VERSIONS, VIEW_CHAIN } = state;
const { seqState } = await import('../dist/esm/seq/state.js');
const chord = await import('../dist/esm/seq/chord-play.js');
const joint = await import('../dist/esm/seq/joint-play.js');
const grid = await import('../dist/esm/seq/grid.js');
const field = await import('../dist/esm/seq/field-play.js');
const settings = await import('../dist/esm/seq/hb-settings.js');
const main = await import('../dist/esm/seq/main-page.js');
const clip = await import('../dist/esm/seq/clip-page.js');
const flags = await import('../dist/esm/seq/flags-page.js');
const cpu = await import('../dist/esm/seq/cpu-page.js');
const versions = await import('../dist/esm/seq/versions-page.js');
const { closeParamPage, openParamPage, paramPageActive } = await import('../dist/esm/seq/param-page.js');
const { keyboardState } = await import('../dist/esm/keyboard/state.js');
const { buildMainPageVM } = await import('../dist/esm/seq/main-page-vm.js');
const { buildClipPageVM } = await import('../dist/esm/seq/clip-page-vm.js');
const { buildFlagsPageVM } = await import('../dist/esm/seq/flags-page-vm.js');
const { buildCpuPageVM } = await import('../dist/esm/seq/cpu-page-vm.js');
const { buildVersionsPageVM } = await import('../dist/esm/seq/versions-page-vm.js');
const { renderKnobsView } = await import('../dist/esm/renderer/knob-view.js');
const { renderFlagsView } = await import('../dist/esm/renderer/flags-view.js');
const { renderCpuView } = await import('../dist/esm/renderer/cpu-view.js');
const { renderVersionsView } = await import('../dist/esm/renderer/versions-view.js');
const { currentSetUuid } = await import('../dist/esm/seq/set-session.js');
const { resetSeqHeader } = await import('../dist/esm/seq/render.js');
const { seqLedsInvalidate, ledBudgetTake } = await import('../dist/esm/seq/led-cache.js');
const { resetKnobLedCache } = await import('../dist/esm/renderer/knob-leds.js');
const { performanceTouchActive, ownPerformanceTouch, cancelPerformanceTouches } = await import('../dist/esm/renderer/performance-touch.js');
const { portFor } = await import('../dist/esm/track/registry.js');
const midi = globalThis.onMidiMessageInternal;
let now = 1000000, knobWrites = 0;
Date.now = () => now;
const pixels = new Uint8Array(128 * 64), leds = new Map();
globalThis.fill_rect = (x,y,width,height,color) => {
  for(let row=Math.max(0,y|0);row<Math.min(64,(y|0)+(height|0));row++)
    for(let col=Math.max(0,x|0);col<Math.min(128,(x|0)+(width|0));col++)pixels[row*128+col]=color?1:0;
};
globalThis.clear_screen = () => pixels.fill(0);
globalThis.setLED = (note,color) => {if(note<8)knobWrites++;leds.set('n'+note,color);};
globalThis.setButtonLED = (control,color) => {if(control>=71&&control<=78)knobWrites++;leds.set('c'+control,color);};
const packet = data => { const type=data[1]&240;if(type===144&&data[2]<8||type===176&&data[2]>=71&&data[2]<=78)knobWrites++; if(type===144||type===176)leds.set((type===144?'n':'c')+data[2],data[3]); };
globalThis.move_midi_internal_send = data => {packet(data);return true;};
globalThis.move_midi_cable_send = (cable,data) => {if(cable===0)for(let offset=0;offset<data.length;offset+=4)packet(data.slice(offset,offset+4));return true;};
const tick = () => {now+=100;globalThis.tick();};
const frames = (count=24) => {for(let frame=0;frame<count;frame++)tick();};
const click = control => {midi([176,control,127]);midi([176,control,0]);};
const touch = (slot,releaseStatus=128) => {midi([144,slot,100]);midi([releaseStatus,slot,0]);};
const shortcut = step => {appState.shiftHeld=true;midi([144,16+step,100]);midi([128,16+step,0]);appState.shiftHeld=false;};
const knobFrame = () => Array.from({length:8},(_,index)=>[leds.get('n'+index),leds.get('c'+(71+index))]);
function modeEnabled(mode){return mode==='Chord'?chord.chordActive():mode==='Joint'?joint.jointActive():mode==='Grid'?grid.gridActive():field.fieldActive();}
function selectMode(mode){
  if(paramPageActive())closeParamPage();
  chord.setChordEnabled(false);joint.setJointEnabled(false);grid.setGridEnabled(false);field.setFieldEnabled(false);settings.setSettingsOpen(false);
  seqState.sessionMode=false;appState.currentView=VIEW_CHAIN;appState.shiftHeld=false;
  if(mode==='Chord')chord.setChordEnabled(true);
  if(mode==='Joint')joint.setJointEnabled(true);
  if(mode==='Grid')grid.setGridEnabled(true);
  if(mode==='Field')field.setFieldEnabled(true);
  resetSeqHeader();seqLedsInvalidate();resetKnobLedCache();appState.dirty=true;frames();
}
const pages=[['Set',VIEW_MAIN_PARAMS,8],['Clip',VIEW_CLIP_PARAMS,2],['Settings',VIEW_FLAGS,1],['CPU',VIEW_CPU,11],['Backups',VIEW_VERSIONS,null]];
function renderExpected(view){
  if(view===VIEW_MAIN_PARAMS)renderKnobsView(buildMainPageVM(),false,appState.activeTrack.index);
  if(view===VIEW_CLIP_PARAMS)renderKnobsView(buildClipPageVM(),false,appState.activeTrack.index);
  if(view===VIEW_FLAGS)renderFlagsView(buildFlagsPageVM());
  if(view===VIEW_CPU)renderCpuView(buildCpuPageVM());
  if(view===VIEW_VERSIONS){const vm=buildVersionsPageVM(now,currentSetUuid());vm.selected=versions.versionsPageState.selected;vm.confirming=versions.versionsPageState.confirming;renderVersionsView(vm);}
}
for(const mode of ['Chord','Joint','Grid','Field']){
  selectMode(mode);
  for(const [name,view,step]of pages){
    const beforeKnobs=knobFrame();
    if(step!==null)shortcut(step);
    else{shortcut(1);flags.flagsPageState.selected=flags.flagsRowCount()-1;click(MoveMainButton);}
    assert.equal(appState.currentView,view,mode+' opens '+name+' through physical controls');
    resetSeqHeader();
    const covered=appState.trackModels[3][appState.trackChainIndex[3]],savedTick=covered.tick,valueRefreshes=[];
    covered.tick=(refresh=true)=>{valueRefreshes.push(refresh);return savedTick(refresh);};
    frames();covered.tick=savedTick;
    assert(valueRefreshes.length>0&&valueRefreshes.every(refresh=>!refresh),name+' retains lifecycle work without polling the hidden bank');
    const actual=pixels.slice(0,128*58);renderExpected(view);
    assert.deepEqual(actual,pixels.slice(0,128*58),mode+' displays '+name);
    assert.equal(modeEnabled(mode),true,name+' preserves '+mode);
    if(view===VIEW_MAIN_PARAMS){keyboardState.columnOffset=0;touch(7);midi([176,78,8]);midi([144,7,0]);assert.equal(keyboardState.columnOffset,1);}
    if(view===VIEW_CLIP_PARAMS){const before=clip.clipPageState.editGrid;touch(4);midi([176,75,8]);midi([128,4,0]);assert.equal(clip.clipPageState.editGrid,Math.min(4,before+1));assert.equal(clip.clipPageState.touchedKnob,-1);}
    if(view===VIEW_FLAGS){flags.flagsPageState.selected=0;midi([176,14,1]);assert.equal(flags.flagsPageState.selected,1);click(MoveMainButton);assert.equal(appState.currentView,VIEW_FLAGS);}
    if(view===VIEW_CPU){const before=cpu.cpuDetail.page;midi([176,14,1]);assert.equal(cpu.cpuDetail.page,(before+1)%3);}
    if(view===VIEW_CPU||view===VIEW_VERSIONS){
      assert.deepEqual(knobFrame(),Array.from({length:8},()=>[0,0]),name+' darkens both LED addresses');
      touch(0);midi([176,71,8]);assert.equal(appState.currentView,view);
    }
    if(view===VIEW_VERSIONS){versions.versionsPageState.confirming=true;click(51);assert.equal(appState.currentView,view);assert.equal(versions.versionsPageState.confirming,false);}
    click(51);assert.equal(appState.currentView,VIEW_CHAIN,mode+' Back closes '+name);frames();
    assert.equal(modeEnabled(mode),true);
    assert.deepEqual(knobFrame(),beforeKnobs,mode+' restores knob LEDs after '+name);
  }
}
console.log('Parameter ownership: 20 physical mode/page transitions, screen, controls, Back/confirmation and both knob LED addresses pass');

// Musical input keeps its owner while parameter pages cover the controller.
const { soundingPitch } = await import('../dist/esm/keyboard/held-notes.js');
selectMode('Chord');keyboardState.columnOffset=0;
midi([144,68,100]);const heldPitch=soundingPitch(68);assert.notEqual(heldPitch,undefined);
shortcut(11);assert.equal(soundingPitch(68),heldPitch,'opening CPU preserves the held onset');
click(63);assert.equal(keyboardState.columnOffset,1,'CPU keeps melodic arrow ownership');
assert.equal(soundingPitch(68),heldPitch,'position change preserves held pitch');
midi([128,68,0]);assert.equal(soundingPitch(68),undefined);
midi([144,68,100]);assert.notEqual(soundingPitch(68),undefined,'pads remain playable under CPU');midi([144,68,0]);
click(51);

// The shared physical ledger delivers old performance releases before the new page.
let released=0;ownPerformanceTouch(2,()=>released++);shortcut(2);
midi([128,2,0]);assert.equal(released,1);assert.equal(clip.clipPageState.touchedKnob,-1);click(51);
// A parameter touch also owns its release after Back; it cannot release the panel underneath.
shortcut(2);midi([144,0,100]);assert.equal(clip.clipPageState.scaleOverlay,true);
click(51);assert.equal(clip.clipPageState.scaleOverlay,false);midi([128,0,0]);
assert.equal(appState.currentView,VIEW_CHAIN);
shortcut(8);frames(2);midi([144,7,100]);assert.equal(performanceTouchActive(),false,'settings touches do not pause performance feedback');
shortcut(1);midi([144,7,0]);assert.equal(appState.currentView,VIEW_FLAGS);click(51);

// Returning to a master detail page also takes exactly one Back.
chord.setChordEnabled(false);seqState.sessionMode=true;appState.masterDetail=true;appState.currentView=VIEW_CHAIN;
openParamPage(VIEW_CPU);click(51);assert.equal(appState.currentView,VIEW_CHAIN);assert.equal(appState.masterDetail,true);
seqState.sessionMode=false;appState.masterDetail=false;

// A budget-limited frame must retry knob LEDs without another gesture or value change.
selectMode('Chord');shortcut(8);frames();
const model=appState.trackModels[3][appState.trackChainIndex[3]],originalTick=model.tick;
let starve=true;
model.tick=(...args)=>{const result=originalTick(...args);if(starve){starve=false;for(let packet=0;packet<40;packet++)ledBudgetTake();}return result;};
shortcut(11);tick();assert.equal(appState.dirty,true,'a denied knob write schedules another frame');
model.tick=originalTick;frames(4);assert.deepEqual(knobFrame(),Array.from({length:8},()=>[0,0]),'CPU darkens every knob after the busy frame');click(51);frames();
assert(knobFrame().some(([note])=>note>0),'the performance lights return after the busy frame');

// Field output holds are still released to the hidden Field owner.
selectMode('Field');
const fieldValues=[1,0,0,...Array.from({length:16},()=>[5000,5000,0]).flat(),0,0,0,0];
portFor(3).setParam('midi_fx1:field_outputs_view2','fo2,'+fieldValues.join(','));frames();
const outputs=await import('../dist/esm/seq/field-outputs.js');
midi([144,1,100]);assert(outputs.outputHeld());shortcut(2);assert(outputs.outputHeld());
midi([128,1,0]);assert.equal(outputs.outputHeld(),false);click(51);
console.log('Parameter ownership: held notes, arrows, old/new touch releases, sibling/master return and budget retry pass');

selectMode('Chord');frames();knobWrites=0;frames(8);assert.equal(knobWrites,0,'settled performance LEDs stay cached');
console.log('Parameter ownership: covered-model polling stays paused and settled knob LEDs send no redundant packets');

// Host handoff cancels uncommitted enum previews instead of committing them.
shortcut(8);const originalScale=keyboardState.scale;midi([144,5,100]);midi([176,76,8]);
assert.notEqual(main.mainPageState.overlaySel,originalScale);cancelPerformanceTouches();
assert.equal(keyboardState.scale,originalScale);assert.equal(main.mainPageState.overlayKnob,-1);click(51);
shortcut(2);const originalClipScale=seqState.clipScaleIdx;midi([144,0,100]);midi([176,71,8]);
assert.notEqual(clip.clipPageState.scaleSel,originalClipScale);cancelPerformanceTouches();
assert.equal(seqState.clipScaleIdx,originalClipScale);assert.equal(clip.clipPageState.scaleOverlay,false);click(51);
console.log('Parameter ownership: cancelling host handoff preserves uncommitted Set and Clip scale previews');
