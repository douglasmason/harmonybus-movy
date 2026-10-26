// Reuse the real-controller Grid fixture's complete host metadata and app setup.
import './hb-grid.mjs';
import assert from 'node:assert/strict';
const {chordPage}=await import('../dist/esm/seq/chord-play.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {settingsPage}=await import('../dist/esm/seq/hb-settings.js');
let page=chordPage(),navigation=page.ctl.hbNavigation;
page.goToPage(0);
assert.deepEqual(navigation.state().groups,['Sound','Conductor Content','Chord Editing','Conductor Settings','Comp','Melody Mapping','Melody Sound','Melody Operations','Libraries','Setup']);
const coreLevels=navigation.state().indices.map(index=>page.ctl.pages[index].level);
assert.deepEqual(coreLevels,['root','cp_bank_0','cp_bank_1','cp_bank_2','cp_scale_controls','cp_Conductor_follower_touch','cp_Conductor_operations_9_16','cp_Conductor_motif_play'],
 'Chord Play keeps exactly eight playing panels; editors and overflow remain in Settings');
const coreCount=coreLevels.length;
for(let index=0;index<coreCount;index++)page.changePage(1);
const origin=page.pageIndex;page.changePage(-1);assert(!navigation.isMenu());assert.equal(page.pageIndex,origin);page.changePage(1);
assert(navigation.isMenu());
let reads=0,writes=0;const port=portFor(0),read=port.getParam,write=port.setParam;
port.getParam=key=>{reads++;return read(key);};port.setParam=(key,value)=>{writes++;return write(key,value);};
page.changePage(1);page.render('Chord Play');page.knobTurn(0,1);page.knobTouch(0,true);page.knobTouch(0,false);
assert.equal(reads,0,'category browsing/rendering never loads candidate panels');assert.equal(writes,0,'menu knobs never edit the hidden panel');
port.getParam=read;port.setParam=write;
const choice=navigation.state().choice;for(let index=0;index<30;index++)page.changePage(1);assert.equal(navigation.state().choice,navigation.state().groups.length-1,'right stops at last item');
while(navigation.state().choice>choice)page.changePage(-1);assert(navigation.isMenu(),'left moves within the list');
while(navigation.state().choice<navigation.state().groups.indexOf('Comp'))page.changePage(1);page.click();assert.equal(navigation.state().category,'Comp');
assert(navigation.canMove(-1),'first group panel advertises the return to its settings list');
const compChoice=navigation.state().groups.indexOf('Comp');page.changePage(-1);
assert(navigation.isMenu());assert.equal(navigation.state().choice,compChoice,'left returns to the selected group');
page.click();assert.equal(page.pageIndex,navigation.state().indices[0]);
for(let index=0;index<40;index++)page.changePage(1);
assert.equal(navigation.state().category,'Comp');assert(page.ctl.page.level.startsWith('cp_Comp_'));
selectTrack(4);const other=chordPage();assert.equal(other.ctl.page.name,page.ctl.page.name);assert.equal(other.ctl.hbNavigation.state().category,'Comp');
other.back();assert(other.ctl.hbNavigation.isMenu());selectTrack(0);assert(chordPage().ctl.hbNavigation.isMenu(),'track change preserves category-list location');
page=chordPage();navigation=page.ctl.hbNavigation;while(navigation.state().choice>0)page.changePage(-1);assert(navigation.isMenu());assert.equal(navigation.state().choice,0);page.changePage(-1);assert(!navigation.isMenu());assert.equal(navigation.state().category,'Comp');
const settings=settingsPage();assert(settings.ctl.pages.some(candidate=>candidate.keys?.includes('track_role')));
assert(!settings.ctl.pages.some(candidate=>candidate.keys?.includes('chord_mode')),'HB Settings does not duplicate musical chord controls');
assert(settings.ctl.hbNavigation.state().groups.includes('Diagnostics'));
const missing=page.ctl.pages.findIndex(candidate=>candidate.level==='cp_Melody_track_scales');page.goToPage(missing);
assert.equal(navigation.state().category,'Melody Mapping','direct panel jumps select their category too');
const setupIndex=page.ctl.pages.findIndex(candidate=>candidate.level==='cp_setup');page.goToPage(setupIndex);
assert.equal(navigation.state().indices.length,1);assert(navigation.canMove(-1));
assert.equal(page.ctl.state.metaIndex.get('cp_reset').writeOnly,true,'Reset uses the shared action button');
assert.deepEqual(page.ctl.page.keys.slice(0,7),['cp_conductor','cp_bass_track','cp_comp','cp_melody','cp_bass_source','cp_colorView','cp_reset']);
for(const [key,label] of [['cp_conductor','Cond'],['cp_bass_track','Bass'],['cp_comp','Comp'],['cp_melody','Mel']])assert.equal(page.ctl.state.metaIndex.get(key).short_name,label);
page.changePage(-1);assert(navigation.isMenu());assert.equal(navigation.state().groups[navigation.state().choice],'Setup');
page.click();assert.equal(page.pageIndex,setupIndex,'single-page Setup reopens in place');
console.log('Panel categories: core boundary, restricted jog, read-free menus, inert knobs, back trail and track continuity pass');
// Render through Movy's outer chrome, not just the isolated parameter page.
const {renderKnobsView}=await import('../dist/esm/renderer/knob-view.js');
const {drawHeader,drawBankBar}=await import('../dist/esm/renderer/header.js');
const {fontPrint,fontWidth}=await import('../dist/esm/font/index.js');
const {schwungPageFor}=await import('../dist/esm/renderer/schwung-grid.js');
const pixels=new Uint8Array(128*64),oldClear=globalThis.clear_screen,oldFill=globalThis.fill_rect;
globalThis.clear_screen=()=>pixels.fill(0);
globalThis.fill_rect=(x,y,width,height,color)=>{x=Math.trunc(x);y=Math.trunc(y);width=Math.trunc(width);height=Math.trunc(height);for(let row=Math.max(0,y);row<Math.min(64,y+height);row++)for(let column=Math.max(0,x);column<Math.min(128,x+width);column++)pixels[row*128+column]=color?1:0;};
try {
 for(const current of [schwungPageFor(0,'midi_fx1'),chordPage()]){
  current.goToPage(0);current.ctl.state.touched=-1;current.ctl.state.peek=null;
  clear_screen();current.ctl.render({fillRect:fill_rect,print:fontPrint,textWidth:fontWidth},{title:'HarmonyBus',bands:{header:false,bank:false,footer:false}});
  const widgetBorder=pixels.slice(128*9,128*10);assert(widgetBorder.some(Boolean),'fixture draws a top widget border');
  clear_screen();current.render('HarmonyBus');const expected=pixels.slice(0,128*7);
  assert.deepEqual(pixels.slice(128*9,128*10),widgetBorder,'chrome preserves the shared renderer’s complete top widget border');
  const expectedBar=pixels.slice(128*7,128*9);
  current.knobTouch(0,true);clear_screen();drawHeader('HarmonyBus','T1');
  drawBankBar(current.pageIndex,current.pageCount);current.render('HarmonyBus');
  assert.deepEqual(pixels.slice(128*7,128*9),expectedBar,'knob touch never reveals full internal panel count');
  current.knobTouch(0,false);current.ctl.state.peek=null;current.ctl.state.touched=-1;
  const vm={moduleName:'HarmonyBus',bankName:'T4',bankIndex:0,bankCount:30,rows:[],toast:null,overlay:null};
  renderKnobsView(vm,false,3,()=>current.render('HarmonyBus'));
  assert.deepEqual(pixels.slice(0,128*7),expected,'category title replaces the complete Normal Play outer header');
  clear_screen();drawHeader('Chord Play','C1 P3 M8');current.render('Chord Play');
  assert.deepEqual(pixels.slice(0,128*7),expected,'category count replaces the complete Chord Play route header');
 }
 const {renderChord}=await import('../dist/esm/seq/chord-play.js');
 const current=chordPage();current.goToPage(0);
 const corePages=current.ctl.hbNavigation.state().indices;
 for(const pageIndex of [...corePages,setupIndex]){
  current.goToPage(pageIndex);
  const groupPages=current.ctl.hbNavigation.state().indices;
  const position=groupPages.indexOf(pageIndex),count=groupPages.length;
  const segments=new Uint8Array(128),selected=new Uint8Array(128);
  if(count>1){
   const area=128-(count-1);
   for(let index=0;index<count;index++){
    const start=Math.floor(index*area/count)+index,end=Math.floor((index+1)*area/count)+index;
    segments.fill(1,start,end);if(index===position)selected.fill(1,start,end);
   }
  }
  for(const touched of [-1,0]){
   current.ctl.state.touched=touched;current.ctl.state.peek=null;
   clear_screen();current.ctl.render({fillRect:fill_rect,print:fontPrint,textWidth:fontWidth},{title:'Chord Play',bands:{header:false,bank:false,footer:false}});
   const widgetTop=pixels.slice(128*9,128*10);
   renderChord();
   assert.deepEqual(pixels.slice(128*9,128*10),widgetTop,`${current.ctl.page.level}: outer indicator leaves no stray row below the group bar`);
   assert.deepEqual(pixels.slice(128*7,128*8),segments,`${current.ctl.page.level}: one solid segment per group page`);
   assert.deepEqual(pixels.slice(128*8,128*9),selected,`${current.ctl.page.level}: only the selected segment is double height`);
  }
 }
 current.ctl.state.touched=-1;
}finally{globalThis.clear_screen=oldClear;globalThis.fill_rect=oldFill;}
console.log('Category header pixels: outer app labels and route values are fully replaced');
// Route Back through the real MIDI dispatcher from a normal HB track panel.
const {appState,VIEW_KNOBS,VIEW_CHAIN}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {setGridEnabled}=await import('../dist/esm/seq/grid.js');
const {rememberClipsReturn}=await import('../dist/esm/seq/router-buttons.js');
setGridEnabled(false);selectTrack(0);seqState.sessionMode=false;appState.currentView=VIEW_KNOBS;
appState.trackChainIndex[0]=appState.trackModels[0].findIndex(model=>model.getComponentKey()==='midi_fx1');
schwungPageFor(0,'midi_fx1').goToPage(0);rememberClipsReturn(VIEW_CHAIN);
globalThis.onMidiMessageInternal([176,51,127]);globalThis.onMidiMessageInternal([176,51,0]);
assert(seqState.sessionMode,'Normal Play top-level Back returns to the originating Clips view');
console.log('Actual Back dispatcher returns a normal HB track panel to Clips');
seqState.sessionMode=false;appState.currentView=VIEW_KNOBS;
const normal=schwungPageFor(0,'midi_fx1');normal.goToPage(normal.ctl.pages.findIndex(candidate=>candidate.keys?.includes('chord_mode')));
const previousPanel=normal.ctl.page.name;
const buttons=await import('../dist/esm/seq/router-buttons.js');const {seqHandleMidi}=await import('../dist/esm/seq/router.js');
buttons.resetInputModeSelector();seqHandleMidi([176,50,127],false);seqHandleMidi([176,50,0],false);
seqHandleMidi([176,14,5-buttons.inputModeSelectorChoice()],false);seqHandleMidi([176,MoveMainButton,127],false);seqHandleMidi([176,MoveMainButton,0],false);
assert.equal(buttons.sessionPlayMode(),5);buttons.returnPreviousInputView();
assert.equal(buttons.sessionPlayMode(),1);assert.equal(schwungPageFor(0,'midi_fx1').ctl.page.name,previousPanel,'Back restores the previous equivalent HB panel');
