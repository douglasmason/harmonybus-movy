import './hb-chord-play.mjs';
import assert from 'node:assert/strict';
const {createSchwungPage}=await import('../dist/esm/renderer/schwung-page.js');
const {panelSpec}=await import('../dist/esm/renderer/panel-catalog.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {appState}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const chord=await import('../dist/esm/seq/chord-play.js');
const joint=await import('../dist/esm/seq/joint-panels.js');
const field=await import('../dist/esm/seq/field-play.js');
const {gridPage}=await import('../dist/esm/seq/grid.js');
const {settingsPage}=await import('../dist/esm/seq/hb-settings.js');
const {restoreJoint,setJointEnabled}=await import('../dist/esm/seq/joint-play.js');
seqState.sessionMode=false;restoreJoint(null);setJointEnabled(true);joint.resetJointPanels();field.setFieldEnabled(true);
const pages={'Normal Play':createSchwungPage(portFor(3),'midi_fx1',{harmonyMode:0}),'Motif Play':createSchwungPage(portFor(3),'midi_fx1',{harmonyMode:2}),'Chord Play':chord.chordPage(),'Joint Play':joint.jointPage(),'Grid Sequencer':gridPage(),'Field Play':field.fieldPage(),'HB Settings':settingsPage()};
for(const [mode,surface] of Object.entries(pages)){
 for(const page of surface.ctl.pages)assert(panelSpec(mode,page).known,mode+' missing catalog entry '+page.level);
 console.log('CATALOG',mode,JSON.stringify(Object.fromEntries([...new Set(surface.ctl.pages.map(page=>panelSpec(mode,page).group))].map(group=>[group,surface.ctl.pages.filter(page=>panelSpec(mode,page).group===group).length]))));
}
const normal=pages['Normal Play'];normal.goToPage(0);
assert.deepEqual(normal.ctl.hbNavigation.state().indices.map(index=>normal.ctl.pages[index].level),['root','harmony_status','follower_touch','operations_9_16']);
const motif=pages['Motif Play'];motif.goToPage(0);motif.changePage(1);assert.equal(motif.ctl.page.level,'approach_bank_0','motif banks immediately follow Main');
for(const page of pages['Joint Play'].ctl.pages){
 const match=/^joint_(?:sources|source_expression|source_gestures|source_operations|source_automation|preview|variation)_([0-3])$/.exec(page.level);
 if(match)assert.equal(panelSpec('Joint Play',page).group,['Root','Bass','Comp','Melody'][Number(match[1])]);
}
assert(pages['Joint Play'].ctl.pages.filter(page=>panelSpec('Joint Play',page).group==='Song Sections').length>=3);
const current=field.fieldPage();assert.equal(current.keyAt(0),'field_speed');
assert.deepEqual(current.ctl.pages.map(page=>page.level),['root','field_mapping','field_display','field_spread']);
const port=portFor(appState.activeTrack.index),write=port.setParam,writes=[];port.setParam=(key,value)=>{writes.push(key);return write(key,value);};
field.fieldMidi([176,71,4]);for(let count=0;count<10;count++)current.tick();
assert(writes.includes('midi_fx1:field_speed'),'actual Field knob edits speed');assert(!writes.includes('midi_fx1:master_transpose'));port.setParam=write;
assert.equal(panelSpec('Chord Play',{level:'cp_Conductor_follower_touch_more',keys:[]}).group,'Conductor Settings');
assert.equal(panelSpec('Normal Play',{level:'new_future_editor',keys:[]}).group,'Other Settings','new pages cannot silently inflate Core');
const settings=pages['HB Settings'];const usage=settings.ctl.pages.findIndex(page=>page.level==='interface_usage');assert(usage>=0);settings.goToPage(usage);
let clock=Date.now();Date.now=()=>clock;const flush=()=>{for(let i=0;i<8;i++){clock+=100;settings.tick();}};
assert.equal(settings.keyAt(0),'usage_enabled');settings.knobTurn(0,-1);flush();
const logging=await import('../dist/esm/app/interface-usage.js');assert.equal(logging.interactionLog.enabled,false,'real Usage control pauses logging');settings.knobTurn(0,1);flush();assert.equal(logging.interactionLog.enabled,true);
settings.knobTouch(1,true);assert.notEqual(logging.usageValue('usage_status'),'Save queued');appState.shiftHeld=true;settings.knobTouch(1,true);assert.equal(logging.usageValue('usage_status'),'Save queued');appState.shiftHeld=false;
console.log('Panel catalog: Field controls, actor grouping, bounded Core order and actual Usage controls pass');
