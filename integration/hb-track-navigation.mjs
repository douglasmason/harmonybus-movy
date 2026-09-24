import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installEnv } from './env.mjs';
installEnv();
const { appState, VIEW_KNOBS, VIEW_CHAIN } = await import('../dist/esm/app/state.js');
const { seqState } = await import('../dist/esm/seq/state.js');
const { portFor } = await import('../dist/esm/track/registry.js');
const { selectTrack } = await import('../dist/esm/track/focus.js');
const { beginTrackSwitch, switchToTrack, restoreTrackState } = await import('../dist/esm/track/switch.js');
const { schwungPageFor, schwungActiveFor } = await import('../dist/esm/renderer/schwung-grid.js');
const module = JSON.parse(readFileSync(process.env.HB_MODULE, 'utf8'));
const writes = [];
const maps = Array.from({length:16}, (_, track) => new Map([
    ['midi_fx1_module', track === 2 ? '' : 'harmonybus'],
    ['midi_fx1:ui_hierarchy', JSON.stringify(module.capabilities.ui_hierarchy)],
    ['midi_fx1:chain_params', JSON.stringify(module.capabilities.chain_params)],
    ...module.capabilities.chain_params.map(param => ['midi_fx1:' + param.key, String(param.default ?? param.options?.[0] ?? '0')]),
    ['midi_fx1:render_channel', String(track + 1)],
]));
for (let track=0; track<16; track++) {
    const port = portFor(track);
    port.getParam = key => maps[track].get(key) ?? null;
    port.getMany = keys => keys.map(key => port.getParam(key));
    port.setParam = (key,value) => { writes.push([track,key,value]); maps[track].set(key,value); return true; };
}
seqState.sessionMode = false;
selectTrack(0);
appState.trackChainIndex.fill(1);
appState.trackView.fill(VIEW_CHAIN);
appState.trackChainIndex[0] = 0;
appState.currentView = VIEW_KNOBS;
const source = schwungActiveFor(0,'midi_fx1');
assert(source?.ready, 'real Schwung controller is required');
const root = source.ctl.pages.findIndex(page => page.keys?.includes('render_channel'));
const mapping = source.ctl.pages.findIndex(page => page.keys?.includes('travel_map'));
assert(mapping >= 0);
source.goToPage(mapping);
const origin = beginTrackSwitch();
switchToTrack(4, origin);
assert.equal(appState.currentView, VIEW_KNOBS);
assert.equal(appState.trackChainIndex[4], 0);
const target = schwungPageFor(4,'midi_fx1');
assert.equal(target.pageTitle, source.pageTitle);
assert.notEqual(target.ctl, source.ctl);
restoreTrackState(origin);
assert.equal(appState.activeTrack.index, 0);
assert.equal(source.pageIndex, mapping);
// Returning from a peek must not change the original track's panel.
source.goToPage(root);
switchToTrack(15, beginTrackSwitch());
const last = schwungPageFor(15, 'midi_fx1');
assert.equal(last.pageIndex, root);
for(let tick=0;tick<64;tick++) last.tick();
assert.equal(String(last.ctl.state.values.render_channel), '16');
const renderSlot = last.ctl.page.keys.indexOf('render_channel');
last.knobTurn(renderSlot, -4);
assert(writes.some(([track,key]) => track===15 && key==='midi_fx1:render_channel'), 'knobs write the destination track');
assert(!writes.some(([track,key]) => track===0 && key==='midi_fx1:render_channel'), 'source values remain untouched');
switchToTrack(2, beginTrackSwitch());
assert.equal(appState.currentView, VIEW_CHAIN, 'missing HB uses destination view');
assert.equal(appState.trackChainIndex[2], 1, 'missing HB leaves slot selection alone');
// Non-module views and Session/master pages retain their normal behavior.
selectTrack(0);appState.currentView=VIEW_CHAIN;
switchToTrack(3,beginTrackSwitch());
assert.equal(appState.currentView,VIEW_CHAIN);
selectTrack(0);appState.currentView=VIEW_KNOBS;seqState.sessionMode=true;
switchToTrack(3,beginTrackSwitch());
assert.equal(appState.currentView,VIEW_CHAIN);
console.log('Track navigation: real HB panels, host/Movy tracks, destination writes, missing module, peek restoration and Session fallback pass');

// Other hosted modules follow by identity, even between different FX slots.
seqState.sessionMode=false;
for (const [track,component] of [[1,'fx1'],[3,'fx2']]) {
    maps[track].set(component+'_module','navigation-fixture');
    maps[track].set(component+':ui_hierarchy',JSON.stringify(module.capabilities.ui_hierarchy));
    maps[track].set(component+':chain_params',JSON.stringify(module.capabilities.chain_params));
}
selectTrack(1);appState.currentView=VIEW_KNOBS;appState.trackChainIndex[1]=2;
const effect=schwungActiveFor(1,'fx1');
effect.goToPage(effect.ctl.pages.findIndex(page=>page.keys?.includes('travel_map')));
switchToTrack(3,beginTrackSwitch());
assert.equal(appState.trackChainIndex[3],3);
assert.equal(schwungPageFor(3,'fx2').pageTitle,effect.pageTitle);
console.log('Other module navigation across FX slots passes');
