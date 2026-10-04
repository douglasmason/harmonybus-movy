import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installEnv } from './env.mjs';
installEnv();
const { schwungLibAvailable } = await import('../dist/esm/renderer/schwung-lib.js');
assert(schwungLibAvailable(), 'This test requires the real Schwung controller');
const { createSchwungPage } = await import('../dist/esm/renderer/schwung-page.js');
const module = JSON.parse(readFileSync(process.env.HB_MODULE, 'utf8'));
assert(module.capabilities.chain_params.find(parameter => parameter.key === 'motion_operation').options.includes('Auto Chord Repeat'));
// Generated metadata is verified against the real DSP in the native suite.
const runtimeChainParams = JSON.stringify(module.capabilities.chain_params);
const values = new Map(module.capabilities.chain_params.map(param => [param.key, param.default ?? param.options?.[0] ?? '0']));
const { uiStateDirty, clearUiDirty } = await import('../dist/esm/seq/set-save.js');
const touchOperationLabels = new Map([[5,'Next Harmony'],[6,'Next Harmony']]);
const writes = [];
const editorReads = [];
const operationMetadata = () => module.capabilities.chain_params.map(parameter => {
            if(parameter.key.startsWith('defaults_control_')){
                const editor=String(values.get('defaults_editor'));
                const fields=editor.endsWith('Scales')?['gap_scale','scale_context','dominant_scale','dominant_minor_scale','borrowed_scale','local_palette','scope']:['chord_quality','chord_inversion','chord_voicing','strum_spread','chromatic_quality','scope','scope'];
                const field=fields[Number(parameter.key.split('_').at(-1))-1];
                const key=field==='scope'?'defaults_scope':(editor.startsWith('Follower')?'follower':'conductor')+'_default_'+field;
                return {...module.capabilities.chain_params.find(candidate=>candidate.key===key),key:parameter.key};
            }
            if(parameter.key==='chord_edit_target'&&values.get('motion_operation')==='Chord/Arp State')return {...parameter,options:['Track Settings','Lane 1']};
            if (parameter.key === 'motion_amount' && values.get('motion_operation') === 'Chord Form') return {...parameter,name:'Form',type:'enum',options:module.capabilities.chain_params.find(p=>p.key==='chord_form').options.filter(option=>option!=='Follow Role'),options_as_string:true};
            if (parameter.key === 'motion_offset' && values.get('motion_operation') === 'MIDI Echo') return {...parameter,name:'Decay %',min:0};
            if (['motion_from','motion_through'].includes(parameter.key)) return {...parameter,options:Array.from({length:Number(values.get('motion_every'))},(_,index)=>String(index+1))};
            return parameter;
        });
const port = {
    track: { index: 0 },
    getParam(key) {
        editorReads.push(key);
        const bare = key.split(':').at(-1);
        if (bare === 'motion_editor') return JSON.stringify({params:operationMetadata(),values:Object.fromEntries(values)});
        if (bare === 'follow_touch_labels') return Array.from({length:10},(_,index)=>{const lane=index===9?6:Number(values.get('follow_touch_'+(index+1)));return lane+':'+(touchOperationLabels.get(lane)||'Velocity');}).join('|');
        if (bare === 'ui_hierarchy') return JSON.stringify(module.capabilities.ui_hierarchy);
        if (bare === 'chain_params') return JSON.stringify(operationMetadata());
        if (key === 'midi_fx1_module') return 'harmonybus';
        return values.get(bare) ?? '';
    },
    setParam(key, value) {
        writes.push([key, value]);const bare=key.split(':').at(-1);values.set(bare, value);
        if(bare==='defaults_editor')for(const parameter of operationMetadata().filter(parameter=>parameter.key.startsWith('defaults_control_')))values.set(parameter.key,parameter.default??parameter.options?.[0]??'All followers');
        if(bare==='motif_edit'&&values.get('motion_operation')==='Chord/Arp State')values.set('chord_edit_target','Lane 1');
        if (bare === 'motion_operation' && value === 'Chord Form') values.set('motion_amount','Seventh');
        if (bare === 'motion_every') {
            values.set('motion_from',String(Math.min(Number(values.get('motion_from')),Number(value))));
            values.set('motion_through',String(Math.min(Number(values.get('motion_through')),Number(value))));
        }
        if (bare === 'motion_from' && Number(value)>Number(values.get('motion_through'))) values.set('motion_through',String(value));
        if (bare === 'motion_through' && Number(value)<Number(values.get('motion_from'))) values.set('motion_from',String(value));
    },
};
const { setFlag: setInitialMode } = await import('../dist/esm/seq/flags.js');
setInitialMode('hbsteprow',0);
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
assert.equal(page.ctl.describePage().header.right, 'First Note Free');
assert.equal(page.ctl.describePage().header.left, 'Start Timing');
const rectangles = [];
globalThis.fill_rect = (...args) => rectangles.push(args);
page.render('HB');
assert(rectangles.some(([x,y,width,height,color]) => x===0 && y===0 && width===128 && height>=7 && color===1), 'Touch must paint the highlighted header');
page.knobTouch(gateSlot, true);
assert.equal(page.ctl.describePage().header.left, 'Arp Gate');
page.knobTouch(gateSlot, false);
assert.equal(page.ctl.describePage().header.left, 'Start Timing');
page.knobTouch(phaseSlot, false);
assert.equal(page.ctl.describePage().header.inverted, false);
assert.equal(writes.length, writesBefore, 'Touch alone must never edit a parameter');
console.log('HB touch: real controller labels, current value, highlighted header, multiple fingers and no writes pass');

function focusKey(key) {
    if(key.startsWith('motion_')){setInitialMode('hbsteprow',/^motion_control_(17|19|20|21|22|29|30|31|32|35|36|37)$/.test(key)?2:1);page.reload();}
    let index = page.ctl.pages.findIndex(candidate => candidate.keys?.includes(key));
    for(const mode of [0,1,2])if(index<0){setInitialMode('hbsteprow',mode);page.reload();index=page.ctl.pages.findIndex(candidate=>candidate.keys?.includes(key));}
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
for (const [key, action] of [['arp_clear','Clear'],['play_reset','Reset']]) {
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
assert(module.capabilities.ui_hierarchy.levels.arp_player.knobs.includes('arp_start'));
assert(module.capabilities.ui_hierarchy.levels.arp_player.knobs.includes('arp_clear'));
assert(!module.capabilities.ui_hierarchy.levels.follower_play_tools.knobs.includes('arp_clear'));
assert(module.capabilities.ui_hierarchy.levels.chord_player.knobs.includes('strum_spread'));
assert.equal(module.capabilities.ui_hierarchy.levels.chord_player.knobs.length,6);

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
assert.equal(module.capabilities.ui_hierarchy.levels.follower_play.knobs.length, 7);
console.log('HB performance release: no polling during touch, direct captured release, no duplicate Off pass');

assert(!page.ctl.pages.some(candidate=>candidate.keys?.includes('pad_display')),'Movy owns Pad Colors under Shift + Step 9');
assert.equal(module.capabilities.ui_hierarchy.levels.pad_display.knobs.length,8,'Standalone HB retains Pad Colors');
assert.equal(values.get('pad_play_color'),'Green');
assert.equal(values.get('pad_pulse_shape'),'None');
console.log('Pad Colors ownership: hosted duplicate removed; standalone metadata retained; Set-page editing covered by hb-pad-settings');

setInitialMode('hbsteprow',1);page.reload();
// Lane selection must refresh both shared editors before the next encoder turn.
const realNow = Date.now;
Date.now = () => realNow() + 1000;
try {
    assert.equal(page.ctl.pages.filter(candidate => candidate.keys?.includes('motion_lane')).length, 3);
    const originalSetParam = port.setParam;
    const laneAmounts = ['3', '17', '-2', '0'];
    values.set('motion_lane', 'Step Seq 1: Off');
    values.set('motion_amount', laneAmounts[0]);
    port.setParam = (key, value) => {
        const bare = key.split(':').at(-1);
        if (bare === 'motion_amount') laneAmounts[Number(String(values.get('motion_lane')).match(/Step Seq (\d+)/)[1]) - 1] = String(value);
        originalSetParam(key, value);
        if (bare === 'motion_lane') values.set('motion_amount', laneAmounts[Number(String(value).match(/Step Seq (\d+)/)[1]) - 1]);
    };
    const laneSlot = focusKey('motion_operation');
    assert.equal(page.pageTitle, 'Operation');
    const selectedSlot = page.ctl.page.keys.indexOf('motion_lane');
    const amountSlot = page.ctl.page.keys.indexOf('motion_amount');
    editorReads.length=0;
    page.knobTurn(selectedSlot, 1);
    assert.deepEqual(editorReads,['midi_fx1:motion_editor'],'Lane edit uses exactly one host read');
    assert.equal(values.get('motion_lane'), 'Step Seq 2: Off');
    page.knobTurn(amountSlot, 1);
    page.knobTouch(amountSlot, false);
    assert.equal(values.get('motion_amount'), '18', 'Immediate turn edits lane 2 from its own value');
    focusKey('motion_probability');
    assert.equal(page.pageTitle, 'Timing / Trigger');
    assert.equal(page.ctl.describePage().cells.find(cell => cell.key === 'motion_lane').raw, 'Step Seq 2: Off');
    const punchSlot = focusKey('hb_step_row');
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
    editorReads.length=0;
    page.knobTurn(slot, 1);
    if (['motion_lane','motion_operation','motion_every'].includes(key))
        assert.deepEqual(editorReads,['midi_fx1:motion_editor'],key + ': one host read per turn');
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
    const heldClock = Date.now;
    let elapsed = 0;
    Date.now = () => heldClock() + elapsed;
    try {
        for (let frame = 0; frame < 80; frame++) {
            elapsed += 50;
            page.knobTouch(slot, true); // duplicate hardware touch while held
            page.tick();
            assert(page.ctl.enumPeek(), 'Held peek survives several expiry periods');
            assert.equal(page.ctl.state.touched, slot);
        }
    } finally { Date.now = heldClock; }
    page.knobTurn(slot, -1);
    peek = page.ctl.enumPeek();
    assert.equal(peek.options[peek.index], page.ctl.state.values[key]);
    page.knobTouch(slot, false);
    assert.equal(page.ctl.enumPeek(), null, 'Release dismisses the list');
}
const operationSlot = focusKey('motion_operation');
page.knobTurn(operationSlot, 100);page.knobTouch(operationSlot, false);
for (const operation of ['Secondary VI (Dom)','Secondary IV (Dom)','Secondary II (Dom)','Secondary Fifth','Override Harmony (Live + Recorded)','Live Harmony Override','Parallel Scale','Key Center','Upper Dim','Leading Tone','Chord/Arp State','Play Motif','Secondary VII','Secondary IV','Secondary III','Tritone Sub','Tritone II','Connector Above']) {
    assert.equal(values.get('motion_operation'), operation);
    page.knobTurn(operationSlot,-1);page.knobTouch(operationSlot,false);
}
assert.equal(values.get('motion_operation'), 'Backdoor V');
page.knobTurn(operationSlot,-1);page.knobTouch(operationSlot,false);
assert.equal(values.get('motion_operation'), 'Backdoor II');
page.knobTurn(operationSlot,-1);page.knobTouch(operationSlot,false);
assert.equal(values.get('motion_operation'), 'Secondary VI');
page.knobTurn(operationSlot,-1);page.knobTouch(operationSlot,false);
assert.equal(values.get('motion_operation'), 'Secondary V');
page.knobTurn(operationSlot,-1);page.knobTouch(operationSlot,false);
assert.equal(values.get('motion_operation'), 'Secondary II');
page.knobTurn(operationSlot,-2);page.knobTouch(operationSlot,false);
assert.equal(values.get('motion_operation'), 'Chord Form');
const formSlot=page.ctl.page.keys.indexOf('motion_amount');
assert.equal(page.ctl.metaAt(formSlot).name,'Form');
assert.equal(page.ctl.metaAt(formSlot).type,'enum');
page.knobTurn(formSlot,100);page.knobTurn(formSlot,100);page.knobTouch(formSlot,false);
assert.equal(values.get('motion_amount'),'Root + Seventh');
page.knobTurn(operationSlot,-1);page.knobTouch(operationSlot,false);
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
    assert.equal(statusReads,2,'One capability probe and cached fallback: idle LED frames do not poll the DSP repeatedly');
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
    assert.deepEqual(setting.labels,['STEPS','PERFORM 1','PERFORM 2']);
    setHbPerformanceMode(1);
    assert(syncHbPerformanceMode());
    assert(!Object.hasOwn(perSetFlagsSnapshot(),'hbsteprow'),'The choice is not stored in a set');
    loadPerSetFlags({hbsteprow:2});assert.equal(flagValue('hbsteprow'),0,'Project load returns to Steps');
    resetFlags();assert.equal(flagValue('hbsteprow'),0,'Reopening always starts in Steps');
    setHbPerformanceMode(1);
    hbPerformanceStep([0x90,20,127],page);
    hbPerformanceStep([0x90,22,127],page);releaseHbPerformanceStep([0x80,22,0]);
    const before=writes.length;
    // Change it through the actual Settings encoder, not only the helper API.
    flagsPageState.selected=visibleFlags().findIndex(def=>def.key==='hbsteprow');
    for(let turn=0;turn<64;turn++)flagsPageKnob(0,-1);
    assert.equal(flagValue('hbsteprow'),0);
    assert(writes.slice(before).some(([key,value])=>key==='midi_fx1:motion_hold_5'&&value==='Off'));
    assert(!writes.slice(before).some(([key])=>key==='midi_fx1:performance_reset'),'Navigation preserves armed and latched musical state');
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
    assert.equal(hbOperationColor(operation,false),124);
    assert.equal(hbOperationColor(operation,true),120);
}
for (const operation of [12,13,14,15]) {
    assert.equal(hbOperationColor(operation,false),124);
    assert.equal(hbOperationColor(operation,true),120);
}
console.log('HB step colors: Off unlit, active white, dim white pulse base');
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
    assert.equal(sentColor(16),124);assert.equal(sentColor(17),124);assert.equal(sentColor(18),0);assert.equal(sentColor(19),120);
    hbPerformanceStep([0x90,17,127],colorOwner);assert.equal(sentColor(17),120,'Press lights solid white');
    releaseHbPerformanceStep([0x80,17,0]);ledFrameReset();paintHbPerformance(colorOwner);assert.equal(sentColor(17),124);
    rowOperations[0]=15;rowTime+=100;ledFrameReset();paintHbPerformance(colorOwner);
    assert.equal(sentColor(16),124,'Editing an assignment retains the common operation-state colors');
} finally {resetHbPerformance();globalThis.move_midi_internal_send=savedLedSend;Date.now=colorNow;}
console.log('HB LED wire: white trigger activity, immediate hold, release and live reassignment pass');

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
assert.equal(page.pageTitle,'Diagnostics');
assert.deepEqual(page.ctl.page.keys.filter(key=>key.startsWith('hpath_')).map(key=>page.ctl.state.values[key]),['C E G','C','Am','Bm']);
harmonyFrame='hp1|F A C|F|G7|A7';harmonyNow+=40;page.tick();
assert.deepEqual(page.ctl.page.keys.filter(key=>key.startsWith('hpath_')).map(key=>page.ctl.state.values[key]),['F A C','F','G7','A7']);
assert.equal(harmonyReads,2);
focusKey('fpath_0_0_0');focusKey('hpath_0');
assert.equal(harmonyReads,3,'Changing analysis pages refreshes the new snapshot immediately');
Date.now=harmonyClock;port.getParam=harmonyGet;
console.log('Harmony Flow: ordered stages, atomic updates and analysis-page switching pass');

// Charge 100 ms per device read: a touch frame must use cached values only.
focusKey('arp_hold');
const slowGet=port.getParam, slowClock=Date.now;
let slowNow=slowClock(), slowReads=0, contractReads=0;
Date.now=()=>slowNow;
port.getParam=key=>{slowReads++;slowNow+=100;if(/:(ui_hierarchy|chain_params)$/.test(key))contractReads++;return slowGet(key);};
try {
    const slot=page.ctl.page.keys.indexOf('arp_hold');
    page.knobTouch(slot,true);page.tick();
    assert.equal(slowReads,0,'Touch and its first paint do not wait for device reads');
    assert.equal(page.ctl.describePage().header.left,'Hold');
    page.knobTouch(slot,false);page.tick();
    assert.equal(slowReads,0,'Release and its first paint also avoid reads');
    for(let index=0;index<8;index++){slowNow+=40;page.tick();}
    assert.equal(contractReads,0,'Steady HarmonyBus page does not reload large contracts');
} finally {port.getParam=slowGet;Date.now=slowClock;}
// Failed first snapshots must not start an individual-cell polling sweep.
focusKey('arp_hold');
const failedGet=port.getParam, failedClock=Date.now;
let failedNow=failedClock();Date.now=()=>failedNow;
let individualReads=0;
port.getParam=key=>{
    if(key.endsWith(':follower_snapshot'))return null;
    if(/:fpath_0_/.test(key)){individualReads++;return 'STALE';}
    return failedGet(key);
};
try {
    focusKey('fpath_0_0_0');
    for(let index=0;index<96;index++){failedNow+=50;page.tick();}
    assert.equal(individualReads,0,'No partial row reads while snapshot is unavailable');
} finally {port.getParam=failedGet;Date.now=failedClock;}
console.log('Slow host: cached touch frames, no repeated contracts, no partial diagnostic fallback');

// Timed knob gestures preserve press order and the original owner on release.
const gestureClock=Date.now;let gestureNow=100000;Date.now=()=>gestureNow;
try {
    for(const [key,wire] of [['motion_control_15','motion_gesture_15'],['motion_control_16','motion_gesture_16']]){
        const slot=focusKey(key);const before=writes.length;
        page.knobTouch(slot,true);page.knobTouch(slot,true);
        assert.deepEqual(writes.at(-1),['midi_fx1:'+wire,'Touch']);
        gestureNow+=100;page.knobTouch(slot,false);
        assert.deepEqual(writes.at(-1),['midi_fx1:'+wire,'Up,100']);
        assert.equal(writes.length,before+2,'Duplicate touch must not create another gesture');
        page.knobTouch(slot,true);gestureNow+=350;focusKey('arp_phase');
        releasePerformanceTouch(slot);
        assert.deepEqual(writes.at(-1),['midi_fx1:'+wire,'Up,350'],'Release uses captured control after page change');
    }
    const {cancelPerformanceTouches}=await import('../dist/esm/renderer/schwung-page.js');
    const slot=focusKey('motion_control_15');page.knobTouch(slot,true);cancelPerformanceTouches();
    assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_15','Cancel'],'Teardown must never become a short tap');
} finally {Date.now=gestureClock;}
console.log('Timed knob gestures: short/long duration, duplicate press, captured release and cancellation pass');
const stepClock=Date.now;let stepNow=200000;Date.now=()=>stepNow;
const gestureWrites=[];let gestureReads=0;
const gestureOwner={performanceTrack:2,
    performanceGet(key){gestureReads++;return key.startsWith('motion_gesture_binding_')?'8,1,3,2,250,0':'';},
    performanceSet(key,value){gestureWrites.push([key,value]);},
};
try {
    resetHbPerformance();hbPerformanceStep([0x90,16,127],gestureOwner);
    assert.deepEqual(gestureWrites.at(-1),['motion_gesture_1','Down']);
    const reads=gestureReads;stepNow+=80;releaseHbPerformanceStep([0x80,16,0]);
    assert.deepEqual(gestureWrites.at(-1),['motion_gesture_1','Up,80']);
    assert.equal(gestureReads,reads,'Step release performs no host reads');
    hbPerformanceStep([0x90,16,127],gestureOwner);stepNow+=400;
    releaseHbPerformanceStep([0x90,16,0]);assert.deepEqual(gestureWrites.at(-1),['motion_gesture_1','Up,400']);
    hbPerformanceStep([0x90,16,127],gestureOwner);resetHbPerformance();
    assert(gestureWrites.some(([key,value])=>key==='motion_gesture_1'&&value==='Cancel'),'Teardown cancels pending step taps');
} finally {Date.now=stepClock;resetHbPerformance();}
console.log('Timed steps: captured owner, duration, read-free release and teardown cancellation pass');

// Release dispatch owns the event: no generic model or parameter reads afterward.
await import('../dist/esm/app/globals.js');
const {onMidiMessageInternal}=globalThis;
const releaseClock=Date.now;let releaseNow=500000;Date.now=()=>releaseNow;
try {
    const slot=focusKey('motion_control_16');
    page.knobTouch(slot,true);releaseNow+=300;
    const savedGet=port.getParam;
    port.getParam=()=>{throw new Error('Release must not query any parameters');};
    onMidiMessageInternal([0x80,slot,64]);
    port.getParam=savedGet;
    assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_16','Up,300']);
    assert.equal(page.ctl.state.touched,-1);
    assert.equal(page.ctl.state.triggerFiredAt.motion_control_16.at(-1),releaseNow);
    const count=writes.length;
    onMidiMessageInternal([0x80,slot,0]);
    assert.equal(writes.length,count,'Second release cannot refire the trigger');
    page.knobTouch(slot,true);releaseNow+=350;
    const burst=page.ctl.state.triggerFiredAt.motion_control_16.at(-1);
    onMidiMessageInternal([0x90,slot,0]);
    assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_16','Up,350']);
    assert.equal(page.ctl.state.triggerFiredAt.motion_control_16.at(-1),burst,'Momentary release does not flash a trigger');
} finally {Date.now=releaseClock;}
console.log('Release priority: both MIDI forms, read-free dispatch, immediate touch clear, short-tap native animation and hold boundary pass');

// Rapid gesture edges are coalesced at 20 Hz, including release/cancel.
const { refreshHarmonyPads, harmonyPadColor } = await import('../dist/esm/seq/pads.js');
const { portFor: previewPortFor } = await import('../dist/esm/track/registry.js');
const previewPort = previewPortFor(4), oldPreviewGet = previewPort.getParam;
const previewClock = Date.now; let previewNow = 900000, previewReads = 0, previewMask = 1;
Date.now = () => previewNow;
previewPort.getParam = () => { previewReads++; return `${previewMask},${previewMask},2741,0,0,2,0,3,0,0|colors2,0|input1,0,1,1,2741,${previewMask}`; };
try {
    refreshHarmonyPads(4,previewNow);
    const baseline = harmonyPadColor(60,4), slot=focusKey('motion_control_16');
    for(let edge=1;edge<50;edge++){
        previewNow++;page.knobTouch(slot,!!(edge%2));previewMask=16;
        refreshHarmonyPads(4,previewNow);
    }
    assert.equal(previewReads,1,'49 rapid gesture edges cannot bypass the snapshot budget');
    refreshHarmonyPads(4,++previewNow);
    assert.equal(previewReads,2);assert.notEqual(harmonyPadColor(60,4),baseline);
    page.knobTouch(slot,false);previewMask=1;refreshHarmonyPads(4,++previewNow);
    assert.equal(previewReads,2,'Release also respects the budget');
    previewNow+=50;refreshHarmonyPads(4,previewNow);
    assert.equal(previewReads,3);assert.equal(harmonyPadColor(60,4),baseline,'Latest release state is painted within 50 ms');
    page.knobTouch(slot,true);releasePerformanceTouch(slot,true);refreshHarmonyPads(4,++previewNow);
    assert.equal(previewReads,3,'Cancel cannot create an extra read');
} finally { previewPort.getParam=oldPreviewGet;Date.now=previewClock; }
console.log('Modifier previews: burst coalescing, latest release state and bounded host reads pass');

// Both real MIDI release encodings must clear the original page immediately.
const padClock=Date.now;let padNow=1200000;Date.now=()=>padNow;
try {
    for(const key of ['pad_chord_form','pad_next_chord_form','pad_next_pulse','pad_adjacent_shading']) {
        for(const status of [0x80,0x90]) {
            padNow+=200;
            const slot=focusKey(key);
            const previous=String(values.get(key));
            page.knobTouch(slot,true);
            assert.equal(page.ctl.state.touched,slot);
            assert(page.needsTouchPaint);
            page.tick();
            assert(!page.needsTouchPaint,'First cached frame is consumed even during a captured hold');
            const writeStart=writes.length;
            const options=page.ctl.metaAt(slot).options;
            const direction=options.indexOf(previous)===options.length-1?-1:1;
            page.knobTurn(slot,direction*4);
            const expected=String(page.ctl.state.values[key]);
            assert.notEqual(expected,previous,`${key}: captured touch must still allow turns`);
            const getBefore=port.getParam;
            port.getParam=()=>{throw new Error('Pad release must not read the device');};
            try {
                padNow+=5;
                onMidiMessageInternal([status,slot,status===0x80?64:0]);
                assert.equal(page.ctl.state.touched,-1,`${key}: ${status.toString(16)} release`);
                assert.equal(page.ctl.state.peek,null);
                assert(page.needsTouchPaint);
                page.tick();page.render('HB');
            } finally {port.getParam=getBefore;}
            assert(writes.slice(writeStart).some(([parameter])=>parameter==='midi_fx1:'+key),'Final value is written');
            assert.equal(String(values.get(key)),expected,'Release flushes the final encoder value');
        }
    }
    padNow+=200;
    const first=focusKey('pad_chord_form');
    const second=page.ctl.page.keys.indexOf('pad_next_chord_form');
    page.knobTouch(first,true);page.knobTouch(second,true);
    onMidiMessageInternal([0x80,second,64]);
    assert.equal(page.ctl.state.touched,first,'Another held knob retains its label');
    focusKey('arp_gate');
    onMidiMessageInternal([0x80,first,64]);
    padNow+=200;
    assert(!performanceTouchActive(),'Changing panels cannot strand a captured pad-control touch');
} finally {Date.now=padClock;}
console.log('Pad controls: all eight knobs, both release encodings, cached feedback, live turns, final writes and page changes pass');

// Fixed controls span two step banks and independent named controls.
const followClock=Date.now;let followNow=1500000;Date.now=()=>followNow;
try {
    for(const lane of [1,8,9,16,17,19,20,21,22,29,30,31,32,33,35,36,37]) {
        const slot=focusKey('motion_control_'+lane);
        values.set('motion_gesture_binding_'+lane,'1,1,3,0,350,0');
        const start=writes.length;
        page.knobTouch(slot,true);
        assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_'+lane,'Touch']);
        const get=port.getParam;port.getParam=()=>{throw Error('Touch release must be read-free');};
        try {followNow+=100;onMidiMessageInternal([lane%2?0x90:0x80,slot,0]);} finally {port.getParam=get;}
        assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_'+lane,'Up,100']);
        assert.equal(writes.length,start+2);followNow+=500;
    }
    const slot=focusKey('motion_control_1');values.set('motion_control_1','10');page.ctl.revalue();
    page.knobTouch(slot,true);page.knobTurn(slot,2);page.knobTouch(slot,false);
    assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_1','LatchOn']);
    assert.equal(Number(values.get('motion_control_1')),10,'Turning keeps the fixed lane and amount');
    page.knobTurn(slot,-1);assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_1','LatchOff']);
    followNow+=500;page.knobTouch(slot,true);
    assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_1','Touch']);
    const before=writes.length;hbPerformanceStep([0x90,16,100],page);
    assert.equal(writes.length,before,'Knob and step share one native owner');
    onMidiMessageInternal([0x80,slot,0]);assert.equal(writes.length,before);
    followNow+=400;releaseHbPerformanceStep([0x80,16,0]);
    assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_1','Up,400']);
    const mapSlot=focusKey('motion_control_33');assert.equal(page.pageTitle,'Foll Map');
    page.knobTouch(mapSlot,true);assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_33','Touch']);page.knobTouch(mapSlot,false);
} finally {Date.now=followClock;}
console.log('Named controls: two step banks, Approach Harmony, cadence/chord/harmony controls, latch turns and shared step ownership pass');

const autoOffSlot=focusKey('motion_auto_off');
assert.equal(page.pageTitle,'Conditions');
assert.equal(page.ctl.page.keys.length,8);
assert(page.ctl.pages.some(p=>p.keys?.includes('motion_cycle')),'Cycle remains available on Timing');
assert.equal(module.capabilities.ui_hierarchy.levels.motion_conditions.knobs[4],'motion_auto_off');
assert.equal(module.capabilities.ui_hierarchy.levels.follower_source.knobs.length,6);
console.log('Auto Off: existing eight-knob Conditions panel, Cycle retained on Timing, no overflow panel');

// Exercise the real app tick, not just page.tick(): a release frame must reach
// the display before engine/status/step-row reads can block the UI thread.
{
    const { tick } = await import('../dist/esm/app/tick.js');
    const { createModel } = await import('../dist/esm/model/index.js');
    const { installMockEngine } = await import('./mock-engine.mjs');
    const { seqEngineTick, resetSeqEngine } = await import('../dist/esm/seq/engine.js');
    const { sessionTick, sessionReady, resetSetSession } = await import('../dist/esm/seq/set-session.js');
    const { VIEW_CHAIN, VIEW_KNOBS } = await import('../dist/esm/app/state.js');
    const { portFor } = await import('../dist/esm/track/registry.js');
    const { schwungPageFor } = await import('../dist/esm/renderer/schwung-grid.js');
    const { trackRef } = await import('../dist/esm/track/ref.js');
    const { resetSeqState } = await import('../dist/esm/seq/state.js');
    const { resetSetSave } = await import('../dist/esm/seq/set-save.js');
    installMockFs();installMockEngine();resetSeqEngine();resetSeqState();resetSetSession();resetSetSave();
    const bootClock=Date.now;let bootNow=bootClock();Date.now=()=>bootNow;
    for(let i=0;i<200;i++){bootNow+=50;seqEngineTick();sessionTick();}
    Date.now=bootClock;
    assert(sessionReady());
    setFlag('chtracks',0);
    resetPorts();schwungGridReload();
    let gesturePreviewHeld = false;
    const padWrites = [];
    globalThis.setLED = (...args) => padWrites.push(args);
    globalThis.move_midi_internal_send = packets => {
        for(let offset=0;offset<packets.length;offset+=4)
            if(packets[offset+1]===0x90&&packets[offset+2]>=68&&packets[offset+2]<100)
                padWrites.push([packets[offset+2],packets[offset+3],true]);
        return true;
    };
    globalThis.shadow_get_param=(_track,key)=>key.startsWith('midi_fx1:pad_view')
        ? `${gesturePreviewHeld ? 4095 : 0},0,0,1,4095,1,0,0,2,0`
        : port.getParam(key);
    globalThis.shadow_set_param=(_track,key,value)=>{port.setParam(key,value);return true;};
    appState.activeTrack=trackRef(0);appState.trackChainIndex[0]=0;
    appState.trackModels[0]=['midi_fx1','synth','fx1','fx2'].map(key=>createModel(portFor(0),key));
    for(const model of appState.trackModels[0]) for(let i=0;i<80;i++)model.tick();
    appState.initLedsDone=true;appState.shiftHeld=false;stepPageState.selected=false;
    const livePage=schwungPageFor(0,'midi_fx1');
    let frames=0;
    globalThis.clear_screen=()=>frames++;
    for(const view of [VIEW_CHAIN,VIEW_KNOBS]) {
        appState.currentView=view;
        for(const key of ['pad_chord_form','motion_control_33','motion_control_15','motion_control_16']) {
            for(const mode of [0,1,2])if(!livePage.ctl.pages.some(p=>p.keys?.includes(key))){setInitialMode('hbsteprow',mode);livePage.reload();}
            livePage.goToPage(livePage.ctl.pages.findIndex(p=>p.keys?.includes(key)));
            const slot=livePage.ctl.page.keys.indexOf(key);
            appState.dirty=true;tick();tick(); // establish the complete cached frame
            for(const status of [0x80,0x90]) {
                const clock=Date.now;let now=clock()+100,reads=0;
                Date.now=()=>now;
                gesturePreviewHeld=true;
                livePage.knobTouch(slot,true);
                tick();tick(); // held frame plus mandatory full tick
                gesturePreviewHeld=false;padWrites.length=0;
                onMidiMessageInternal([status,slot,status===0x80?64:0]);
                const shadowRead=globalThis.shadow_get_param, engineRead=globalThis.host_module_get_param;
                now+=50; // The next eligible preview frame follows release.
                const readKeys=[];
                globalThis.shadow_get_param=(...args)=>{reads++;readKeys.push(args[1]);now+=100;return shadowRead(...args);};
                globalThis.host_module_get_param=(...args)=>{assert(padWrites.length>0,'Pad LEDs must update before engine polling');reads++;now+=100;return engineRead(...args);};
                Date.now=()=>now;
                try {
                    const before=frames;
                    tick();
                    assert(readKeys.length>=1,`${key}: release frame obtains native pad colors in view ${view}`);
                    assert(readKeys[0] === 'midi_fx1:pad_view','No unrelated polling before feedback');
                    assert(padWrites.length>0,`${key}: changed pad colors reach LEDs in the release frame`);
                    assert(frames>before,'The cached frame is actually drawn');
                    assert.equal(livePage.ctl.state.touched,-1);
                    assert(!livePage.needsTouchPaint);
                    // Even an immediate new edge cannot starve normal work.
                    livePage.knobTouch(slot,true);reads=0;now+=100;
                    tick();
                    assert(reads>0,'A full tick follows the priority frame, even with another touch');
                    onMidiMessageInternal([status,slot,0]);tick();tick();
                } finally {Date.now=clock;globalThis.shadow_get_param=shadowRead;globalThis.host_module_get_param=engineRead;}
            }
        }
    }
    console.log('App touch frames: both views, both release formats, pad/operation knobs including lane 16, same-frame native pad refresh and no starvation pass');
}

// Modern gestures carry absolute timestamps; both physical sources share the
// lane's final release. Native C tests verify the resulting musical state.
{
    const {beginHbLaneTouch,paintHbOperationKnobs}=await import('../dist/esm/renderer/schwung-page.js');
    const savedClock=Date.now,savedSend=globalThis.move_midi_internal_send;
    let now=900000,reads=0,active=0,persistent=0,down=0;const messages=[],packets=[];
    Date.now=()=>now;globalThis.move_midi_internal_send=packet=>packets.push([...packet]);
    const owner={performanceTrack:15,
        performanceGet(key){reads++;return key.startsWith('motion_gesture_binding_')?`1,50,3,2,350,${active},${persistent}`:
            key==='motion_lights'?[active,persistent,down,1,...Array(15).fill(0)].join(','):'';},
        performanceSet(key,value){messages.push([key,value]);},
    };
    try {
        resetHbPerformance();
        let release=beginHbLaneTouch(owner,0);hbPerformanceStep([0x90,16,100],owner);
        assert.deepEqual(messages.at(-1),['motion_gesture_1','Touch,900000']);
        const before=messages.length;release();assert.equal(messages.length,before);
        const beforeReads=reads;now+=60;releaseHbPerformanceStep([0x80,16,0]);
        assert.deepEqual(messages.at(-1),['motion_gesture_1','Up,60,900060']);assert.equal(reads,beforeReads);
        now+=100;release=beginHbLaneTouch(owner,0);now+=40;release();
        assert.deepEqual(messages.at(-1),['motion_gesture_1','Up,40,900200']);
        function paint(){now+=60;ledFrameReset();paintHbPerformance(owner);paintHbOperationKnobs(owner,['motion_control_1'],{'motion_control_1':'1'});}
        active=1;persistent=1;seqLedsInvalidate();paint();paint();
        for(const note of [0,16])assert(packets.some(p=>p[1]===0x9a&&p[2]===note&&p[3]===120),'Persistent knob and step use native smooth pulse');
        assert(packets.some(p=>p[1]===0xba&&p[2]===71&&p[3]===120),'Knob CC indicator pulses too');
        packets.length=0;down=1;paint();
        for(const note of [0,16])assert(packets.some(p=>p[1]===0x90&&p[2]===note&&p[3]===120),'Momentary hold is solid');
        packets.length=0;down=0;persistent=0;paint();
        assert(!packets.some(p=>(p[1]&15)!==0),'Armed single tap stays solid');
        packets.length=0;active=0;paint();
        for(const note of [0,16])assert(packets.some(p=>p[1]===0x90&&p[2]===note&&p[3]===0),'Native deactivation turns both LEDs off');
    } finally {resetHbPerformance();Date.now=savedClock;globalThis.move_midi_internal_send=savedSend;}
}
console.log('Modern gestures: shared knob/step timestamp ownership, read-free release, solid armed/held LEDs, smooth persistent pulse and automatic off pass');

// Role-default panels edit the advertised shared key; local enums can relinquish overrides.
for (const key of ['conductor_default_chord_form','follower_default_chord_form','gap_scale','local_palette']) {
    const slot=focusKey(key),before=writes.length;
    page.knobTurn(slot,1);page.knobTouch(slot,false);
    assert(writes.slice(before).some(([wire])=>wire==='midi_fx1:'+key),key+' targets its own scope');
}
const localForm=focusKey('track_chord_form');
const roleClock=Date.now;let roleNow=roleClock();Date.now=()=>roleNow;
try {for(let turn=0;turn<128;turn++){roleNow+=100;page.knobTurn(localForm,1);page.knobTouch(localForm,false);roleNow+=100;page.tick();}}finally{Date.now=roleClock;}
assert.equal(values.get('track_chord_form'),'Follow Role');
for(const key of ['defaults_editor','chord_edit_target','chord_state_copy'])
    assert(!page.ctl.pages.some(candidate=>candidate.keys?.includes(key)),key+' removed from normal panels');
for(const key of ['conductor_default_chord_form','follower_default_chord_form','pad_chord_form','track_chord_form'])
    assert(!page.ctl.state.metaIndex.get(key).options.includes('Auto'),key+' has explicit form choices');
console.log('Shared forms, Follow Role override, no Auto or obsolete panels pass');

values.set('motif_lane','1');values.set('motion_operation','Play Motif');
const editorButton=focusKey('motif_edit');page.knobTouch(editorButton,true);page.knobTouch(editorButton,false);
assert.equal(page.pageTitle,'Motif Edit');
for (const key of ['motif_record','motif_lane','motif_duplicate','motif_close','motif_rhythm','render_rhythm_mode','render_rhythm_pattern','arp_start']) {
    assert(focusKey(key)>=0, `${key}: reachable through the real controller`);
}
console.log('Motif, Render Rhythm and arp-anchor controls are reachable through the real controller');

// Knob-capable HB separates taps from permanent latch turns.
{
    const clock=Date.now;let now=2400000;Date.now=()=>now;
    try {
        for(const lane of [1,16,32,33,37]){
            const slot=focusKey('motion_control_'+lane);
            values.set('motion_gesture_binding_'+lane,'1,1,3,0,350,0,0,1');
            for(let tap=0;tap<2;tap++){
                page.knobTouch(slot,true);assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_'+lane,'Knob,'+now]);
                now+=40;page.knobTouch(slot,false);assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_'+lane,'Up,40,'+now]);now+=50;
            }
            page.knobTouch(slot,true);page.knobTurn(slot,1);
            assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_'+lane,'LatchOn']);
            const count=writes.length;now+=500;page.knobTouch(slot,false);
            assert.equal(writes.length,count,'Releasing the touch cannot undo a turn');
            page.knobTurn(slot,-1);assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_'+lane,'LatchOff']);
            page.knobTouch(slot,true);now+=500;page.knobTouch(slot,false);
            assert.deepEqual(writes.at(-1),['midi_fx1:motion_gesture_'+lane,'Up,500,'+now]);
        }
    } finally {Date.now=clock;}
}
console.log('Fixed operation knobs: separate tap protocol, momentary hold, directional latch, captured release across panels pass');

// Shift edits fixed lanes' operations and named controls' normal values.
{
    const {appState}=await import('../dist/esm/app/state.js');
    for(const lane of [1,8,9,16,32,33,37]){
        const key='motion_control_'+lane, editKey=lane<=16?'motion_operation_'+lane:key;
        values.set('motion_gesture_binding_'+lane,'1,1,3,0,350,0,0,1');
        const slot=focusKey(key);
        const options=lane<=16?page.ctl.state.metaIndex.get('motion_operation').options:page.ctl.metaAt(slot)?.options;
        values.set(editKey,options?.[0]??'0');page.ctl.revalue();
        const before=writes.length;
        appState.shiftHeld=true;page.knobTouch(slot,true);page.knobTurn(slot,1);page.knobTouch(slot,false);appState.shiftHeld=false;
        const edits=writes.slice(before);
        assert(edits.some(([name])=>name==='midi_fx1:'+editKey),key+': Shift edits the fixed lane operation or named value');
        assert(!edits.some(([name])=>name.includes('motion_gesture_')||name==='midi_fx1:motion_lane'||name.includes('follow_touch_')),key+': Shift never triggers or remaps lanes');
        page.knobTouch(slot,true);const started=writes.length;
        appState.shiftHeld=true;page.knobTurn(slot,-1);page.knobTouch(slot,false);appState.shiftHeld=false;
        assert(writes.slice(started).some(([name,value])=>name.includes('motion_gesture_')&&value==='Cancel'),key+': Shift after touch cancels an unlatched gesture');
        values.set('motion_gesture_binding_'+lane,'1,1,3,0,350,1,1,1');
        page.knobTouch(slot,true);const latchedStart=writes.length;
        appState.shiftHeld=true;page.knobTurn(slot,1);page.knobTouch(slot,false);appState.shiftHeld=false;
        const latched=writes.slice(latchedStart);
        assert(latched.some(([name,value])=>name.includes('motion_gesture_')&&value.startsWith('Up,')),key+': Shift releases an already-latched touch without cancelling its latch');
        assert(!latched.some(([,value])=>['Cancel','LatchOn','LatchOff'].includes(value)),key+': saved latch remains unchanged');
    }
}
console.log('Shift edits: fixed lane operations, named modes, both touch orders, persistent latch preservation and no lane remapping pass');

assert.deepEqual(module.capabilities.chain_params.find(p=>p.key==='pad_chord_form').options,module.capabilities.chain_params.find(p=>p.key==='chord_form').options.filter(option=>option!=='Follow Role'),'Pad color and sounding chord forms share choices');

const formKeys=['conductor_default_chord_form','follower_default_chord_form','pad_chord_form','pad_next_chord_form','detected_chord_form','track_chord_form','pad_next_pulse','pad_adjacent_shading'];
assert.deepEqual(module.capabilities.ui_hierarchy.levels.chord_forms.knobs,formKeys);
for(const key of formKeys){
    assert.equal(page.ctl.pages.filter(candidate=>candidate.keys?.includes(key)).length,1,key+' appears on exactly one page');
    assert(focusKey(key)>=0,key+' is reachable');
}
assert(!module.capabilities.ui_hierarchy.levels.pad_chord_form,'No stranded Pad Harmony page');
console.log('Chord Forms: eight unified controls, detected readout, no duplicates or single-knob panel');

// The separate settings panel keeps teal special-control LEDs and captions in sync.
{
    const {paintHbOperationKnobs}=await import('../dist/esm/renderer/schwung-page.js');
    const {performKnobCaption}=await import('../dist/esm/renderer/hb-approach.js');
    const {keyboardState}=await import('../dist/esm/keyboard/state.js');
    const oldClock=Date.now,oldSend=globalThis.move_midi_internal_send,oldLayout=keyboardState.layout;
    let now=2000000,active=0,persistent=0,down=0,motifLatch='Off';const packets=[];
    let rows=[1,0,1,0,-1,0,0,0,0,2,1,0,0,0,0,0,0];
    const owner={performanceTrack:14,performanceSet(){},performanceGet(key){
        if(key==='motion_named_lights')return [active,persistent,down,...Array(35).fill(20)].join(',');
        if(key==='approach_motif_latch')return motifLatch;
        if(key==='approach_row_status')return rows.join(',');
        if(key==='approach_rows_view')return '3,CCB|2,CCA|1,LT';
        return '';
    }};
    Date.now=()=>now;globalThis.move_midi_internal_send=packet=>packets.push([...packet]);
    try {
        keyboardState.layout=0;
        {
            const keys=['key_center','parallel_mode','approach_motif_latch','motion_control_32','target_scale_source','target_scale_major','target_scale_minor','target_scale_diminished'];
            const paint=()=>{now+=60;ledFrameReset();paintHbOperationKnobs(owner,keys,{});};
            motifLatch='On';seqLedsInvalidate();packets.length=0;paint();paint();
            assert.equal(performKnobCaption('approach_motif_latch'),'Latch');
            assert(packets.some(p=>p[1]===0x9a&&p[2]===2&&p[3]===16),'Dedicated motif latch pulses teal');
            motifLatch='Off';paint();assert.equal(performKnobCaption('approach_motif_latch'),'Off');
            for(const state of ['Armed','Latch','Hold','Off']){
                active=state==='Off'?0:32768;persistent=state==='Latch'?32768:0;down=state==='Hold'?32768:0;
                seqLedsInvalidate();packets.length=0;paint();paint();
                assert.equal(performKnobCaption('motion_control_32'),state,'Current state caption in settings');
                const noteStatus=state==='Latch'?0x9a:0x90,buttonStatus=state==='Latch'?0xba:0xb0,color=state==='Off'?0:16;
                assert(packets.some(p=>p[1]===noteStatus&&p[2]===3&&p[3]===color),'Correct knob animation in '+state);
                assert(packets.some(p=>p[1]===buttonStatus&&p[2]===74&&p[3]===color),'Correct CC animation in '+state);
            }
        }
        const keys=Array.from({length:8},(_,index)=>'approach_bank_'+(index+1));
        const paint=()=>{now+=60;ledFrameReset();paintHbOperationKnobs(owner,keys,{});};
        rows[5]=1;rows[6]=1;paint();assert.equal(performKnobCaption(keys[0]),'Armed');
        rows[8]=1;paint();assert.equal(performKnobCaption(keys[0]),'Latch');
        rows[3]=1;paint();assert.equal(performKnobCaption(keys[0]),'Hold');
        rows[3]=rows[5]=rows[6]=rows[8]=0;keyboardState.layout=3;paint();assert.equal(performKnobCaption(keys[0]),'R3');
        keyboardState.layout=2;rows[12]=3;rows[13]=1;rows[14]=1;rows[16]=2;rows.push(0,1);paint();
        assert.equal(performKnobCaption(keys[0]),'1');assert.equal(performKnobCaption(keys[1]),'2');
        rows[13]=rows[14]=0;appState.dirty=false;paint();assert(appState.dirty,'Cursor-only changes redraw captions');
        assert.equal(performKnobCaption(keys[0]),'1');
        // Touch order differs from knob order; all members keep their positions.
        rows[12]=7;rows[13]=2;rows[14]=0;rows[16]=3;rows.splice(17,rows.length,2,0,1);paint();
        assert.equal(performKnobCaption(keys[2]),'1');
        assert.equal(performKnobCaption(keys[0]),'2');
        assert.equal(performKnobCaption(keys[1]),'3');
        rows[13]=0;rows[14]=1;paint();
        assert.equal(performKnobCaption(keys[2]),'1');
        assert.equal(performKnobCaption(keys[0]),'2');
        assert.equal(performKnobCaption(keys[1]),'3');
    } finally {Date.now=oldClock;globalThis.move_midi_internal_send=oldSend;keyboardState.layout=oldLayout;}
}
console.log('Perform captions and cyan Chord + Arp LED: Off/Armed/Hold/Latch, row and sequence progress pass');

// Key controls preserve captured releases and route Shift edits to the scale selector.
{
    const {appState}=await import('../dist/esm/app/state.js');
    for(const key of ['key_center_scale','conductor_key_travel','parallel_scale']){
        const slot=focusKey(key);
        assert.equal(page.pageTitle,'Key & Scale');
        assert.equal(page.ctl.page.keys[slot],key);
    }
    setInitialMode('hbsteprow',2);page.reload();
    const panel=page.ctl.pages.findIndex(candidate=>candidate.keys?.[0]==='key_center'&&candidate.keys?.[1]==='parallel_mode');
    assert(panel>=0);page.goToPage(panel);
    for(let tick=0;tick<64;tick++)page.tick();
    const before=writes.length;page.knobTouch(0,true);page.knobTouch(0,false);
    assert(writes.slice(before).some(([key,value])=>key==='midi_fx1:key_center'&&value==='Down'));
    assert(writes.slice(before).some(([key,value])=>key==='midi_fx1:key_center'&&value==='Up'));
    page.knobTouch(1,true);page.knobTurn(1,1);page.knobTouch(1,false);
    assert(writes.some(([key,value])=>key==='midi_fx1:parallel_mode'&&value==='LatchOn'));
    appState.shiftHeld=true;const shifted=writes.length;page.knobTouch(1,true);page.knobTurn(1,1);page.knobTouch(1,false);appState.shiftHeld=false;
    assert(writes.slice(shifted).some(([key])=>key==='midi_fx1:parallel_scale'));
    assert(!writes.slice(shifted).some(([key,value])=>key==='midi_fx1:parallel_mode'&&value==='Down'));
}
console.log('Key Center and Parallel Scale: global settings, physical slots, captured release, latch and Shift scale selection pass');
