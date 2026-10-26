import './hb-chord-range.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const chord=await import('../dist/esm/seq/chord-play.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {selectTrack}=await import('../dist/esm/track/focus.js');
const {appState}=await import('../dist/esm/app/state.js');
const {panelSpec}=await import('../dist/esm/renderer/panel-catalog.js');
const levels=JSON.parse(readFileSync(process.env.HB_MODULE,'utf8')).capabilities.ui_hierarchy.levels;
chord.restoreChord(null);selectTrack(3);chord.setChordEnabled(true);
const conductor=portFor(0),comp=portFor(2);
conductor.setParam('midi_fx1:render_channel','3');
let now=Date.now()+1000;Date.now=()=>now;chord.tickChord();
let page=chord.chordPage();
const visit=level=>{page=chord.chordPage();const index=page.ctl.pages.findIndex(candidate=>candidate.level===level);assert(index>=0,level);page.goToPage(index);};
const flush=()=>{for(let tick=0;tick<8;tick++){now+=100;chord.tickChord();page.tick();}};
const keys=new Set(page.ctl.pages.flatMap(candidate=>candidate.keys));
for(const key of keys)assert(page.ctl.state.metaIndex.get(key),'renderable metadata for '+key);
// Compare against the native control definitions, not a copy of the new layout.
for(const [owner,sources] of [
 [0,['follower_touch','operations_9_16','motion_operation','motif_play','motif_global','global_transpose','explicit_key','secondary_scale','chord_forms','rhythm_generate','rhythm_edit','chord_player','arp_player']],
 [2,['chord_forms','follower_source','follower_play','rhythm_generate','rhythm_edit','motif_global','motion_operation','motion_timing','motion_conditions']],
 [null,['follower_source','follower_play','track_scales','chord_player','arp_player','follower_touch','operations_9_16','motion_operation','motion_timing','motion_conditions']]
])for(const source of sources)for(const original of levels[source].knobs){
 const bare=original==='motion_punch'?'hb_step_row':original;
 const key=owner===null?bare:'cp_track_'+owner+'_'+bare;
 assert(keys.has(key),'preserve native control '+key);
}
for(const key of ['cp_track_0_track_defaults_reset','cp_style','cp_gate','cp_register','bp_style','bp_gate','bp_register'])assert(keys.has(key),key);
assert(!page.ctl.pages.some(candidate=>candidate.level.endsWith('_more')),'no single-control overflow pages');
const counts=Object.fromEntries([...new Set(page.ctl.pages.map(candidate=>panelSpec('Chord Play',candidate).group))].map(group=>[group,page.ctl.pages.filter(candidate=>panelSpec('Chord Play',candidate).group===group).length]));
assert.deepEqual(counts,{Core:8,Sound:3,'Conductor Content':6,'Chord Editing':2,'Conductor Settings':8,Comp:10,'Melody Mapping':3,'Melody Sound':3,'Melody Operations':6,Libraries:2,Setup:1});
assert.equal(page.ctl.pages.length,52);
for(const candidate of page.ctl.pages)assert.equal(candidate.keys[7],'cp_off');

visit('cp_Sound_output');
let port=chord.chordPanelPort(3);port.getParam('midi_fx1:chain_params');
assert.equal(port.getParam('midi_fx1:cp_sound_path'),'C1>3');
assert.equal(port.setParam('midi_fx1:cp_sound_path','Comp T3'),false);
assert.match(page.ctl.page.name,/Sound Cond T1/);
assert.equal(page.keyAt(2),'cp_velocity');
const compVelocity=comp.getParam('midi_fx1:render_velocity_percent');
const before=conductor.getParam('midi_fx1:render_velocity_percent');
page.knobTurn(2,4);flush();
assert.notEqual(conductor.getParam('midi_fx1:render_velocity_percent'),before);
assert.equal(comp.getParam('midi_fx1:render_velocity_percent'),compVelocity);
const conductorVelocity=conductor.getParam('midi_fx1:render_velocity_percent');
const queue=chord.chordSnapshot().playMode;
// Route switching must keep the panel, category, melody focus and queue mode.
chord.setChordCompSource(1);flush();
assert.equal(page.ctl.page.level,'cp_Sound_output');
assert.equal(page.ctl.hbNavigation.state().category,'Sound');
assert.match(page.ctl.page.name,/Sound Comp T3/);
assert.equal(port.getParam('midi_fx1:cp_sound_path'),'Comp T3');
assert.equal(page.keyAt(4),'cp_track_2_chord_register');
page.knobTurn(2,4);flush();
assert.notEqual(comp.getParam('midi_fx1:render_velocity_percent'),compVelocity);
assert.equal(conductor.getParam('midi_fx1:render_velocity_percent'),conductorVelocity);
assert.equal(appState.activeTrack.index,3);assert.equal(chord.chordSnapshot().playMode,queue);
assert.equal(port.getParam('midi_fx1:cp_off'),String(Number(conductor.getParam('midi_fx1:chord_register'))||0),'inherited range resolves through the conductor');
assert.equal(port.getParam('midi_fx1:cp_track_2_chord_register'),'Conductor','explicit inheritance remains visible');
chord.setChordCompSource(0);flush();assert.match(page.ctl.page.name,/Sound Cond T1/);
conductor.setParam('midi_fx1:render_channel','4');flush();assert.equal(port.getParam('midi_fx1:cp_sound_path'),'C1>4');
conductor.setParam('midi_fx1:render_channel','Off');flush();assert.match(page.ctl.page.name,/Sound Comp T3/,'automatic melody fallback has the correct owner');
visit('cp_comp_library');assert.equal(page.ctl.page.name,'Comp T3 Clip');
assert.equal(page.ctl.metaAt(5).name,'Stored Clip Note Length %');assert.equal(page.ctl.metaAt(6).name,'Stored Clip Pitch Shift');
assert(!page.ctl.page.keys.includes('cp_velocity'),'clip-shaping controls do not masquerade as the current sound');
console.log('Chord settings: 67 -> 52 pages, complete native controls, eight Core panels, output ownership, inheritance, route continuity and clip labels pass');
