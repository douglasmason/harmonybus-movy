import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installEnv } from './env.mjs';
installEnv();
await import('../dist/esm/app/globals.js');
const { installMockEngine } = await import('./mock-engine.mjs');
const engine = installMockEngine();
const { seqEngineTick } = await import('../dist/esm/seq/engine.js');
seqEngineTick();
const { appState, VIEW_KNOBS } = await import('../dist/esm/app/state.js');
const { seqState } = await import('../dist/esm/seq/state.js');
const { setFlag } = await import('../dist/esm/seq/flags.js');
const { selectTrack } = await import('../dist/esm/track/focus.js');
const { portFor } = await import('../dist/esm/track/registry.js');
const { keyboardState, padMapFor, padMapBuildCount, COLUMN_OFFSET_MIN, COLUMN_OFFSET_MAX } = await import('../dist/esm/keyboard/state.js');
const { buildPadMap, pianoGapColumn } = await import('../dist/esm/keyboard/layouts.js');
const { buildSurfaceCells } = await import('../dist/esm/surfaces/protocol.js');
const { SCALES } = await import('../dist/esm/seq/scales.js');
const { padPositionActive, shiftPadPosition } = await import('../dist/esm/seq/pad-position.js');
const { seqHandleMidi } = await import('../dist/esm/seq/router.js');
const chord = await import('../dist/esm/seq/chord-play.js');
const joint = await import('../dist/esm/seq/joint-play.js');
const grid = await import('../dist/esm/seq/grid.js');
const settings = await import('../dist/esm/seq/hb-settings.js');
const { stepRecDown, stepRecEnd, stepRecHead } = await import('../dist/esm/seq/step-rec.js');
const { serializeUiState, applyUiState } = await import('../dist/esm/seq/ui-state.js');
const { refreshHarmonyPads, pianoApproachTarget, harmonyPadPlaying, invalidateHarmonyPadGeometry } = await import('../dist/esm/keyboard/harmony-pads.js');
const { padColor } = await import('../dist/esm/seq/pads.js');
const { seqLedsTick } = await import('../dist/esm/seq/leds.js');
const { seqLedsInvalidate, ledFrameReset } = await import('../dist/esm/seq/led-cache.js');
const { setButtonHeld } = await import('../dist/esm/seq/button-held.js');
const { WHITE_OFF, WHITE_DIM, WHITE_BRIGHT } = await import('../dist/esm/seq/colors.js');
const { onMidiMessageInternal } = globalThis;
const { setPhase } = await import('../dist/esm/seq/set-session.js');
setPhase('ready');
const metadata = JSON.parse(readFileSync(process.env.HB_MODULE, 'utf8'));
const writes = [];
let padView = '0,0,2741,0,0,7,0,0,4,2|input1,0,1,1,2741,0|piano1,1|toniccolor1,0';
for (let track = 0; track < 16; track++) {
    const port = portFor(track);
    const values = new Map(metadata.capabilities.chain_params.map(meta => [meta.key, String(meta.default ?? meta.options?.[0] ?? '0')]));
    port.getParam = key => {
        if (key === 'midi_fx1_module') return 'harmonybus';
        const bare = key.replace(/:(base|modulated)$/, '').split(':').at(-1);
        if (bare === 'chain_params') return JSON.stringify(metadata.capabilities.chain_params);
        if (bare === 'ui_hierarchy') return JSON.stringify(metadata.capabilities.ui_hierarchy);
        if (bare === 'pad_view') return padView;
        return values.get(bare) ?? '';
    };
    port.getMany = keys => keys.map(key => port.getParam(key));
    port.setParam = (key, value) => { writes.push([track, key, value]); values.set(key.split(':').at(-1), value); return true; };
}
setFlag('chtracks', 1);
selectTrack(3);
seqState.sessionMode = false;
appState.currentView = VIEW_KNOBS;
Object.assign(keyboardState, { columnOffset: 0, mode: 1, layout: 2, rootPc: 0, scale: 0 });
keyboardState.octave.fill(5);

// Spatial translation is an overlap identity across every key, scale and layout.
for (let scale = 0; scale < SCALES.length; scale++) {
    for (let root = 0; root < 12; root++) {
        for (const [mode, layout] of [[0, 0], [0, 1], [1, 0], [1, 1], [1, 2], [1, 3]]) {
            for (let offset = -6; offset <= 6; offset++) {
                const before = buildPadMap(mode, layout, scale, 60 + root, 8, -2, offset);
                const after = buildPadMap(mode, layout, scale, 60 + root, 8, -2, offset + 1);
                for (let row = 0; row < 8; row++) for (let column = 1; column < 8; column++) {
                    assert.equal(after[row * 8 + column], before[row * 8 + column - 1], 'one physical column right');
                }
            }
        }
    }
}
// Both six-note and synthetic eight-note scales use the shared cardinality.
const eightIndex = SCALES.push({ name: 'Test Octatonic', degrees: [0, 1, 3, 4, 6, 7, 9, 10] }) - 1;
assert.deepEqual([...buildPadMap(1, 2, eightIndex, 60, 1, 0, 3)], [67, 69, 70, 60, 61, 63, 64, 66].map((pitch, index) => index < 3 ? pitch - 12 : pitch));
SCALES.pop();
assert.deepEqual([...padMapFor(3).slice(0, 8)], [60, 62, 64, 65, 67, 69, 71, 72]);
for (let count = 0; count < 3; count++) { assert(seqHandleMidi([176, 63, 127], false)); seqHandleMidi([176, 63, 0], false); }
assert.deepEqual([...padMapFor(3).slice(0, 8)], [55, 57, 59, 60, 62, 64, 65, 67]);
keyboardState.rootPc = 2;
assert.deepEqual([...padMapFor(3).slice(0, 8)], [57, 59, 61, 62, 64, 66, 67, 69]);
assert.equal(keyboardState.columnOffset, 3, 'key change preserves tonic column');
padView = padView.replace('|input1,0,', '|input1,5,');
refreshHarmonyPads(3, 1000);
assert.equal(keyboardState.rootPc, 5, 'keyboard accepts the resolved parent/input key');
assert.equal(padMapFor(3)[3], 65, 'new tonic stays at the selected column');
padView = padView.replace('|input1,5,', '|input1,0,');
refreshHarmonyPads(3, 1100);
padMapFor(3);
const builds = padMapBuildCount(); for (let tick = 0; tick < 100; tick++) padMapFor(3);
assert.equal(padMapBuildCount(), builds, 'unchanged geometry is cached');

// Chord Play arrows leave every panel, touched knob and category list in place.
chord.restoreChord(null); chord.setChordEnabled(true);
const page = chord.chordPage();
keyboardState.rootPc = 0;
for (let panel = 0; panel < page.ctl.pages.length; panel++) {
    page.goToPage(panel); const selected = page.ctl.page.level;
    keyboardState.columnOffset = 0;
    seqHandleMidi([176, 63, 127], false); seqHandleMidi([176, 63, 0], false);
    assert.equal(keyboardState.columnOffset, 1); assert.equal(page.ctl.page.level, selected);
}
page.goToPage(0); keyboardState.columnOffset = 0;
seqHandleMidi([176, 14, 1], false); assert.notEqual(page.ctl.page.level, 'root', 'jog still changes panels');
const current = page.ctl.page.level;
page.knobTouch(0, true); seqHandleMidi([176, 63, 127], false); seqHandleMidi([176, 63, 0], false); page.knobTouch(0, false);
assert.equal(page.ctl.page.level, current); assert.equal(keyboardState.columnOffset, 1);
settings.setSettingsOpen(true, false); const settingsPage = settings.settingsPage(), settingsLevel = settingsPage.ctl.page.level;
seqHandleMidi([176, 62, 127], false); seqHandleMidi([176, 62, 0], false);
assert.equal(keyboardState.columnOffset, 0); assert.equal(settingsPage.ctl.page.level, settingsLevel);
settings.setSettingsOpen(false);

// A single LED owner reports availability, pressed brightness and both bounds.
const packets = [];
globalThis.move_midi_internal_send = packet => { packets.push([...packet]); return true; };
globalThis.setButtonLED = (button, color) => packets.push([11, 176, button, color]);
function lights() {
    packets.length = 0; seqLedsInvalidate();
    for (let frame = 0; frame < 8; frame++) { ledFrameReset(); seqLedsTick(false, VIEW_KNOBS, 0, 3, false); }
    return new Map(packets.filter(packet => (packet[1] & 240) === 176).map(packet => [packet[2], packet[3]]));
}
assert.equal(lights().get(62), WHITE_DIM); assert.equal(lights().get(63), WHITE_DIM);
const beforePress = keyboardState.columnOffset;
onMidiMessageInternal([176, 63, 127]); assert.equal(lights().get(63), WHITE_BRIGHT);
assert.equal(keyboardState.columnOffset, beforePress + 1, 'actual MIDI dispatcher shifts pads');
onMidiMessageInternal([176, 63, 0]); assert.equal(lights().get(63), WHITE_DIM);
keyboardState.columnOffset = COLUMN_OFFSET_MAX;
assert.equal(lights().get(63), WHITE_OFF); seqHandleMidi([176, 63, 127], false); seqHandleMidi([176, 63, 0], false);
assert.equal(keyboardState.columnOffset, COLUMN_OFFSET_MAX); assert.equal(page.ctl.page.level, current);
keyboardState.columnOffset = COLUMN_OFFSET_MIN; assert.equal(lights().get(62), WHITE_OFF);
for (const button of [62, 63]) setButtonHeld(button, false);

// Grid, Clips and explicit step recording retain their existing gestures.
chord.setChordEnabled(false); grid.setGridEnabled(true); seqState.loopStart = 0; seqState.lenSteps = 64;
grid.gridNavigate('move', -1000, -1000); const offset = keyboardState.columnOffset;
assert.equal(lights().get(62), WHITE_OFF); assert.equal(lights().get(63), WHITE_DIM);
seqHandleMidi([176, 63, 127], false); assert.equal(grid.gridWindow('move').page, 1); assert.equal(keyboardState.columnOffset, offset);
grid.setGridEnabled(false); seqState.sessionMode = true; appState.focusGroup = 0;
assert.equal(lights().get(62), WHITE_OFF); seqHandleMidi([176, 63, 127], false); assert.equal(appState.focusGroup, 1);
assert.equal(keyboardState.columnOffset, offset); appState.focusGroup = 3; assert.equal(lights().get(63), WHITE_OFF);
seqState.sessionMode = false; appState.focusGroup = 0; selectTrack(3); seqState.playing = false;
stepRecDown(); assert(!padPositionActive()); const head = stepRecHead();
seqHandleMidi([176, 63, 127], false); assert(stepRecHead() > head); assert.equal(keyboardState.columnOffset, offset); stepRecEnd();

// Piano gaps and all approach rows remain vertically aligned after shifting.
for (let offset = -7; offset <= 7; offset++) {
    Object.assign(keyboardState, { columnOffset: offset, rootPc: 0, mode: 0, layout: 1, scale: 0 });
    refreshHarmonyPads(3, 100000 + offset * 100);
    const map = padMapFor(3), cells = buildSurfaceCells(map, 1, true, offset);
    for (let column = 0; column < 8; column++) {
        const expected = pianoGapColumn(column - offset) ? map[column] : -1;
        assert.equal(pianoApproachTarget(3, 8 + column), expected);
        assert.equal(cells[8 + column].target, expected);
    }
}
Object.assign(keyboardState, { columnOffset: 0, mode: 1, layout: 2 });
refreshHarmonyPads(3, 200000);
const tonicColor = padColor(68, 68, 3, false);
shiftPadPosition(3); // Only unit arrow steps are accepted.
assert.equal(keyboardState.columnOffset, 0);
for (let count = 0; count < 3; count++) shiftPadPosition(1);
assert.equal(padColor(71, 68, 3, false), tonicColor, 'tonic light moves with the note');
assert.notEqual(padColor(68, 68, 3, false), tonicColor);
assert(!harmonyPadPlaying(3, 0), 'old positional playback mask cannot paint the new geometry');
refreshHarmonyPads(3, 200100);
for (let column = 0; column < 8; column++) assert.equal(pianoApproachTarget(3, 8 + column), padMapFor(3)[column]);
const group = { pads: 15, overlay: 1, secondary: 4, bass: 1, comp: 1, lower: 0, upper: 2, steps: 2, overwrite: 5 };
const baseline = joint.jointGeometry(0, group, [48, 36, 48, 60], 0, false, false, 0);
const shifted = joint.jointGeometry(0, group, [48, 36, 48, 60], 0, false, false, 1);
for (let row = 0; row < 4; row++) for (let column = 1; column < 8; column++) assert.deepEqual(shifted[row * 8 + column], baseline[row * 8 + column - 1]);

// The external surface shares placement and retains the pitch held before a shift.
const { tickLaunchpad, onMidiMessageExternal, unloadLaunchpad } = await import('../dist/esm/surfaces/launchpad.js');
const midi = [];
// Exercise the direct MIDI host; the native host ledger is covered by full_chain_audio.c.
const blockingHost = globalThis.host_module_set_param_blocking;
globalThis.host_module_set_param_blocking = undefined;
portFor(3).sendMidi = (status, pitch, velocity) => midi.push([status, pitch, velocity]);
globalThis.move_midi_external_send = () => true;
globalThis.host_ext_midi_remap_set = () => true;
globalThis.host_ext_midi_remap_enable = () => true;
globalThis.host_external_surface = () => true;
Object.assign(keyboardState, { columnOffset: 0, mode: 1, layout: 1 });
setFlag('hblaunchpad', 1);
tickLaunchpad(300000); tickLaunchpad(300010); tickLaunchpad(300020);
onMidiMessageExternal([144, 112, 100]);
const originalPitch = midi.at(-1)[1];
shiftPadPosition(1); tickLaunchpad(300100);
onMidiMessageExternal([160, 112, 45]);
assert.deepEqual(midi.at(-1), [160, originalPitch, 45]);
onMidiMessageExternal([128, 112, 0]);
assert.deepEqual(midi.at(-1), [128, originalPitch, 0]);
onMidiMessageExternal([144, 112, 100]);
assert.deepEqual(midi.at(-1), [144, originalPitch - 1, 100], 'new press uses the shifted scale position');
onMidiMessageExternal([128, 112, 0]); unloadLaunchpad();
globalThis.host_module_set_param_blocking = blockingHost;

// Missing old-session data defaults to zero; saved placement is global and bounded.
keyboardState.columnOffset = 4; const saved = serializeUiState(); keyboardState.columnOffset = -2; applyUiState(saved);
assert.equal(keyboardState.columnOffset, 4);
applyUiState('{}'); assert.equal(keyboardState.columnOffset, 0);
applyUiState('{"columnOffset":1000}'); assert.equal(keyboardState.columnOffset, COLUMN_OFFSET_MAX);
assert(!writes.some(([, key]) => key.endsWith(':follower_explicit_root')), 'arrows never rewrite the musical key');
console.log('Pad position: all layouts/scales, Chord Play/settings priority, jog, bounded button lights, Grid/Clips/step recording, approach/color alignment and persistence pass');
