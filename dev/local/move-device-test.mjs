import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createServer,get} from 'node:http';
import {once} from 'node:events';
import {decodeDeviceScreen,decodeDeviceSurface,deviceStreamURL,openDeviceConnection} from './move-device.mjs';
import {createMoveConnection} from './move-connection.mjs';
import {createDeviceServer} from './move-device-server.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/move-mirror-v1.json',import.meta.url)));
class Stream{
 static instances=[];
 constructor(url){this.url=url;this.listeners={};Stream.instances.push(this);}
 addEventListener(name,callback){this.listeners[name]=callback;}
 emit(name,data){(name==='message'?this.onmessage:this.listeners[name])?.({data:JSON.stringify(data)});}
 close(){this.closed=true;}
}
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
test('decode real mirror layouts without guessing semantic state',()=>{
 const pixels=decodeDeviceScreen(fixture.screen);assert.equal(pixels.length,8192);
 assert.equal(pixels[0],255);assert.equal(pixels[7*128],255);assert.equal(pixels[9*128+1],255);assert.equal(pixels[8191],255);assert.equal(pixels[128],0);
 const raw=Buffer.alloc(4096);raw[0]=0x2f;const gray=decodeDeviceScreen({...fixture.screen,format:'gray4',data:raw.toString('base64')});assert.equal(gray[0],34);assert.equal(gray[1],255);
 const surface=decodeDeviceSurface(fixture.surface);assert.equal(surface[24+68],7);assert.equal(surface[1560+68],100);assert.deepEqual([...surface.slice(536+(128+71)*4,540+(128+71)*4)],[12,34,56,1]);
 assert.throws(()=>decodeDeviceScreen({...fixture.screen,data:'bad'}));assert.throws(()=>decodeDeviceSurface({...fixture.surface,v:2}));
 const corrupt=Buffer.from(fixture.surface.data,'base64');corrupt.writeUInt32LE(3,12);assert.throws(()=>decodeDeviceSurface({...fixture.surface,data:corrupt.toString('base64')}));
});
test('HTTPS rejects local insecure routes before creating any connection',()=>{
 for(const address of ['http://move.local:8080','move.local:8080','http://127.0.0.1:7703'])assert.throws(()=>deviceStreamURL(address,'https://studio.example/move/'),/HTTPS/);
 for(const address of ['','ftp://move.local','http://a:b@move.local','http://move.local/x','http://move.local?x=1'])assert.throws(()=>deviceStreamURL(address,'http://mac.local'));
 assert.equal(deviceStreamURL('move.local:8080','http://mac.local:7703/move/'),'http://move.local:8080/stream-auto?v=2');
 assert.equal(deviceStreamURL('https://move.example','https://studio.example'),'https://move.example/stream-auto?v=2');
});
test('valid frame handshake, LED upgrade, disconnect and no implicit retry',()=>{
 const states=[],frames=[];const connection=openDeviceConnection({url:'http://move/stream-auto?v=2',EventSourceClass:Stream,onState:(...args)=>states.push(args),onFrame:frame=>frames.push(frame)}),stream=Stream.instances.at(-1);
 stream.emit('hb',fixture.heartbeat);assert.equal(states.at(-1)[0],'connecting');
 stream.emit('message',fixture.screen);assert.equal(states.at(-1)[0],'connected');assert.equal(states.at(-1)[2].input,false);
 stream.emit('surface',fixture.surface);assert.equal(states.at(-1)[2].leds,true);assert.equal(frames.at(-1).knobLabels,null);
 connection.close();assert(stream.closed);assert.equal(states.at(-1)[0],'disconnected');const count=frames.length;stream.emit('message',fixture.screen);assert.equal(frames.length,count);
});
test('bad protocol, failed open, lost connection and stalled heartbeat fail closed',async()=>{
 for(const failure of ['malformed','error','timeout']){
  const states=[];const connection=openDeviceConnection({url:'http://move',EventSourceClass:Stream,timeout:20,onState:state=>states.push(state),onFrame:()=>{}}),stream=Stream.instances.at(-1);
  if(failure==='malformed')stream.emit('message',{...fixture.screen,width:256});
  if(failure==='error')stream.onerror();
  if(failure==='timeout'){stream.emit('message',fixture.screen);await delay(40);}
  assert.equal(states.at(-1),failure==='timeout'?'disconnected':'error');assert(stream.closed);connection.close();
 }
});
test('one owner releases before pause, retains browser, ignores stale device frames',async()=>{
 const trace=[],states=[],frames=[],devices=[],controlStates=[];let resume;
 const browser={socket:{send:data=>trace.push(JSON.parse(data))},setActive:async value=>{trace.push(['active',value]);await new Promise(resolve=>{resume=resolve;});}};
 let owner;owner=createMoveConnection({browser,inputs:{disable:()=>owner.send({type:'dev_release'})},pageURL:'http://mac.local',onState:state=>states.push(state),onFrame:frame=>frames.push(frame),openDevice:options=>{const device={...options,close:()=>trace.push('close')};devices.push(device);return device;}});
 owner.watch('surface',['status']);owner.watch('field',['status','ch0:midi_fx1:field_outputs_view2']);
 const switching=owner.select('move');assert.deepEqual(trace.slice(-2),[{type:'dev_release'},['active',false]]);
 owner.connect('move.local');assert.equal(devices.length,0,'no connection before browser pause acknowledgment');resume();await switching;
 assert.equal(states.at(-1).state,'disconnected');owner.connect('move.local',{onControlState:(...args)=>controlStates.push(args)});assert.equal(devices.length,1);
 devices[0].onControlState(true,'ready');assert.equal(controlStates.length,1);
 devices[0].onFrame({device:true,marker:1});owner.disconnect();const count=frames.length;devices[0].onFrame({marker:2});assert.equal(frames.length,count);devices[0].onControlState(true,'stale');assert.equal(controlStates.length,1);assert.equal(owner.transport('play'),false);
 owner.send({type:'move_midi',data:[144,68,100]});assert(!trace.some(value=>value?.type==='move_midi'));
 const back=owner.select('browser');resume();await back;assert.equal(owner.engine,'browser');assert.equal(states.at(-1).state,'browser');
 assert(trace.some(value=>value?.type==='dev_watch'&&value.keys.length===2),'watch union is restored');
});
test('failed ownership acknowledgment cannot connect or dispatch to either engine',async()=>{
 let connections=0,writes=0;const states=[];
 const browser={socket:{send:()=>writes++},setActive:async()=>{throw new Error('Worker unavailable');}};
 const owner=createMoveConnection({browser,inputs:{disable(){}},pageURL:'http://mac.local',onState:value=>states.push(value),onFrame(){},openDevice(){connections++;}});
 await owner.select('move');owner.connect('move.local');assert.equal(connections,0);assert.equal(states.at(-1).state,'error');
 await owner.select('browser');owner.send({type:'move_midi'});assert.equal(writes,0);assert.equal(owner.acceptBrowserFrame(),false);assert.equal(owner.ready,false);
});
test('local companion proxies only the fixed read-only stream, preserving disconnects',async()=>{
 const received=[];let upstreamClosed=false;
 const upstream=createServer((request,response)=>{received.push({method:request.method,path:request.url,cookie:request.headers.cookie});response.writeHead(200,{'Content-Type':'text/event-stream'});response.write('data: '+JSON.stringify(fixture.screen)+'\n\n');response.on('close',()=>{upstreamClosed=true;});});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 // Reserve a port so the configured Host check matches the actual listener.
 const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const origin=`http://127.0.0.1:${port}`;
 const server=createDeviceServer({siteRoot:new URL('../wasm/build/site/',import.meta.url),moveAddress:`http://127.0.0.1:${upstream.address().port}`,origin});server.listen(port,'127.0.0.1');await once(server,'listening');
 try{
  assert.equal((await fetch(origin+'/api/anything')).status,404);
  assert.equal((await fetch(origin+'/stream-auto?v=2',{method:'POST'})).status,405);
  assert.equal((await fetch(origin+'/stream-auto?v=2',{headers:{Origin:'https://unrelated.example'}})).status,403);
  assert.equal(await new Promise(resolve=>get(origin+'/stream-auto?v=2',{headers:{Host:'wrong.example'}},response=>{response.resume();resolve(response.statusCode);})),421);
  assert.equal(received.length,0);
  const controller=new AbortController(),response=await fetch(origin+'/stream-auto?v=2',{signal:controller.signal,headers:{Cookie:'not-forwarded=1'}});
  const chunk=await response.body.getReader().read();assert(new TextDecoder().decode(chunk.value).includes('mono1_packed'));
  assert.deepEqual(received,[{method:'GET',path:'/stream-auto?v=2',cookie:undefined}]);controller.abort();
  await delay(30);assert(upstreamClosed);
 }finally{server.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>upstream.close(resolve))]);}
});
