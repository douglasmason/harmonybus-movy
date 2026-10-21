import test from 'node:test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';
import {Processor} from './processor.mjs';
import {startServer} from './server.mjs';
const directory=fileURLToPath(new URL('./build',import.meta.url));
const metadata=JSON.parse(await readFile(resolve(directory,'modules/midi_fx/harmonybus/module.json'),'utf8'));
async function connect(port){const socket=new WebSocket(`ws://127.0.0.1:${port}/ws/remote-ui`);await once(socket,'open');return socket}
async function request(socket,message){const response=once(socket,'message');socket.send(JSON.stringify(message));return JSON.parse(String((await response)[0]))}
const surface=(serial,track,status,address,pitch,velocity)=>({type:'set_param',key:'overtake_dsp:surface_events',value:[serial,track,status,address,pitch,velocity,0,-1,0].join(',')});

test('WebSocket commands match production native state and MIDI; disconnect releases holds',{timeout:30000},async()=>{
  const service=await startServer({port:0,realtime:false});const direct=new Processor(directory);const socket=await connect(service.port);
  try {
    await direct.request('snapshot');
    const initial=await request(socket,{type:'subscribe_tool'});
    assert.equal(initial.params['ch0:midi_fx1:version'],metadata.version);
    const messages=[surface(1,0,144,12,60,100),surface(2,0,144,16,64,100),surface(3,0,144,19,67,100),{type:'dev_step',blocks:256},surface(4,1,144,44,60,100),{type:'dev_step',blocks:256},surface(5,0,128,12,60,0),surface(6,0,128,16,64,0),surface(7,0,128,19,67,0),surface(8,0,144,14,62,100),surface(9,0,144,17,65,100),surface(10,0,144,21,69,100),{type:'dev_step',blocks:256},surface(11,1,128,44,60,0),{type:'dev_step',blocks:256}];
    const expected=[];let final;let followed=false;
    for(const message of messages) {
      const operation=message.type==='dev_step'?await direct.request('step',message.blocks):await direct.request('set',message.key.replace('overtake_dsp:',''),message.value);
      expected.push(...operation.events);const snapshot=await direct.request('snapshot');expected.push(...snapshot.events);
      final=await request(socket,message);
      assert.notEqual(final.type,'error',final.message);followed ||= final.params['ch1:midi_fx1:follower_snapshot'].includes('D4');
      assert.deepEqual(Object.fromEntries(Object.entries(final.params).filter(([key])=>key!=="status")),Object.fromEntries(Object.entries(snapshot.value).filter(([key])=>key!=="status")));assert.equal(final.params.status.split(" chcost=")[0],snapshot.value.status.split(" chcost=")[0]);assert.deepEqual(final.events.map(event=>event.packet),expected);
    }
    assert.ok(expected.some(packet=>(packet[1]&240)===144),'real note output');assert.ok(followed,'held C follows D minor to D');
    assert.ok(final.params['ch0:midi_fx1:harmony_snapshot'].includes('Dm'),'real chord changed');
    const rejected=await request(socket,{type:'set_param',key:'state',value:'movy1'});assert.equal(rejected.type,'error');
    assert.equal((await request(socket,{type:'dev_watch',keys:['ch1:midi_fx1:state']})).type,'error');
    assert.equal((await request(socket,{type:'dev_watch',keys:Array(65).fill('ch1:midi_fx1:role')})).type,'error');
    const watched=await request(socket,{type:'dev_watch',keys:['ch1:midi_fx1:render_channel']});
    assert.equal(watched.params['ch1:midi_fx1:render_channel'],'2');
    await request(socket,{type:'dev_watch',keys:[]});
    const held=await request(socket,surface(12,1,144,44,60,100));
    assert.ok(held.events.length>0);
    socket.close();await once(socket,'close');
    const monitor=await connect(service.port);
    const released=await request(monitor,{type:'subscribe_tool'});
    const balances=new Map();
    for(const {packet} of released.events) {
      const status=packet[1]&240;const identity=`${packet[1]&15}:${packet[2]}`;
      if(status===144&&packet[3])balances.set(identity,(balances.get(identity)??0)+1);
      if(status===128||(status===144&&!packet[3]))balances.set(identity,(balances.get(identity)??0)-1);
    }
    assert.ok([...balances.values()].every(count=>count===0),`unbalanced notes: ${JSON.stringify([...balances])}`);
    monitor.close();
  } finally {socket.close();direct.close();await service.close()}
});

test('native instances have isolated HB shared global state',{timeout:10000},async()=>{
  const first=new Processor(directory),second=new Processor(directory);
  try{
    await first.request('set','ch0:midi_fx1:master_transpose','D');
    assert.equal((await first.request('get','ch0:midi_fx1:master_transpose')).value,'D');
    assert.equal((await second.request('get','ch0:midi_fx1:master_transpose')).value,'As Played');
  }finally{first.close();second.close()}
});

test('current Field Outputs controls reach native HB and preserve latch/release semantics',{timeout:10000},async()=>{
  const service=await startServer({port:0,realtime:false});const socket=await connect(service.port);
  const set=async(key,value)=>{
    const response=await request(socket,{type:'set_param',key:`ch1:midi_fx1:${key}`,value:String(value)});
    assert.notEqual(response.type,'error',response.message);return response;
  };
  const frame=value=>'fo1,'+[value,...Array(15).fill(-1)].join(',');
  const snapshot=response=>response.params['ch1:midi_fx1:field_outputs_view2'].split(',').slice(1).map(Number);
  try {
    await set('field_glide',0);await set('field_override',1);
    await set('field_outputs_remote',frame(7500));
    await request(socket,{type:'dev_step',blocks:1});
    await set('field_output_finish','1,0,7500');
    const latched=snapshot(await set('field_outputs_remote',frame(-1)));
    assert.equal(latched[4],7500);assert.equal(latched[52]&1,1);
    await request(socket,{type:'dev_step',blocks:512});
    assert.equal(snapshot(await request(socket,{type:'refetch_tool'}))[4],7500,'latch survives lease timeout');
    const cleared=snapshot(await set('field_output_clear',16));assert.equal(cleared[52],0);
    await set('field_override',0);await set('field_outputs_remote',frame(2500));
    await request(socket,{type:'dev_step',blocks:1});
    socket.close();await once(socket,'close');
    const monitor=await connect(service.port);
    const released=snapshot(await request(monitor,{type:'subscribe_tool'}));
    assert.equal(released[52],0,'disconnect must not latch');
    assert.equal(released[4],released[3],'disconnect returns output to underlying field');
    monitor.close();
  } finally {socket.close();await service.close()}
});
