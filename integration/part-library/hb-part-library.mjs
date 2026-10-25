// Real shared page/controller fixture; the engine side is covered by native tests.
import './hb-chord-play.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {partRead,partWrite}=await import('../dist/esm/seq/part-controls.js');
const {preparePart,partModalTouch,partModalActive,drawPartReview,cancelPartReview}=await import('../dist/esm/seq/part-library.js');
chord.restoreChord(null);chord.setChordEnabled(true);let page=chord.chordPage();page.goToPage(0);
assert.deepEqual(Array.from({length:8},(_,index)=>page.keyAt(index)),['cp_source','cp_style','cp_velocity','cp_gate','cp_form_live','cp_voicing_live','cp_register','cp_off']);
const conductor=portFor(0);conductor.setParam('midi_fx1:render_channel','3');
chord.setChordCompSource(1);assert.equal(conductor.getParam('midi_fx1:render_channel'),'Off');
chord.setChordCompSource(0);assert.equal(conductor.getParam('midi_fx1:render_channel'),'3');
const state=chord.chordSnapshot();assert.equal(state.directRender,'3');
assert(partWrite('cp_style','Offbeats',2));assert.equal(partRead('cp_style',2),'Offbeats');
assert.equal(partWrite('cp_style','No such style',2),false);
assert.equal(partWrite('cp_user','9',2),false);
const oldGet=globalThis.host_module_get_param;
globalThis.host_module_get_param=key=>key==='motif_clip_info_2'?'0,abc,16,0,4,1':oldGet(key);
// Capacitive touch precedes a turn on Move: browsing must not open a modal.
chord.chordMidi([0x90,1,127]);chord.chordMidi([0xb0,72,1]);chord.chordMidi([0x80,1,0]);
assert(!partModalActive());
chord.chordMidi([0x90,1,127]);chord.chordMidi([0x80,1,0]);assert(partModalActive(),'tap-release previews the selected style');
cancelPartReview();
preparePart({track:2,conductor:0,activate:()=>{}},1);
assert(partModalActive());assert(drawPartReview());
partModalTouch(1,true);partModalTouch(1,false);assert(partModalActive(),'opening touch cannot also commit/cancel');
partModalTouch(1,true);partModalTouch(1,false);assert(!partModalActive());
globalThis.host_module_get_param=oldGet;
console.log('Comp library: main controls, exclusive routing, selectors and deliberate loading pass');
