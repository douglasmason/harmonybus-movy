import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {installEnv} from './env.mjs';
installEnv();
// Keep the existing 50ms LED polling clock fixed during a render burst.
Date.now=()=>1000;
const {createSchwungPage}=await import('../dist/esm/renderer/schwung-page.js');
const metadata=JSON.parse(readFileSync(process.env.HB_MODULE,'utf8'));
const parameters=metadata.capabilities.chain_params;
Object.assign(parameters.find(parameter=>parameter.key==='motion_control_1'),{name:'Next Harmony',short_name:'1'});
Object.assign(parameters.find(parameter=>parameter.key==='motion_control_2'),{name:'Scale Direction',short_name:'2'});
parameters.push({key:'cp_track_0_motion_control_17',name:'Connector Below',type:'int',min:0,max:1});
const values=new Map(parameters.map(parameter=>[parameter.key,String(parameter.default??parameter.options?.[0]??'0')]));
let reads=0,writes=0;
const port={track:{index:0},getParam(key){
    reads++;const bare=key.split(':').at(-1);
    if(bare==='midi_fx1_module')return 'harmonybus';
    if(bare==='chain_params')return JSON.stringify(parameters);
    if(bare==='ui_hierarchy')return JSON.stringify(metadata.capabilities.ui_hierarchy);
    return values.get(bare)??'';
},setParam(){writes++;return true;}};
const page=createSchwungPage(port,'midi_fx1',{harmonyMode:0});
assert(page.ready);
const visit=key=>{const index=page.ctl.pages.findIndex(candidate=>candidate.keys.includes(key));assert(index>=0,key);page.goToPage(index);page.ctl.state.touched=-1;page.ctl.state.peek=null;};
visit('motion_control_1');
const action=page.ctl.metaAt(0);assert(action.movy_action_label);
assert(page.ctl.state.metaIndex.get('cp_track_0_motion_control_17').movy_action_label,'conductor aliases share the same metadata rule');
assert(!page.ctl.state.metaIndex.get('motion_amount').movy_action_label,'editable amount keeps its value widget');
const pixels=new Uint8Array(128*64);
globalThis.clear_screen=()=>pixels.fill(0);
globalThis.fill_rect=(x,y,w,h,color)=>{
    x=Math.trunc(x);y=Math.trunc(y);w=Math.trunc(w);h=Math.trunc(h);
    assert(x>=0&&y>=0&&x+w<=128&&y+h<=64,'operation text stays on screen');
    for(let row=y;row<y+h;row++)for(let column=x;column<x+w;column++)pixels[row*128+column]=color?1:0;
};
const region=()=>Array.from({length:22},(_,row)=>Array.from(pixels.slice((row+9)*128,(row+9)*128+32))).flat();
const render=()=>{pixels.fill(0);page.render('Normal Play');return region();};
const beforeWrites=writes;
page.ctl.state.values.motion_control_1='1';const first=render();
const beforeReads=reads; // Existing LED state polling warmed by the first frame.
assert(first.some(Boolean));page.ctl.state.values.motion_control_1='999';assert.deepEqual(render(),first,'no numeric widget or numbered label survives');
action.label='Chromatic Connector Below';assert.notDeepEqual(render(),first,'full operation name owns the entire cell');
page.ctl.state.touched=0;page.ctl.state.touchOrder=[0];const held=render();
assert(held.filter(Boolean).length>first.filter(Boolean).length,'touch still highlights the whole action');
assert.equal(page.ctl.describePage().header.right,'','touch header does not reintroduce a meaningless number');
page.ctl.state.touched=-1;page.ctl.state.touchOrder=[];
for(let frame=0;frame<100;frame++)render();
assert.equal(reads,beforeReads,'operation text adds no reads within the existing LED polling window');assert.equal(writes,beforeWrites,'operation drawing cannot activate an operation');
if(process.env.ACTION_PIXELS)writeFileSync(process.env.ACTION_PIXELS,JSON.stringify([...pixels]));
visit('motion_amount');const slot=page.ctl.page.keys.indexOf('motion_amount');assert(!page.ctl.metaAt(slot).movy_action_label);
// A stock module using the same key spelling keeps the standard shared renderer.
const stock=createSchwungPage({...port,getParam(key){return key==='midi_fx1_module'?'stock-test':port.getParam(key);}},'midi_fx1');
assert(!stock.ctl.state.metaIndex.get('motion_control_1').movy_action_label);
console.log('Operation cells: full names, no slot numbers, touch feedback, aliases, real-value controls, stock interoperability and no additional host reads/writes pass');
