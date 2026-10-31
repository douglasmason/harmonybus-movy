import assert from 'node:assert/strict';
import {schwungLib} from '../dist/esm/renderer/schwung-lib.js';
import {detentsPerStep, isNarrowInt} from '../src/vendor/schwung/shared/knob_engine.mjs';

// Exercise the controller actually bundled for both browser and device.
// Numeric semitone controls get the slower gate without becoming enum lists.
for (const span of [17, 24, 48]) {
    const metadata = {type: 'int', min: -12, max: span - 12, step: 1};
    assert.equal(detentsPerStep(metadata), 4);
    assert.equal(isNarrowInt(metadata), false);
    assert.equal(detentsPerStep({...metadata, knobAcceleration: 'wide'}), 1);
}
assert.equal(detentsPerStep({type: 'int', min: 0, max: 127}), 1);

let clock = 1000, menuReads = 0, visibilityChecks = 0;
const values = {sync: 'Host', tempo: '120', transpose: '0'};
const metadata = [
    {key: 'sync', type: 'enum', options: ['Host', 'Manual', 'Off']},
    {key: 'tempo', type: 'float', min: 40, max: 300, step: 0.5},
    {key: 'transpose', type: 'int', min: -24, max: 24, step: 1},
];
const hierarchy = {levels: {root: {name: 'Setup',
    knobs: ['sync', null, 'tempo', 'transpose'],
    params: ['sync', {key: 'tempo', visible_if: {param: 'sync', equals: 'Manual'}}, 'transpose'],
}}};
const controller = schwungLib().createController({
    now: () => clock,
    getParam: key => {
        const bare = key.replace(/^[^:]+:/, '');
        assert(!['null', 'undefined', ''].includes(bare), 'empty knobs never issue reads');
        if (bare === 'chain_params') return JSON.stringify(metadata);
        if (bare === 'ui_hierarchy') return JSON.stringify(hierarchy);
        return values[bare] ?? '';
    },
    setParam: (key, value) => {values[key.replace(/^[^:]+:/, '')] = String(value); return true;},
    trailingMenus: () => {menuReads++; return [{name: 'Presets', entries: [{label: 'Init', action: 'load'}]}];},
});
controller.load({slot: 0, component: 'fx1', prefix: 'fx1', visible: condition => {
    visibilityChecks++;
    return (controller.state.values[condition.param] ?? values[condition.param]) === condition.equals;
}});
const tick = () => {clock += 23; controller.tick();};
for (let count = 0; count < 5; count++) tick();
assert.equal(controller.page.keys[1], null, 'authored holes retain knob positions');
const initialMenuReads = menuReads;
const shapes = new Set();
for (let cycle = 0; cycle < 4; cycle++) {
    for (const direction of [1, -1]) for (let detent = 0; detent < 12; detent++) {
        clock += 7; controller.onKnobTurn(0, direction, clock);
        tick(); shapes.add(controller.page.keys.join(','));
    }
}
assert(shapes.size > 1 && visibilityChecks > 0, 'gating still changes the page');
assert.equal(menuReads, initialMenuReads, 'visibility changes do not reread preset state');
controller.refreshTrailing();
assert.equal(menuReads, initialMenuReads + 1, 'explicit preset refresh remains live');
// Once stamped, a write of the existing gate value cannot change the plan.
for (let detent = 0; detent < 12; detent++) {
    clock += 7; controller.onKnobTurn(0, -1, clock);
}
for (let count = 0; count < 4; count++) tick();
assert.equal(values.sync, 'Host');
const stable = visibilityChecks;
for (let detent = 0; detent < 3; detent++) {
    clock += 30; controller.onKnobTurn(0, -1, clock); tick();
}
assert.equal(visibilityChecks, stable, 'unchanged gate does not replan');
console.log('Schwung 1.8.2 bundled controller: numeric detents, authored holes, cached preset rows and unchanged-gate planning pass');
