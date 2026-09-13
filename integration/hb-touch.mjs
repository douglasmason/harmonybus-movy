import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installEnv } from './env.mjs';
installEnv();
const { schwungLibAvailable } = await import('../dist/esm/renderer/schwung-lib.js');
assert(schwungLibAvailable(), 'This test requires the real Schwung controller');
const { createSchwungPage } = await import('../dist/esm/renderer/schwung-page.js');
const module = JSON.parse(readFileSync(process.env.HB_MODULE, 'utf8'));
const values = new Map(module.capabilities.chain_params.map(param => [param.key, param.default ?? param.options?.[0] ?? '0']));
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
assert.equal(page.ctl.describePage().header.right, 'Free');
assert.equal(page.ctl.describePage().header.left, 'Arp Phase');
const rectangles = [];
globalThis.fill_rect = (...args) => rectangles.push(args);
page.render('HB');
assert(rectangles.some(([x,y,width,height,color]) => x===0 && y===0 && width===128 && height>=7 && color===1), 'Touch must paint the highlighted header');
page.knobTouch(gateSlot, true);
assert.equal(page.ctl.describePage().header.left, 'Arp Gate');
page.knobTouch(gateSlot, false);
assert.equal(page.ctl.describePage().header.left, 'Arp Phase');
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
for (const key of ['mod_chrom_below', 'mod_scale_above']) {
    values.set(key, 'Off');
    const slot = focusKey(key);
    const before = writes.length;
    page.knobTouch(slot, true);
    assert.deepEqual(writes.at(-1), [`midi_fx1:${key}`, 'On']);
    page.knobTouch(slot, true);
    page.knobTurn(slot, 3);
    page.knobTurn(slot, -3);
    page.knobTouch(slot, false);
    assert.equal(writes.length, before + 1, `${key}: exactly one write per touch`);
    assert.equal(values.get(key), 'On', 'Release preserves the toggle');
    page.knobTouch(slot, true);
    assert.deepEqual(writes.at(-1), [`midi_fx1:${key}`, 'Off']);
    page.knobTouch(slot, false);
}
for (const [key, action] of [['approach_reset','Reset'],['approach_scale_next','Scale +'],['approach_chrom_next','Chrom -'],['next_reset','Reset'],['arp_clear','Clear']]) {
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
console.log('HB buttons: touch toggle, release persistence, every action, repeat-touch and turn deduplication pass');
