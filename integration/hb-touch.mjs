import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installEnv } from './env.mjs';
installEnv();
const { schwungLibAvailable } = await import('../dist/esm/renderer/schwung-lib.js');
assert(schwungLibAvailable(), 'This test requires the real Schwung controller');
const { createSchwungPage } = await import('../dist/esm/renderer/schwung-page.js');
const module = JSON.parse(readFileSync(process.env.HB_MODULE, 'utf8'));
// Generated metadata is verified against the real DSP in the native suite.
const runtimeChainParams = JSON.stringify(module.capabilities.chain_params);
const values = new Map(module.capabilities.chain_params.map(param => [param.key, param.default ?? param.options?.[0] ?? '0']));
const { uiStateDirty, clearUiDirty } = await import('../dist/esm/seq/set-save.js');
const writes = [];
const port = {
    track: { index: 0 },
    getParam(key) {
        const bare = key.split(':').at(-1);
        if (bare === 'ui_hierarchy') return JSON.stringify(module.capabilities.ui_hierarchy);
        if (bare === 'chain_params') return JSON.stringify(module.capabilities.chain_params.map(parameter => {
            if (parameter.key === 'motion_offset' && values.get('motion_operation') === 'MIDI Echo') return {...parameter,name:'Decay %',min:0};
            if (['motion_from','motion_through'].includes(parameter.key)) return {...parameter,options:Array.from({length:Number(values.get('motion_every'))},(_,index)=>String(index+1))};
            return parameter;
        }));
        if (key === 'midi_fx1_module') return 'harmonybus';
        return values.get(bare) ?? '';
    },
    setParam(key, value) {
        writes.push([key, value]);const bare=key.split(':').at(-1);values.set(bare, value);
        if (bare === 'motion_every') {
            values.set('motion_from',String(Math.min(Number(values.get('motion_from')),Number(value))));
            values.set('motion_through',String(Math.min(Number(values.get('motion_through')),Number(value))));
        }
        if (bare === 'motion_from' && Number(value)>Number(values.get('motion_through'))) values.set('motion_through',String(value));
        if (bare === 'motion_through' && Number(value)<Number(values.get('motion_from'))) values.set('motion_from',String(value));
    },
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
for (const key of ['play_bypass']) {
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
const performanceSlot = focusKey('play_bypass');
page.knobTouch(performanceSlot, true);
assert(performanceTouchActive());
const originalGet = port.getParam;
port.getParam = () => { throw new Error('Parameter read delayed an owned release'); };
for (let tick = 0; tick < 20; tick++) page.tick();
releasePerformanceTouch(performanceSlot);
assert.deepEqual(writes.at(-1), ['midi_fx1:play_bypass', 'Off']);
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
    assert.equal(page.ctl.pages.filter(candidate => candidate.keys?.includes('motion_lane')).length, 3);
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
    const punchSlot = focusKey('motion_punch');
    const before = writes.length;
    page.knobTouch(punchSlot, true);page.knobTurn(punchSlot, 1);page.knobTouch(punchSlot, false);
    assert.equal(writes.length, before, 'Knob touch does not activate an operation');
    port.setParam = originalSetParam;
} finally { Date.now = realNow; }
console.log('HB operations: three shared pages, shared lane cursor, immediate value refresh and no knob-touch activation pass');

// Actual native peek: choices, current highlight, direction and dismissal.
for (const key of ['motion_lane', 'motion_operation', 'motion_pattern', 'motion_grid', 'motion_advance', 'motion_every']) {
    const slot = focusKey(key);
    page.knobTouch(slot, true);
    page.knobTurn(slot, 1);
    let peek = page.ctl.enumPeek();
    assert(peek, key + ': turning must open the Schwung option list');
    assert.equal(peek.key, key);
    assert.deepEqual(peek.options, page.ctl.metaAt(slot).options);
    assert.equal(peek.options[peek.index], page.ctl.state.values[key], 'Highlight follows edited value');
    const text = [];
    let clears = 0;
    page.ctl.renderOverlays({fillRect:()=>{},print:(_x,_y,label)=>text.push(label),textWidth:label=>label.length*6}, {clearScreen:()=>clears++});
    assert.equal(clears, 1, 'Native list replaces the grid while shown');
    assert(text.some(label => String(label).includes(peek.options[peek.index])), 'Selected choice is rendered as text');
    page.knobTurn(slot, -1);
    peek = page.ctl.enumPeek();
    assert.equal(peek.options[peek.index], page.ctl.state.values[key]);
    page.knobTouch(slot, false);
    assert.equal(page.ctl.enumPeek(), null, 'Release dismisses the list');
}
const operationSlot = focusKey('motion_operation');
page.knobTurn(operationSlot, 100);page.knobTouch(operationSlot, false);
assert.equal(values.get('motion_operation'), 'MIDI Echo');
assert.equal(page.ctl.metaAt(page.ctl.page.keys.indexOf('motion_offset')).name, 'Decay %');
page.knobTurn(operationSlot, -1);page.knobTouch(operationSlot, false);
assert.equal(values.get('motion_operation'), 'Ratchet');
assert.equal(page.ctl.metaAt(page.ctl.page.keys.indexOf('motion_offset')).name, 'Offset');
console.log('HB operation peek: lane, operation, pattern and grid show native lists with current highlights and release dismissal');


// Conditions are a third shared editor with bounded native lists and read-only feedback.
const everySlot=focusKey('motion_every');
assert.equal(page.pageTitle,'Conditions');
page.knobTurn(everySlot,100);page.knobTouch(everySlot,false);
assert.equal(values.get('motion_every'),'16');
page.knobTurn(everySlot,-8);page.knobTouch(everySlot,false);
assert.equal(values.get('motion_every'),'8');
const fromSlot=page.ctl.page.keys.indexOf('motion_from'),throughSlot=page.ctl.page.keys.indexOf('motion_through');
assert.equal(page.ctl.metaAt(fromSlot).options.length,8);
page.knobTurn(fromSlot,6);page.knobTouch(fromSlot,false);
assert.equal(values.get('motion_from'),'7');assert.equal(values.get('motion_through'),'7');
page.knobTurn(throughSlot,1);
assert.equal(page.ctl.enumPeek().options[page.ctl.enumPeek().index],'8');page.knobTouch(throughSlot,false);
page.knobTurn(everySlot,-4);page.knobTouch(everySlot,false);
assert.equal(values.get('motion_every'),'4');assert.equal(values.get('motion_from'),'4');assert.equal(values.get('motion_through'),'4');
assert.equal(page.ctl.metaAt(fromSlot).options.length,4);
page.knobTurn(fromSlot,1);
assert.equal(page.ctl.enumPeek().options[page.ctl.enumPeek().index],'4','Clamped value stays highlighted');page.knobTouch(fromSlot,false);
const statusSlot=page.ctl.page.keys.indexOf('motion_condition_status');
const beforeStatusTouch=writes.length;page.knobTouch(statusSlot,true);page.knobTurn(statusSlot,1);page.knobTouch(statusSlot,false);
assert.equal(writes.length,beforeStatusTouch,'Cycle readout is inert');
assert.equal(page.ctl.describePage().cells.find(cell=>cell.key==='motion_lane').raw,values.get('motion_lane'));
console.log('HB conditions: shared cursor, native range lists, clamped dependent values and read-only status pass');

const { hbPerformanceStep, releaseHbPerformanceStep, paintHbPerformance, resetHbPerformance } = await import('../dist/esm/renderer/schwung-page.js');
const performanceKeys = Array.from({length:16},(_,index)=>'motion_hold_'+(index+1));
for (let step = 0; step < 16; step++) {
    const before = writes.length;
    assert(hbPerformanceStep([0x90,16+step,127],page));
    assert.deepEqual(writes.at(-1),['midi_fx1:'+performanceKeys[step],'On']);
    assert(hbPerformanceStep([0x90,16+step,127],page));
    assert.equal(writes.length,before+1,'Repeated downs do not retrigger');
    const originalGetParam = port.getParam;
    port.getParam = () => { throw new Error('Release must not read the current page or track'); };
    assert(releaseHbPerformanceStep([step%2?0x80:0x90,16+step,0]));
    assert.equal(writes.length,before+2,'Every slot owns its release; enclosure DSP ignores Off');
    assert.deepEqual(writes.at(-1),['midi_fx1:'+performanceKeys[step],'Off']);
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
console.log('HB step controls: sixteen assignable holds/triggers, duplicate edges, captured releases, teardown and bounded LED polling pass');

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
    assert(writes.slice(before).some(([key,value])=>key==='midi_fx1:motion_hold_5'&&value==='Off'));
    assert(writes.slice(before).some(([key])=>key==='midi_fx1:performance_reset'),'Turning off cancels an armed enclosure');
    const cleared=writes.length;
    assert(releaseHbPerformanceStep([0x80,20,0]),'The old release cannot enter ordinary step editing');
    assert.equal(writes.length,cleared,'Mode change and button release cannot send duplicate Off');
    assert(!syncHbPerformanceMode());
} finally { resetHbPerformance();uninstallMockFs();resetFlags(); }
console.log('HB Step Row mode: global preference, release Settings control, persistence across sets and mode-change cleanup pass');

// Exercise discovery through the real registry, with no injected button owner.
const { appState, VIEW_KEYS, VIEW_KNOBS } = await import('../dist/esm/app/state.js');
const { seqState } = await import('../dist/esm/seq/state.js');
const { trackRef } = await import('../dist/esm/track/ref.js');
const { resetPorts } = await import('../dist/esm/track/registry.js');
const { schwungGridReload, schwungActiveFor } = await import('../dist/esm/renderer/schwung-grid.js');
const { hbPerformancePage, drawHbPerformanceMode } = await import('../dist/esm/renderer/schwung-page.js');
const { setFlag } = await import('../dist/esm/seq/flags.js');
const { stepPageState } = await import('../dist/esm/seq/step-page.js');
const savedHostGet = globalThis.shadow_get_param, savedHostSet = globalThis.shadow_set_param;
const savedEngineGet = globalThis.host_module_get_param, savedEngineSet = globalThis.host_module_set_param_blocking;
const routedWrites = [];
let available = true;
let discoveryReads = 0;
const readContract = key => { discoveryReads++; return available && !key.endsWith('chain_params') ? port.getParam(key) : ''; };
installMockFs();
try {
    resetFlags();setFlag('chtracks', 0);resetPorts();schwungGridReload();
    globalThis.shadow_get_param = (_slot, key) => readContract(key);
    globalThis.shadow_set_param = (slot, key, value) => { routedWrites.push([slot, key, value]); return true; };
    globalThis.host_module_get_param = key => readContract(key.replace(/^ch\d+:/, ''));
    globalThis.host_module_set_param_blocking = (key, value) => { routedWrites.push(['engine', key, value]); return true; };
    appState.shiftHeld = false;seqState.sessionMode = false;seqState.loopMode = false;
    seqState.trackSelectHold = false;stepPageState.selected = false;
    setHbPerformanceMode(1);
    for (const track of [0, 4]) {
        appState.activeTrack = trackRef(track);appState.currentView = VIEW_KEYS;
        const found = hbPerformancePage();
        assert(found, `Track ${track + 1}: hierarchy-only operations must enable Perform before opening HB`);
        assert.equal(found, schwungActiveFor(track, 'midi_fx1'));
        assert(!found.ctl.state.chainParams?.some(entry => entry.key === 'motion_lane'));
        assert(found.ctl.state.metaIndex.get('motion_lane'));
        const beforeReads = discoveryReads;
        for (let frame = 0; frame < 100; frame++) { assert.equal(hbPerformancePage(), found); drawHbPerformanceMode(); }
        assert.equal(discoveryReads, beforeReads, 'Detection and footer do not add per-frame host reads');
        appState.currentView = VIEW_KNOBS;
        appState.trackChainIndex[track] = 1; // Synth editor; target remains MIDI FX 1.
        assert.equal(hbPerformancePage(), found);
        assert(hbPerformanceStep([0x90, 20, 127]));
        const expectedAddress = track === 0 ? [0, 'midi_fx1:motion_hold_5'] : ['engine', 'ch4:midi_fx1:motion_hold_5'];
        assert.deepEqual(routedWrites.at(-1), [...expectedAddress, 'On']);
        appState.activeTrack = trackRef(7);
        assert(releaseHbPerformanceStep([0x80, 20, 0]));
        assert.deepEqual(routedWrites.at(-1), [...expectedAddress, 'Off']);
    }
    resetHbPerformance();available = false;schwungGridReload();
    assert.equal(hbPerformancePage(), null, 'A genuinely empty MIDI FX slot retains ordinary steps');
    assert(!hbPerformanceStep([0x90, 20, 127]));
} finally {
    resetHbPerformance();uninstallMockFs();resetFlags();resetPorts();schwungGridReload();
    globalThis.shadow_get_param = savedHostGet;globalThis.shadow_set_param = savedHostSet;
    globalThis.host_module_get_param = savedEngineGet;globalThis.host_module_set_param_blocking = savedEngineSet;
}
console.log('HB discovery: runtime DSP metadata, host and Movy tracks, cold/synth views, captured release and no per-frame reads pass');

// A clip gesture reaches the engine on the press, with no polling on release.
const engineWrites=[];
const beforeEngineSet=globalThis.host_module_set_param_blocking;
globalThis.host_module_set_param_blocking=(key,value)=>engineWrites.push([key,value]);
try {
    const clipOwner={performanceTrack:4,performanceSet:()=>{},performanceGet:()=> '15,-2,2'};
    hbPerformanceStep([0x90,27,127],clipOwner);
    assert.deepEqual(engineWrites.at(-1),['hbperform','4,11,1,15,-2,2']);
    clipOwner.performanceGet=()=>{throw new Error('release read binding');};
    releaseHbPerformanceStep([0x80,27,0]);
    assert.deepEqual(engineWrites.at(-1),['hbperform','4,11,0,0,0,0']);
    resetHbPerformance();
    assert.deepEqual(engineWrites.at(-1),['hbperform_reset','4']);
} finally {globalThis.host_module_set_param_blocking=beforeEngineSet;}
console.log('HB clip bridge: direct press, captured track/slot release without reads, teardown reset pass');

const { hbOperationColor }=await import('../dist/esm/renderer/schwung-page.js');
assert.equal(hbOperationColor(0,false),0);assert.equal(hbOperationColor(0,true),0);
for (const operation of [1,3,7,8,9,10,11,16,17,18]) {
    assert.equal(hbOperationColor(operation,false),85);
    assert.equal(hbOperationColor(operation,true),11);
}
for (const operation of [12,13,14,15]) {
    assert.equal(hbOperationColor(operation,false),97);
    assert.equal(hbOperationColor(operation,true),17);
}
console.log('HB step colors: Off unlit, live-compatible green, clip-only blue; activity preserves category hue');
const { ledFrameReset, seqLedsInvalidate }=await import('../dist/esm/seq/led-cache.js');
const savedLedSend=globalThis.move_midi_internal_send, colorNow=Date.now;
let rowTime=9000;
const colorWrites=[];
const rowOperations=[3,12,0,10,...new Array(12).fill(0)];
const colorOwner={performanceSet:()=>{},performanceGet:key=>key==='motion_row'?[8,...rowOperations].join(','):'12,1,2'};
globalThis.move_midi_internal_send=packet=>colorWrites.push(packet);Date.now=()=>rowTime;
try {
    resetHbPerformance();ledFrameReset();seqLedsInvalidate();paintHbPerformance(colorOwner);
    const sentColor=note=>colorWrites.filter(packet=>packet[2]===note).at(-1)?.[3];
    assert.equal(sentColor(16),85);assert.equal(sentColor(17),97);assert.equal(sentColor(18),0);assert.equal(sentColor(19),11);
    hbPerformanceStep([0x90,17,127],colorOwner);assert.equal(sentColor(17),17,'Press brightens blue without turning white');
    releaseHbPerformanceStep([0x80,17,0]);ledFrameReset();paintHbPerformance(colorOwner);assert.equal(sentColor(17),97);
    rowOperations[0]=15;rowTime+=100;ledFrameReset();paintHbPerformance(colorOwner);
    assert.equal(sentColor(16),97,'Editing an assignment updates its category without changing track');
} finally {resetHbPerformance();globalThis.move_midi_internal_send=savedLedSend;Date.now=colorNow;}
console.log('HB LED wire: assignment categories, trigger activity, immediate hold, release and live reassignment pass');

// A changing chord/second note must never leave mixed-age follower fields.
const snapshotGet = port.getParam;
let snapshotReads = 0;
let wireReads = 0;
let frame = 'fp1|G4|5th|b7|G4|--|--|--|--';
let snapshotNow = Date.now() + 10000;
const snapshotClock = Date.now;
Date.now = () => snapshotNow;
port.getParam = (key) => {
    wireReads++;
    if (key.endsWith(':follower_snapshot')) { snapshotReads++; return frame; }
    return snapshotGet(key);
};
focusKey('fpath_0_0_0');
assert.equal(page.ctl.state.values.fpath_0_0_1, '5th');
const readsBeforeFrames = snapshotReads;
const writesBeforeFrames = writes.length;
for (let index = 0; index < 20; index++) {
    frame = index % 2 ? 'fp1|G4|5th|Root|A4|--|--|--|--' : 'fp1|C4|Root|3rd|E4|G4|5th|b7|G4';
    snapshotNow += 40;
    page.tick();
    const expected = frame.split('|').slice(1);
    assert.deepEqual(page.ctl.page.keys.map(key => page.ctl.state.values[key]), expected);
}
assert.equal(snapshotReads - readsBeforeFrames, 20, 'One snapshot read per refresh');
const beforeFastTicks = snapshotReads;
for(let index=0;index<20;index++)page.tick();
assert.equal(snapshotReads,beforeFastTicks,'Bound snapshot requests to 25 Hz');
assert.equal(writes.length,writesBeforeFrames,'Refreshing diagnostics never writes musical parameters');
frame = '';
snapshotNow += 40;page.tick();
assert.equal(page.ctl.state.values.fpath_0_0_1, '5th','An unavailable snapshot retains the last coherent frame');
Date.now = snapshotClock;
port.getParam = snapshotGet;
console.log('Follower snapshots: coherent changing rows, fixed Explicit-C fifth, bounded reads and no writes pass');

const harmonyGet = port.getParam;
let harmonyFrame = 'hp1|C E G|C|Am|Bm';
let harmonyReads = 0;
let harmonyNow = Date.now() + 20000;
const harmonyClock = Date.now;
Date.now = () => harmonyNow;
port.getParam = (key) => {
    if(key.endsWith(':harmony_snapshot')){harmonyReads++;return harmonyFrame;}
    return harmonyGet(key);
};
focusKey('hpath_0');
assert.equal(page.pageTitle,'Harmony Flow');
assert.deepEqual(page.ctl.page.keys.map(key=>page.ctl.state.values[key]),['C E G','C','Am','Bm']);
harmonyFrame='hp1|F A C|F|G7|A7';harmonyNow+=40;page.tick();
assert.deepEqual(page.ctl.page.keys.map(key=>page.ctl.state.values[key]),['F A C','F','G7','A7']);
assert.equal(harmonyReads,2);
focusKey('fpath_0_0_0');focusKey('hpath_0');
assert.equal(harmonyReads,3,'Changing analysis pages refreshes the new snapshot immediately');
Date.now=harmonyClock;port.getParam=harmonyGet;
console.log('Harmony Flow: ordered stages, atomic updates and analysis-page switching pass');
