import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]);
const load=path=>import(pathToFileURL(root+'/'+path));
const {installEnv}=await load('browser-test/env.mjs');
installEnv();
const {BANK_CHOICES,approachPanels}=await load('dist/esm/renderer/hb-approach.js');
const {choiceGroup,orderHarmonyChoices}=await load('dist/esm/renderer/hb-choice-order.js');
const hierarchy={levels:{root:{params:[]}}};
approachPanels(hierarchy,2);
for(const name of ['Leading Tone','Upper Dim','Connector Below','Connector Above','Smart Below','Smart Above']){
    assert.equal(BANK_CHOICES.filter(choice=>choice===name).length,1);
    for(const bank of [0,1])for(const parameter of hierarchy.levels['approach_bank_'+bank].params){
        assert(parameter.options.includes(name));
        assert.equal(parameter.options_as_string,true,'Catalog ordering cannot change saved numeric identities');
    }
}
assert.equal(choiceGroup('Smart Below'),'Smart Approaches');
assert.equal(choiceGroup('Smart Above'),'Smart Approaches');
assert.equal(choiceGroup('Leading Tone'),'Dominant Approach');
assert.equal(choiceGroup('Connector Below'),'Connectors');
const numeric={key:'motion_operation',options_as_string:false,options:['Upper Dim','Off','Leading Tone']};
orderHarmonyChoices(numeric);assert.deepEqual(numeric.options,['Upper Dim','Off','Leading Tone']);
const named={key:'motion_operation',options_as_string:true,options:['Upper Dim','Off','Leading Tone']};
orderHarmonyChoices(named);assert.deepEqual(new Set(named.options),new Set(numeric.options));
assert(!named.options.includes('Smart Below'),'Bank-only selectors must not become unsupported operation lanes');
console.log('Relative operation UI: native labels, distinct harmonic families, both Smart selectors, bank panels and stable numeric enums pass');
