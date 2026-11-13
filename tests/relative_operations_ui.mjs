import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]);
const load=path=>import(pathToFileURL(root+'/'+path));
const {installEnv}=await load('browser-test/env.mjs');
installEnv();
const {BANK_CHOICES,approachPanels}=await load('dist/esm/renderer/hb-approach.js');
const {choiceGroup,orderHarmonyChoices,MOTIF_OPERATION_CHOICES}=await load('dist/esm/renderer/hb-choice-order.js');
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
assert(!named.options.includes('Smart Below'),'Ordering must not inject choices missing from native metadata');
console.log('Relative operation UI: native labels, distinct harmonic families, both Smart selectors, bank panels and stable numeric enums pass');

const smartLane={key:'motion_operation',options_as_string:true,options:['Off','Smart Below','Smart Above','Leading Tone']};
orderHarmonyChoices(smartLane);assert(smartLane.options.includes('Smart Below')&&smartLane.options.includes('Smart Above'));
const motif={key:'motif_operation',options_as_string:true,options:[...MOTIF_OPERATION_CHOICES].reverse()};
orderHarmonyChoices(motif);assert.deepEqual(motif.options,MOTIF_OPERATION_CHOICES);
assert.equal(new Set(motif.options).size,motif.options.length);
for(const name of ['Captured','Leading Tone','Upper Dim','Connector Below','Connector Above','Tritone Sub','Secondary II','Secondary V (Dom)','Secondary Fifth','Smart Below','Smart Above'])assert(motif.options.includes(name));
assert(!motif.options.includes('Scale Above'),'Legacy Scale Above remains readable; new choices use Secondary II');
const olderMotif={key:'motif_operation',options_as_string:true,options:['Smart Above','Captured','Smart Below']};
orderHarmonyChoices(olderMotif);assert.deepEqual(olderMotif.options,['Captured','Smart Below','Smart Above']);

const globalPitch={key:'motion_operation',options_as_string:true,options:['Global Transpose','Transpose','Off']};
orderHarmonyChoices(globalPitch);
assert.equal(choiceGroup('Global Transpose'),'Pitch');
assert.deepEqual(globalPitch.options,['Off','Transpose','Global Transpose']);

const spread={key:'motion_operation',options_as_string:true,options:['Chord Spread','Off','Chord Form']};
orderHarmonyChoices(spread);
assert.equal(choiceGroup('Chord Spread'),'Chord / Arp');
assert.deepEqual(spread.options,['Off','Chord Spread','Chord Form']);
const rotation={key:'motion_operation',options_as_string:true,options:['Voicing Rotate','Chord Form','Chord Spread','Off']};
orderHarmonyChoices(rotation);
assert.equal(choiceGroup('Voicing Rotate'),'Chord / Arp');
assert.deepEqual(rotation.options,['Off','Chord Spread','Voicing Rotate','Chord Form']);

const blend={key:'motion_operation',options_as_string:true,options:['Note Blend','Off','Transpose']};
orderHarmonyChoices(blend);assert.equal(choiceGroup('Note Blend'),'Pitch');
assert.deepEqual(blend.options,['Off','Transpose','Note Blend']);

const field={key:'motion_operation',options_as_string:true,options:['Field Output','Field Zoom','Off','Field Rate']};
orderHarmonyChoices(field);assert.equal(choiceGroup('Field Rate'),'Field');
assert.deepEqual(field.options,['Off','Field Rate','Field Zoom','Field Output']);
assert.equal(choiceGroup('Cloud Hold'),'Cloud');
const cloudChoices={key:'motion_operation',options_as_string:true,options:['Cloud Hold','Off','Field Output']};
orderHarmonyChoices(cloudChoices);assert.deepEqual(cloudChoices.options,['Off','Field Output','Cloud Hold']);

for(const name of ["Cloud Shift X","Cloud Shift Y"])assert.equal(choiceGroup(name),"Cloud");
