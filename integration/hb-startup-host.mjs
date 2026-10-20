import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installEnv } from './env.mjs';
installEnv();
const { portFor, resetPorts } = await import('../dist/esm/track/registry.js');
const { setHostMode } = await import('../dist/esm/track/host-mode.js');
const { setFlag } = await import('../dist/esm/seq/flags.js');
const { schwungPageFor, schwungGridReload } = await import('../dist/esm/renderer/schwung-grid.js');
const module = JSON.parse(readFileSync(process.env.HB_MODULE,'utf8'));
const writes=[];
function prepare(port, fallback, label) {
    const parameters=module.capabilities.chain_params.map(parameter=>fallback?
        {...parameter,type:parameter.type==='string'?'float':parameter.type,options_as_string:false}:parameter);
    port.getParam=key=>{
        if(key==='midi_fx1_module')return 'harmonybus';
        if(key.endsWith(':ui_hierarchy'))return JSON.stringify(module.capabilities.ui_hierarchy);
        if(key.endsWith(':chain_params'))return JSON.stringify(parameters);
        if(key.endsWith(':version'))return module.version;
        const parameter=parameters.find(candidate=>candidate.key===key.split(':').pop());
        return parameter?String(parameter.default??parameter.options?.[0]??'0'):'';
    };
    port.setParam=(key,value)=>{writes.push([label,key,value]);return true;};
}
setFlag('hbsteprow',0);
setHostMode(0);resetPorts();schwungGridReload();
const openingPort=portFor(2);prepare(openingPort,true,'old-host');
const openingPage=schwungPageFor(2,'midi_fx1');
assert.equal(openingPage.ctl.metaAt(0).type,'float');
// Set loading resolves the real host after the selected track has already drawn.
setHostMode(1);
const currentPort=portFor(2);assert.notEqual(currentPort,openingPort);prepare(currentPort,false,'movy');
const recovered=schwungPageFor(2,'midi_fx1');
assert.notEqual(recovered,openingPage,'Opening editor must abandon its captured old-host port');
assert.equal(recovered.ctl.metaAt(0).type,'string');
assert.equal(recovered.ctl.state.metaIndex.get('track_role').options_as_string,true);
recovered.performanceSet('parallel_mode','Down');
assert.deepEqual(writes.at(-1),['movy','midi_fx1:parallel_mode','Down']);
assert.equal(schwungPageFor(2,'midi_fx1'),recovered,'Stable host reuses editor without metadata polling');
prepare(portFor(1),false,'later-track');
assert.equal(schwungPageFor(1,'midi_fx1').ctl.metaAt(0).type,'string');
// Switching back must also replace the opening editor and route writes correctly.
setHostMode(0);prepare(portFor(2),false,'returned-host');
const returned=schwungPageFor(2,'midi_fx1');assert.notEqual(returned,recovered);
returned.performanceSet('parallel_mode','Off');
assert.deepEqual(writes.at(-1),['returned-host','midi_fx1:parallel_mode','Off']);
console.log('Opening-track host change: editor metadata and writes follow the current port; stable pages remain cached');

const { keyboardState } = await import('../dist/esm/keyboard/state.js');
const { resetUiState, applyUiState } = await import('../dist/esm/seq/ui-state.js');
assert.equal(keyboardState.layout,2,'Fresh process uses Approach');
keyboardState.layout=0;resetUiState();
assert.equal(keyboardState.layout,2,'New set uses Approach');
applyUiState(JSON.stringify({mode:0,layout:0}));
assert.equal(keyboardState.layout,0,'Saved Fourths choice survives');
applyUiState(JSON.stringify({mode:0,layout:3}));
assert.equal(keyboardState.layout,3,'Saved Triple Approach choice survives');
const choices=['Relative','Nearest Octave','Closest Chord Tone','Closest Scale Tone','Closest Split','Upward','Downward'];
for(const key of ['travel_map','conductor_key_travel','follower_key_travel']){
    const parameter=module.capabilities.chain_params.find(p=>p.key===key);
    for(const choice of choices)assert(parameter.options.includes(choice),key+' exposes '+choice);
}
assert.equal(module.capabilities.chain_params.find(p=>p.key==='travel_map').default,'None');
console.log('Approach defaults, saved layouts, and shared travel menu choices verified');
