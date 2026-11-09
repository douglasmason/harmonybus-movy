import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createServer,get} from 'node:http';
import {once} from 'node:events';
import {decodeDeviceScreen,decodeDeviceSurface,deviceStreamURL,openDeviceConnection,discoverPageCompanion} from './move-device.mjs';
import {createMoveConnection} from './move-connection.mjs';
import {createDeviceServer} from './move-device-server.mjs';
import {createMoveDiagnostics} from './move-diagnostics.mjs';
import {openDeviceControl} from './move-device-control.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/move-mirror-v1.json',import.meta.url)));
class Stream{
 static instances=[];
 constructor(url){this.url=url;this.listeners={};Stream.instances.push(this);}
 addEventListener(name,callback){this.listeners[name]=callback;}
 emit(name,data){(name==='message'?this.onmessage:this.listeners[name])?.({data:JSON.stringify(data)});}
 close(){this.closed=true;}
}
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
test('connection report observes the real adapters without extra traffic or private content',()=>{
 let clock=0;const key='c'.repeat(64),address='http://private-computer.example:7703';
 const diagnostics=createMoveDiagnostics({pageProtocol:'http:',now:()=>clock,date:()=>new Date('2026-11-05T00:00:00Z'),build:{engineSource:{integrationVersion:'0.34.1-hbclean.322'},privateSession:'secret'}});
 class Socket{
  static latest;readyState=1;bufferedAmount=0;sent=[];
  constructor(){Socket.latest=this;}send(data){this.sent.push(JSON.parse(data));}close(){this.closed=true;}
  emit(message){this.onmessage({data:JSON.stringify(message)});}
 }
 diagnostics.begin(address,true);
 diagnostics.metadata('available',{moduleVersion:'0.34.1-hbclean.322',supportedModule:true,stateReadPreservesDirty:true,companionTransportEnabled:true,pairingKey:key,address});
 const connection=openDeviceConnection({url:address,EventSourceClass:Stream,pairingKey:key,onFrame(){},onState(){},onDiagnostic:diagnostics.event,openControl:options=>openDeviceControl({...options,WebSocketClass:Socket})});
 const stream=Stream.instances.at(-1);stream.emit('hb',fixture.heartbeat);assert.equal(diagnostics.snapshot().mirror.state,'connecting','heartbeat cannot establish screen');
 clock=25;stream.emit('message',fixture.screen);stream.emit('surface',fixture.surface);
 Socket.latest.emit({type:'ready',tool:'movy',version:'0.34.1-hbclean.322'});
 assert.equal(connection.transport('play'),true);assert.equal(connection.transport('stop'),false);
 assert.equal(diagnostics.snapshot().transport.pendingAction,'play');
 Socket.latest.emit({type:'sent',action:'play'});assert.equal(connection.transport('stop'),true);Socket.latest.emit({type:'sent',action:'stop'});
 for(let index=0;index<30;index++){clock++;stream.emit('message',fixture.screen);stream.emit('surface',fixture.surface);stream.emit('hb',fixture.heartbeat);}
 const before=JSON.stringify(Socket.latest.sent),streamCount=Stream.instances.length;
 const report=diagnostics.snapshot();assert.equal(JSON.stringify(Socket.latest.sent),before);assert.equal(Stream.instances.length,streamCount,'snapshot creates no connection');
 assert.deepEqual(Socket.latest.sent,[{type:'transport',action:'play'},{type:'transport',action:'stop'}]);
 assert.equal(report.mirror.firstScreenAfterMs,25);assert.equal(report.mirror.screenFrames,31);assert.equal(report.mirror.surfaceFrames,31);assert.equal(report.mirror.heartbeats,31);
 assert.deepEqual(report.transport.sent,{play:1,stop:1});assert.equal(report.limits.deviceExecutionConfirmed,false);
 for(const privateValue of [key,address,fixture.screen.data,'privateSession'])assert(!JSON.stringify(report).includes(privateValue),privateValue);
 report.transport.sent.play=999;report.events[0].code='changed';assert.equal(diagnostics.snapshot().transport.sent.play,1);assert.notEqual(diagnostics.snapshot().events[0].code,'changed');
 Socket.latest.emit({type:'error',message:'private error '+key+address});
 assert.equal(diagnostics.snapshot().transport.lastFailure,'transport-rejected');assert(!JSON.stringify(diagnostics.snapshot()).includes(key));
 stream.onerror();connection.close();assert.equal(diagnostics.snapshot().mirror.lastFailure,'mirror-lost');
 const finished=JSON.stringify(diagnostics.snapshot());stream.emit('message',fixture.screen);Socket.latest.emit({type:'ready',tool:'movy',version:'0.34.1-hbclean.322'});assert.equal(JSON.stringify(diagnostics.snapshot()),finished);
 diagnostics.begin('https://user:secret@private.example/?key='+key,false);assert.equal(diagnostics.snapshot().endpointProtocol,'https:');assert.equal(diagnostics.snapshot().mirror.screenFrames,0);assert.equal(diagnostics.snapshot().transport.sent.play,0);
 diagnostics.metadata('available',{moduleVersion:'private.example/'+key});assert.equal(diagnostics.snapshot().metadata.moduleVersion,null);
 for(let index=0;index<100;index++)diagnostics.event('transport-rejected',{message:key});
 assert.equal(diagnostics.snapshot().events.length,20);assert(JSON.stringify(diagnostics.snapshot()).length<4000);assert(!JSON.stringify(diagnostics.snapshot()).includes(key));
 diagnostics.reset();assert.equal(diagnostics.snapshot().metadata.state,'not-checked');assert.equal(diagnostics.snapshot().attempt,0);
});
test('connection ownership preserves loss evidence and ignores old diagnostic callbacks',async()=>{
 const diagnostics=createMoveDiagnostics(),devices=[];
 const owner=createMoveConnection({browser:{socket:{send(){}},setActive:async()=>{}},inputs:{disable(){}},onState(){},onFrame(){},pageURL:'http://local.example',diagnostics,openDevice:options=>{devices.push(options);options.onDiagnostic('mirror-connecting');return {close(){options.onDiagnostic('mirror-closed');}};}});
 await owner.select('move');owner.connect('private.example');devices[0].onDiagnostic('mirror-screen');devices[0].onDiagnostic('mirror-lost');owner.disconnect('hidden');
 assert.equal(diagnostics.snapshot().mirror.closedBy,'hidden');assert.equal(diagnostics.snapshot().mirror.lastFailure,'mirror-lost');
 owner.connect('private.example');assert.equal(diagnostics.snapshot().attempt,2);devices[0].onDiagnostic('mirror-screen');assert.equal(diagnostics.snapshot().mirror.screenFrames,0);
 devices[1].onDiagnostic('mirror-screen');assert.equal(diagnostics.snapshot().mirror.screenFrames,1);owner.browserClosed('private engine error');
 assert.equal(diagnostics.snapshot().ownerFailure,'browser-engine-failed');assert.equal(diagnostics.snapshot().mirror.closedBy,'browser-failed');assert(!JSON.stringify(diagnostics.snapshot()).includes('private engine error'));
});
test('clean startup failure permits explicit Move ownership without a browser session',async()=>{
 const devices=[],states=[],frames=[],diagnostics=createMoveDiagnostics();
 diagnostics.event('browser-startup-failed');
 const owner=createMoveConnection({browser:null,diagnostics,inputs:{disable(){}},pageURL:'http://mac.local',onState:value=>states.push(value),onFrame:frame=>frames.push(frame),openDevice:options=>{devices.push(options);return {close(){},transport:action=>action==='play'};}});
 owner.disconnect();owner.watch('field',['status']);owner.send({type:'subscribe_tool'});
 assert.equal(owner.engine,'move');assert.equal(owner.ready,true);assert.equal(owner.acceptBrowserFrame(),false);assert.equal(devices.length,0);
 await owner.select('browser');assert.equal(owner.engine,'move');assert.equal(devices.length,0);
 owner.connect('move.local');devices[0].onFrame({device:true});devices[0].onDiagnostic('mirror-screen');
 assert.equal(frames.at(-1).device,true);assert.equal(owner.transport('play'),true);
 assert.equal(diagnostics.snapshot().ownerFailure,'browser-startup-failed');
 owner.disconnect();devices[0].onFrame({stale:true});assert.equal(frames.at(-1).stale,undefined);
 assert.equal(owner.transport('play'),false);assert.equal(states.at(-1).state,'disconnected');
});
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
 const trace=[],states=[],frames=[],devices=[],controlStates=[],observations=[];let resume;
 const browser={socket:{send:data=>trace.push(JSON.parse(data))},setActive:async value=>{trace.push(['active',value]);await new Promise(resolve=>{resume=resolve;});}};
 let owner;owner=createMoveConnection({browser,inputs:{disable:()=>owner.send({type:'dev_release'})},pageURL:'http://mac.local',onState:state=>states.push(state),onFrame:frame=>frames.push(frame),openDevice:options=>{const device={...options,close:()=>trace.push('close')};devices.push(device);return device;}});
 owner.watch('surface',['status']);owner.watch('field',['status','ch0:midi_fx1:field_outputs_view2']);
 const switching=owner.select('move');assert.deepEqual(trace.slice(-2),[{type:'dev_release'},['active',false]]);
 owner.connect('move.local');assert.equal(devices.length,0,'no connection before browser pause acknowledgment');resume();await switching;
 assert.equal(states.at(-1).state,'disconnected');owner.connect('move.local',{onControlState:(...args)=>controlStates.push(args),onObservation:state=>observations.push(state)});assert.equal(devices.length,1);
 devices[0].onControlState(true,'ready');assert.equal(controlStates.length,1);
 devices[0].onObservation({playing:true});assert.equal(observations.length,1);
 devices[0].onFrame({device:true,marker:1});owner.disconnect();const count=frames.length;devices[0].onFrame({marker:2});assert.equal(frames.length,count);devices[0].onControlState(true,'stale');assert.equal(controlStates.length,1);assert.equal(owner.transport('play'),false);
 devices[0].onObservation({playing:false});assert.equal(observations.length,1,'old connection cannot revive a cleared observation');
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
test('Worker loss invalidates all owners and late activation replies',async()=>{
 for(const failDuringSwitch of [false,true]){
  const states=[],frames=[],writes=[];let resume,disabled=0,opened=0;
  const browser={socket:{send:value=>writes.push(value)},setActive:()=>new Promise(resolve=>{resume=resolve;})};
  const owner=createMoveConnection({browser,inputs:{disable(){disabled++;}},pageURL:'http://mac.local',onState:state=>states.push(state),onFrame:frame=>frames.push(frame),openDevice(){opened++;}});
  const switching=failDuringSwitch?owner.select('move'):null;
  owner.browserClosed();const disabledAfterLoss=disabled;
  resume?.();await switching;
  owner.send({type:'move_midi',data:[144,60,100]});owner.watch('field',['status']);
  await owner.select('browser');await owner.select('move');owner.connect('move.local');owner.disconnect();owner.browserClosed();
  assert.equal(owner.ready,false);assert.equal(owner.busy,false);assert.equal(owner.acceptBrowserFrame(),false);
  assert.equal(owner.transport('play'),false);assert.equal(opened,0);assert.deepEqual(writes,[]);
  assert.equal(disabled,disabledAfterLoss,'loss cleanup is idempotent');
  assert.equal(states.at(-1).state,'error');assert.match(states.at(-1).message,/reload/);
  assert.equal(frames.at(-1).ready,false);assert.equal(frames.at(-1).knobLabels,null);
 }
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
  assert.equal(await discoverPageCompanion(origin+'/move/'),origin);
  assert.equal((await fetch(origin+'/api/movy-companion?address=http://other')).status,400);
  assert.equal((await fetch(origin+'/api/movy-companion',{headers:{Origin:'https://unrelated.example'}})).status,403);
  assert.equal((await fetch(origin+'/api/movy-companion',{method:'POST'})).status,405);
  assert.equal(received.length,0,'companion identity never contacts Move');
  const controller=new AbortController(),response=await fetch(origin+'/stream-auto?v=2',{signal:controller.signal,headers:{Cookie:'not-forwarded=1'}});
  const chunk=await response.body.getReader().read();assert(new TextDecoder().decode(chunk.value).includes('mono1_packed'));
  assert.deepEqual(received,[{method:'GET',path:'/stream-auto?v=2',cookie:undefined}]);controller.abort();
  await delay(30);assert(upstreamClosed);
 }finally{server.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>upstream.close(resolve))]);}
});

test('companion discovery checks only the page origin, fails quietly and never trusts a supplied endpoint',async()=>{
 const calls=[],signal=new AbortController().signal;
 const fetcher=async(url,options)=>{calls.push([url.href,options]);return {ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>({schema:1,service:'hb-movy-companion',endpoint:'http://other'})};};
 assert.equal(await discoverPageCompanion('https://local.example/move/?view=field',{fetcher,signal}),'https://local.example');
 assert.equal(calls[0][0],'https://local.example/api/movy-companion');assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].signal,signal);
 for(const response of [{ok:false},{ok:true,headers:new Headers({'content-type':'text/html'})},{ok:true,headers:new Headers({'content-type':'application/json'}),json:async()=>({schema:2,service:'hb-movy-companion'})}])assert.equal(await discoverPageCompanion('https://trial.example',{fetcher:async()=>response}),null);
 assert.equal(await discoverPageCompanion('https://trial.example',{fetcher:async()=>{throw new Error('Unavailable');}}),null);
});
