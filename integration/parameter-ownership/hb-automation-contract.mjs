import assert from 'node:assert/strict';
import {installEnv} from './env.mjs';
installEnv();
await import('../dist/esm/app/globals.js');
const {createSchwungPage}=await import('../dist/esm/renderer/schwung-page.js');

const parameters=[
    {key:'shape',type:'enum',options:['Sine','Triangle','Square']},
    {key:'rate',type:'enum',options:['1','2','4','8'],options_as_string:true},
    {key:'amount',type:'float',min:-1,max:1},
    {key:'status',type:'int',min:0,max:127,access:'read'},
    {key:'fire',type:'int',min:0,max:1,access:'write'},
    {key:'fixed',type:'int',min:4,max:4},
    {key:'disabled',type:'float',min:0,max:1,automatable:false},
    {key:'file',type:'filepath'},
];
const values=new Map([
    ['synth:module','contract-fixture'],
    ['synth:ui_hierarchy',JSON.stringify({levels:{main:{name:'Main',knobs:parameters.map(p=>p.key)}}})],
    ['synth:chain_params',JSON.stringify(parameters)],
    ['synth:shape','Square'],['synth:rate','4'],['synth:amount','0.25'],
    ['synth:status','24'],['synth:fire','0'],
    ['synth:fixed','4'],['synth:disabled','0.5'],['synth:file','/tmp/sample.wav'],
]);
let reads=0;
const writes=[];
const port={track:{index:0},bulkReads:false,
    getParam:key=>{reads++;return values.get(key)??null;},
    setParam:(key,value)=>{writes.push([key,value]);values.set(key,value);return true;},
    setParamTimeout:(key,value)=>port.setParam(key,value),
};
const page=createSchwungPage(port);
assert(page.ready);
page.goToPage(page.ctl.pages.findIndex(p=>p.keys?.includes('shape')));
page.ctl.revalue();
const beforeReads=reads;
assert.equal(page.knobParamInfo(0).value,2,'named enum seeds automation from its displayed choice');
assert.equal(page.knobParamInfo(1).value,2,'numeric option names use the learned wire convention');
assert.equal(page.knobParamInfo(2).value,0.25);
assert.equal(page.knobParamInfo(3).automatable,false);
assert.equal(page.knobParamInfo(4).automatable,false);
for(const slot of [5,6,7])assert.equal(page.knobParamInfo(slot).automatable,false);
assert.equal(page.knobParamInfo(8),null);
assert.equal(reads,beforeReads,'descriptors use cached controller state');
assert.equal(writes.length,0,'describing controls does not write parameters');

const {assignLane,automationRegistry,resetAutomation,handleAutomationKnob,laneForParam}=await import('../dist/esm/seq/automation.js');
const {setEditGuard}=await import('../dist/esm/seq/engine.js');
const commands=[];setEditGuard(op=>commands.push(op));
resetAutomation();
const shape=page.knobParamInfo(0),rate=page.knobParamInfo(1);
assert.equal(assignLane(0,0,shape,()=>true),0);
assert.equal(assignLane(0,0,rate,()=>true),1);
assert(commands.includes('abase 0 0 127'),'Square is recorded from its actual base');
assert(commands.includes('abase 0 1 85'),'named 4 is option 2 of 4, not numeric value 4');
assert.equal(automationRegistry()[0][0].targetParam,'synth:shape');
const {normalizedOf}=await import('../src/vendor/schwung/shared/param_pages/render_page_movy.mjs');
page.render('Choices',{activeLanes:3,held:true,heldValues:new Map([[0,2],[1,2]]),
    laneForKey:key=>laneForParam(0,'synth:'+key)});
assert.equal(normalizedOf(page.ctl.metaAt(1),page.ctl.decorations[1].value),2/3,
    'held numeric option names keep the same choice as the automation index');
for(const slot of [3,4,5,6,7])assert.equal(handleAutomationKnob(0,slot,page.knobParamInfo(slot),1,()=>{throw Error('invalid mapping');}),false);
for(const value of [null,undefined,'','garbage','Infinity','NaN',2]){
    page.ctl.state.values.amount=value;
    assert.equal(page.knobParamInfo(2).automatable,false,'invalid numeric value cannot seed automation: '+value);
}
page.ctl.state.values.amount='0.25';
assert.equal(page.knobParamInfo(2).automatable,true,'a valid cached value restores the control');

// A stock-style child selector changes the concrete wire key and declaration.
values.set('synth:chain_params',JSON.stringify([
    {key:'p01_gain',type:'float',min:0,max:1},
    {key:'p02_gain',type:'float',min:0,max:100},
]));
values.set('synth:ui_hierarchy',JSON.stringify({levels:{root:{
    child_count:2,child_label:'Pad',child_key_template:'p{index}_{key}',
    child_index_base:1,child_index_digits:2,knobs:['gain'],
}}}));
values.set('synth:p01_gain','0.25');values.set('synth:p02_gain','75');
page.reload();
const selectPad=index=>{
    page.goToPage(page.ctl.pages.findIndex(p=>p.childOf));
    page.ctl.onClick();page.ctl.onJog(index-page.ctl.childIndexOf('root'));page.ctl.onClick();
    page.goToPage(page.ctl.pages.findIndex(p=>p.keys?.includes('gain')));
    page.ctl.revalue();
};
selectPad(0);
const firstPad=page.knobParamInfo(0);
assert.equal(firstPad.ioKey,'p01_gain');assert.equal(firstPad.value,0.25);
assert.equal(page.targetAt(0),'synth:p01_gain');
selectPad(1);
const secondPad=page.knobParamInfo(0),beforeDescriptorReads=reads;
assert.equal(secondPad.ioKey,'p02_gain');assert.equal(secondPad.value,75);assert.equal(secondPad.max,100);
assert.equal(page.targetAt(0),'synth:p02_gain');
assert.equal(firstPad.ioKey,'p01_gain','an onset descriptor keeps its original pad');
resetAutomation();commands.length=0;
assignLane(0,0,secondPad,()=>true);
assert(commands.includes('alabel 0 0 synth:p02_gain'));
assert(commands.includes('abase 0 0 95'));
assert.equal(reads,beforeDescriptorReads,'resolved targets add no host reads');
assert(!commands.some(command=>/^(ra|note|chord|motion)/.test(command)),'parameter lanes do not write abstract musical events');
const automation={activeLanes:1,held:true,heldValues:new Map([[0,87]]),
    laneForKey:key=>laneForParam(0,'synth:'+key)};
const describe=page.ctl.describePage;let descriptions=0;
page.ctl.describePage=(...args)=>{descriptions++;return describe(...args);};
try{page.render('Pad 2',automation);}finally{page.ctl.describePage=describe;}
assert.equal(descriptions,1,'automation decorations and touch header share one frame description');
assert.deepEqual(page.ctl.decorations?.[0],{locked:true,value:87},'the displayed held lock follows its concrete target');
selectPad(0);page.render('Pad 1',automation);
assert.equal(page.ctl.decorations,null,'another pad does not inherit this automation indicator');
selectPad(1);
setEditGuard(null);

// Hold-to-modulate uses that same onset descriptor, even after pad navigation.
const {holdTouch,holdTick,assignCommit,resetAssignMode}=await import('../dist/esm/lfo/assign-mode.js');
const {HOLD_MS}=await import('../dist/esm/model/constants.js');
const realNow=Date.now;let now=realNow();
try{
    Date.now=()=>now;
    holdTouch({port,keyPrefix:'',slot:0,label:'T1',id:'t0',components:['synth'],hasRetrigger:true},0,firstPad);
    now+=HOLD_MS+1;assert(holdTick());
    assert.equal(assignCommit().assigned,true);
    assert.equal(values.get('lfo1:target'),'synth');
    assert.equal(values.get('lfo1:target_param'),'p01_gain');
    assert.equal(values.get('lfo1:enabled'),'1');
}finally{Date.now=realNow;resetAssignMode();}
console.log('Shared automation contract: named enums, numeric option names, access/invalid guards, per-pad keys/ranges, lane commands and LFO onset ownership pass without descriptor I/O');
