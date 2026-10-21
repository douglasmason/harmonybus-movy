import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]);
const {env,createLfoModel,masterScope}=await import(pathToFileURL(root+'/browser-test/logic/harness.mjs'));
const {createScopedLfoModel}=await import(pathToFileURL(root+'/dist/esm/lfo/model.js'));
for(const master of [false,true])for(const supported of [false,true]){
    const available=supported&&!master;
    const prefix=master?'master_fx:':'';
    env.setParams({[prefix+'lfo1:field_source_version']:supported?'1':'',
        [prefix+'lfo1:shape']:'5',[prefix+'lfo1:rate_hz']:'1',
        [prefix+'lfo1:phase_offset']:'0',[prefix+'lfo1:depth']:'0.5'});
    const model=master?createScopedLfoModel(masterScope()):createLfoModel(0);
    model.tick();model.getViewModel();model.handleKnobDelta(4,8);
    const view=model.getViewModel();
    assert.equal(view.rows[1][0].options.length,available?22:6);
    assert.equal(view.rows[1][0].displayValue,available?'Field 1':'Swishy');
    if(available){
        assert.deepEqual(view.lfoViz,[]);
        for(const [row,col] of [[0,0],[0,1],[1,1],[1,2]])assert.equal(view.rows[row][col],null);
        const before=JSON.stringify(env.params);
        for(const knob of [0,1,5,6])model.handleKnobDelta(knob,8);
        assert.equal(JSON.stringify(env.params),before);
        model.handleKnobDelta(4,8*15);
        assert.equal(model.getViewModel().rows[1][0].displayValue,'Field 16');
        model.handleKnobDelta(4,-8*16);
        assert.equal(model.getViewModel().rows[1][0].displayValue,'Swishy');
        assert.ok(model.getViewModel().rows[0][0]);
    }
}
console.log('Field LFO UI: capability gates, channel limits, shared controls and waveform return passed');

const {buildTargetOptions}=await import(pathToFileURL(root+'/dist/esm/lfo/params.js'));
const fake={components:['synth','fx1','midi_fx1'],keyPrefix:'',port:{getParam:()=>JSON.stringify([{key:'gain',type:'float'}])}};
assert.deepEqual(buildTargetOptions(fake,0,true).map(x=>x.target),[null,'synth','fx1']);
assert.ok(buildTargetOptions(fake,0,false).some(x=>x.target==='lfo2'));
