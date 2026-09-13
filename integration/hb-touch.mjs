import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installEnv } from './env.mjs';
installEnv();
const { schwungLibAvailable } = await import('../dist/esm/renderer/schwung-lib.js');
assert(schwungLibAvailable(), 'This test requires the real Schwung controller');
const { createSchwungPage } = await import('../dist/esm/renderer/schwung-page.js');
const module = JSON.parse(readFileSync(process.env.HB_MODULE, 'utf8'));
const values = new Map(module.capabilities.chain_params.map(param => [param.key, param.default ?? param.options?.[0] ?? '0']));
const { uiStateDirty, clearUiDirty } = await import('../dist/esm/seq/set-save.js');
const writes = [];
const port = {
    track: { index: 0 },
    getParam(key) {
        const bare = key.split(':').at(-1);
        if (bare === 'ui_hierarchy') return JSON.stringify(module.capabilities.ui_hierarchy);
        if (bare === 'chain_params') return JSON.stringify(module.capabilities.chain_params);
        if (key === 'midi_fx1_module') return 'harmonybus';
        return values.get(bare) ?? '';
    },
    setParam(key, value) { writes.push([key, value]); values.set(key.split(':').at(-1), value); },
};
const page = createSchwungPage(port, 'midi_fx1');
for (let tick = 0; tick < 128; tick++) page.tick();
assert(page.ready);
const arpIndex = page.ctl.pages.findIndex(candidate => candidate.keys?.includes('arp_phase'));
assert(arpIndex >= 0);
page.goToPage(arpIndex);
for (let tick = 0; tick < 64; tick++) page.tick();
assert.equal(page.pageTitle, 'Arp / Strum');
const phaseSlot = page.ctl.page.keys.indexOf('arp_phase');
const gateSlot = page.ctl.page.keys.indexOf('arp_gate');
const writesBefore = writes.length;
page.knobTouch(phaseSlot, true);
assert.equal(page.ctl.describePage().header.right, 'Auto');
assert.equal(page.ctl.describePage().header.left, 'Arp Start');
const rectangles = [];
globalThis.fill_rect = (...args) => rectangles.push(args);
page.render('HB');
assert(rectangles.some(([x,y,width,height,color]) => x===0 && y===0 && width===128 && height>=7 && color===1), 'Touch must paint the highlighted header');
page.knobTouch(gateSlot, true);
assert.equal(page.ctl.describePage().header.left, 'Arp Gate');
page.knobTouch(gateSlot, false);
assert.equal(page.ctl.describePage().header.left, 'Arp Start');
page.knobTouch(phaseSlot, false);
assert.equal(page.ctl.describePage().header.inverted, false);
assert.equal(writes.length, writesBefore, 'Touch alone must never edit a parameter');
console.log('HB touch: real controller labels, current value, highlighted header, multiple fingers and no writes pass');

function focusKey(key) {
    const index = page.ctl.pages.findIndex(candidate => candidate.keys?.includes(key));
    assert(index >= 0, `${key} must have a knob`);
    page.goToPage(index);
    for (let tick = 0; tick < 64; tick++) page.tick();
    return page.ctl.page.keys.indexOf(key);
}
for (const key of ['mod_chrom_below', 'mod_scale_above', 'play_bypass']) {
    values.set(key, 'Off');
    const slot = focusKey(key);
    const before = writes.length;
    clearUiDirty();
    page.knobTouch(slot, true);
    assert(uiStateDirty(), 'Hosted parameter edits must be saved');
    assert.deepEqual(writes.at(-1), [`midi_fx1:${key}`, 'On']);
    page.knobTouch(slot, true);
    page.knobTurn(slot, 3);
    page.knobTurn(slot, -3);
    page.knobTouch(slot, false);
    assert.equal(writes.length, before + 2, `${key}: one On and one Off per touch`);
    assert.equal(values.get(key), 'Off', 'Release disables the modifier');
    page.knobTouch(slot, true);
    assert.deepEqual(writes.at(-1), [`midi_fx1:${key}`, 'On']);
    // Release follows the captured key even after navigating to another page.
    focusKey('arp_phase');
    page.knobTouch(slot, false);
    assert.deepEqual(writes.at(-1), [`midi_fx1:${key}`, 'Off']);
    const released = writes.length;
    page.knobTouch(slot, false);
    assert.equal(writes.length, released, 'Duplicate release is inert');
}
for (const [key, action] of [['approach_reset','Reset'],['approach_scale_next','Scale +'],['approach_chrom_next','Chrom -'],['next_reset','Reset'],['play_reset','Reset']]) {
    const slot = focusKey(key);
    assert(page.ctl.metaAt(slot).writeOnly, `${key} must resolve as an action button`);
    const before = writes.length;
    page.knobTouch(slot, true);
    assert.deepEqual(writes.at(-1), [`midi_fx1:${key}`, action]);
    page.knobTouch(slot, true);
    page.knobTurn(slot, 5);
    page.knobTouch(slot, false);
    assert.equal(writes.length, before + 1, `${key}: no duplicate action`);
    page.knobTouch(slot, true);
    page.knobTouch(slot, false);
    assert.equal(writes.length, before + 2, `${key}: next touch immediately re-arms`);
}
console.log('HB buttons: momentary modifiers, release after page change, every action, repeat-touch and turn deduplication pass');

assert.equal(page.ctl.pages.filter(candidate => candidate.keys?.includes('arp_phase')).length, 1);
assert.equal(module.capabilities.ui_hierarchy.levels.arp_player.knobs.length, 8);
assert(!module.capabilities.ui_hierarchy.levels.arp_player.knobs.includes('arp_clear'));

const { releasePerformanceTouch, performanceTouchActive } = await import('../dist/esm/renderer/schwung-page.js');
const performanceSlot = focusKey('mod_chrom_below');
page.knobTouch(performanceSlot, true);
assert(performanceTouchActive());
const originalGet = port.getParam;
port.getParam = () => { throw new Error('Parameter read delayed an owned release'); };
for (let tick = 0; tick < 20; tick++) page.tick();
releasePerformanceTouch(performanceSlot);
assert.deepEqual(writes.at(-1), ['midi_fx1:mod_chrom_below', 'Off']);
const afterRelease = writes.length;
releasePerformanceTouch(performanceSlot);
assert.equal(writes.length, afterRelease);
port.getParam = originalGet;
assert.equal(module.capabilities.ui_hierarchy.levels.follower_play.knobs.length, 8);
console.log('HB performance release: no polling during touch, direct captured release, no duplicate Off pass');

const padSlot = focusKey('pad_display');
assert.equal(page.pageTitle,'Pads Global');
assert.equal(page.ctl.page.keys.length,5);
values.set('pad_display','Standard');
for(let tick=0;tick<64;tick++)page.tick();
page.knobTouch(padSlot,true);
assert.equal(page.ctl.describePage().header.left,'Pad Colors');
page.knobTurn(padSlot,4);
page.knobTouch(padSlot,false);
assert.equal(values.get('pad_display'),'Current');
assert(uiStateDirty(),'Global pad edits participate in Set saving');
console.log('HB Pads Global: five controls, correct title, knob editing and saved-state dirty tracking pass');

// Lane selection must refresh both shared editors before the next encoder turn.
const realNow = Date.now;
Date.now = () => realNow() + 1000;
try {
    assert.equal(page.ctl.pages.filter(candidate => candidate.keys?.includes('motion_lane')).length, 2);
    const originalSetParam = port.setParam;
    const laneAmounts = ['3', '17', '-2', '0'];
    values.set('motion_lane', '1');
    values.set('motion_amount', laneAmounts[0]);
    port.setParam = (key, value) => {
        const bare = key.split(':').at(-1);
        if (bare === 'motion_amount') laneAmounts[Number(values.get('motion_lane')) - 1] = String(value);
        originalSetParam(key, value);
        if (bare === 'motion_lane') values.set('motion_amount', laneAmounts[Number(value) - 1]);
    };
    const laneSlot = focusKey('motion_operation');
    assert.equal(page.pageTitle, 'Operation');
    const selectedSlot = page.ctl.page.keys.indexOf('motion_lane');
    const amountSlot = page.ctl.page.keys.indexOf('motion_amount');
    page.knobTurn(selectedSlot, 1);
    assert.equal(values.get('motion_lane'), '2');
    page.knobTurn(amountSlot, 1);
    page.knobTouch(amountSlot, false);
    assert.equal(values.get('motion_amount'), '18', 'Immediate turn edits lane 2 from its own value');
    focusKey('motion_probability');
    assert.equal(page.pageTitle, 'Timing / Trigger');
    assert.equal(page.ctl.describePage().cells.find(cell => cell.key === 'motion_lane').raw, '2');
    const punchSlot = page.ctl.page.keys.indexOf('motion_punch');
    const before = writes.length;
    page.knobTouch(punchSlot, true);page.knobTurn(punchSlot, 1);page.knobTouch(punchSlot, false);
    assert.equal(writes.length, before, 'Knob touch does not activate an operation');
    port.setParam = originalSetParam;
} finally { Date.now = realNow; }
console.log('HB operations: exactly two pages, shared lane cursor, immediate value refresh and no knob-touch activation pass');

const { hbPerformanceStep, releaseHbPerformanceStep, paintHbPerformance, resetHbPerformance } = await import('../dist/esm/renderer/schwung-page.js');
const performanceKeys = ['motion_hold_1','motion_hold_2','motion_hold_3','motion_hold_4',
    'performance_below','performance_above','performance_enclose_ab','performance_enclose_ba'];
for (let step = 0; step < 8; step++) {
    const before = writes.length;
    assert(hbPerformanceStep([0x90,16+step,127],page));
    assert.deepEqual(writes.at(-1),['midi_fx1:'+performanceKeys[step],'On']);
    assert(hbPerformanceStep([0x90,16+step,127],page));
    assert.equal(writes.length,before+1,'Repeated downs do not retrigger');
    const originalGetParam = port.getParam;
    port.getParam = () => { throw new Error('Release must not read the current page or track'); };
    assert(releaseHbPerformanceStep([step%2?0x80:0x90,16+step,0]));
    assert.equal(writes.length,before+(step<6?2:1),'Only momentary buttons write Off');
    if(step<6)assert.deepEqual(writes.at(-1),['midi_fx1:'+performanceKeys[step],'Off']);
    assert(!releaseHbPerformanceStep([0x80,16+step,0]));
    port.getParam = originalGetParam;
}
// Different physical buttons can hold different tracks at the same time.
const otherWrites=[];
const otherOwner={performanceSet:(key,value)=>otherWrites.push([key,value]),performanceGet:()=> '0'};
hbPerformanceStep([0x90,16,127],page);
hbPerformanceStep([0x90,17,127],otherOwner);
releaseHbPerformanceStep([0x80,16,0]);
assert.deepEqual(writes.at(-1),['midi_fx1:motion_hold_1','Off']);
assert.deepEqual(otherWrites,[['motion_hold_2','On']]);
resetHbPerformance();
assert.deepEqual(otherWrites.slice(-2),[['motion_hold_2','Off'],['performance_reset','1']]);
assert.deepEqual(writes.at(-1),['midi_fx1:performance_reset','1']);
assert(!hbPerformanceStep([0x90,16,127],null),'Other views leave step input alone');
assert(hbPerformanceStep([0x90,31,127],page),'Unassigned performance steps cannot edit a clip');
let statusReads=0;
const ledOwner={performanceSet:()=>{},performanceGet:()=>{statusReads++;return '65';}};
const savedNow=Date.now;Date.now=()=>5000;
try {
    for(let frame=0;frame<100;frame++)assert(paintHbPerformance(ledOwner));
    assert.equal(statusReads,1,'Idle LED frames do not poll the DSP repeatedly');
    assert(!paintHbPerformance(null));
} finally {Date.now=savedNow;resetHbPerformance();}
console.log('HB step controls: six holds, two one-shot triggers, duplicate edges, captured releases, teardown and bounded LED polling pass');

const { setHbPerformanceMode, syncHbPerformanceMode } = await import('../dist/esm/renderer/schwung-page.js');
const { flagValue, resetFlags, loadPerSetFlags, perSetFlagsSnapshot } = await import('../dist/esm/seq/flags.js');
const { visibleFlags } = await import('../dist/esm/seq/flags-visible.js');
const { flagsPageState, flagsPageKnob } = await import('../dist/esm/seq/flags-page.js');
const { installMockFs, uninstallMockFs } = await import('./mock-fs.mjs');
installMockFs();
try {
    resetFlags();resetHbPerformance();
    assert.equal(flagValue('hbsteprow'),0,'Fresh installs retain normal step editing');
    const setting=visibleFlags(false).find(def=>def.key==='hbsteprow');
    assert(setting?.uiOnly&&!setting.perSet,'Step Row is a release-visible global UI preference');
    assert.deepEqual(setting.labels,['STEPS','PERFORM']);
    setHbPerformanceMode(1);
    assert(syncHbPerformanceMode());
    assert(!Object.hasOwn(perSetFlagsSnapshot(),'hbsteprow'),'The choice is not stored in a set');
    loadPerSetFlags({hbsteprow:0});assert.equal(flagValue('hbsteprow'),1);
    resetFlags();assert.equal(flagValue('hbsteprow'),1,'The global choice survives reopening');
    hbPerformanceStep([0x90,20,127],page);
    hbPerformanceStep([0x90,22,127],page);releaseHbPerformanceStep([0x80,22,0]);
    const before=writes.length;
    // Change it through the actual Settings encoder, not only the helper API.
    flagsPageState.selected=visibleFlags().findIndex(def=>def.key==='hbsteprow');
    for(let turn=0;turn<64;turn++)flagsPageKnob(0,-1);
    assert.equal(flagValue('hbsteprow'),0);
    assert(writes.slice(before).some(([key,value])=>key==='midi_fx1:performance_below'&&value==='Off'));
    assert(writes.slice(before).some(([key])=>key==='midi_fx1:performance_reset'),'Turning off cancels an armed enclosure');
    const cleared=writes.length;
    assert(releaseHbPerformanceStep([0x80,20,0]),'The old release cannot enter ordinary step editing');
    assert.equal(writes.length,cleared,'Mode change and button release cannot send duplicate Off');
    assert(!syncHbPerformanceMode());
} finally { resetHbPerformance();uninstallMockFs();resetFlags(); }
console.log('HB Step Row mode: global preference, release Settings control, persistence across sets and mode-change cleanup pass');
