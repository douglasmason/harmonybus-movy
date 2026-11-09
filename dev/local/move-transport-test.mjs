import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {WebSocket,WebSocketServer} from 'ws';
import {createDeviceServer} from './move-device-server.mjs';
import {openDeviceControl} from './move-device-control.mjs';
import {deviceTransportState} from './move-transport.mjs';
import {openDeviceConnection,checkDeviceCapabilities} from './move-device.mjs';
import {readFile} from 'node:fs/promises';
const key='a'.repeat(64),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fixture=JSON.parse(await readFile(new URL('./fixtures/move-mirror-v1.json',import.meta.url)));
const listen=async server=>{server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;};
async function setup({tool='movy',version='0.34.1-hbclean.289',enabled=true,persistenceSafe=true,announce=true}={}){
 const commands=[],requests=[];
 const upstream=createServer((request,response)=>{requests.push(request.url);response.setHeader('Content-Type','application/json');response.end(JSON.stringify({id:'movy',version,...(persistenceSafe?{browser_transport_v1:{state_read_preserves_dirty:true}}:{})}));});
 const moveAddress=await listen(upstream),wss=new WebSocketServer({server:upstream});
 wss.on('connection',(socket,request)=>{
  requests.push(request.url);socket.on('message',data=>{
   const message=JSON.parse(data.toString());commands.push(message);
   if(message.type==='subscribe_tool'&&announce)socket.send(JSON.stringify({type:'tool_info',id:tool}));
  });
 });
 const reservation=createServer(),origin=await listen(reservation);await new Promise(resolve=>reservation.close(resolve));
 const server=createDeviceServer({siteRoot:new URL('../wasm/build/site/',import.meta.url),moveAddress,origin,pairingKey:enabled?key:null});
 server.listen(new URL(origin).port,'127.0.0.1');await once(server,'listening');
 const clients=[];
 function connect({token=key,requestOrigin=origin,observe=true}={}){
  const socket=new WebSocket(origin.replace('http:','ws:')+'/ws/movy-transport',['hb-movy-v1','hb-key.'+token,...(observe?['hb-movy-status-v1']:[])],{origin:requestOrigin});clients.push(socket);
  const messages=[];socket.on('message',data=>messages.push(JSON.parse(data.toString())));socket.on('error',()=>{});
  return {socket,messages};
 }
 return {origin,commands,requests,wss,connect,async close(){for(const socket of clients)socket.terminate();for(const socket of wss.clients)socket.terminate();server.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>upstream.close(resolve))]);wss.close();}};
}
const until=async check=>{const deadline=Date.now()+3000;while(!check()){if(Date.now()>deadline)throw new Error('Fixture timeout');await delay(5);}};
test('reported transport validates the existing controller shape and removes unrelated content',()=>{
 const state={playing:true,phase:'recording',track:15,slot:7};
 assert.deepEqual(deviceTransportState({...state,footer:'private session',secret:'not forwarded'}),state);
 for(const phase of ['armed','count-in','recording'])assert.deepEqual(deviceTransportState({...state,phase}),{...state,phase});
 assert.deepEqual(deviceTransportState({playing:false,phase:'idle',track:null,slot:null}),{playing:false,phase:'idle',track:null,slot:null});
 assert.deepEqual(deviceTransportState({...state,track:null,slot:null}),{...state,track:null,slot:null},'unknown owner is not invented');
 for(const invalid of [null,[],{},'state',{...state,playing:1},{...state,phase:'unknown'},{...state,track:16},{...state,track:-1},{...state,slot:8},{...state,slot:1.5},{...state,track:null},{...state,phase:'idle'},{...state,phase:'armed',track:null,slot:null}])assert.equal(deviceTransportState(invalid),null);
});
test('paired observer relays only the verified tool snapshot, without new requests or command acknowledgments',async()=>{
 const f=await setup({announce:false});try{
  const {socket,messages}=f.connect();await until(()=>f.commands.length===1);
  const push=value=>{for(const upstream of f.wss.clients)upstream.send(JSON.stringify(value));};
  const state={playing:true,phase:'count-in',track:2,slot:1};
  const update={type:'param_update',slot:0,params:{'overtake_dsp:cloud_ui_state':JSON.stringify({transport:{...state,extra:'secret'},footer:'secret'})}};
  push(update);await delay(20);assert.equal(messages.length,0,'tool identity is required first');
  push({type:'tool_info',id:'movy'});await until(()=>messages.some(message=>message.type==='ready'));
  push({...update,slot:1});push({...update,params:{'other:cloud_ui_state':update.params['overtake_dsp:cloud_ui_state']}});await delay(20);
  assert.equal(messages.filter(message=>message.type==='transport_state').length,0);
  push(update);await until(()=>messages.some(message=>message.type==='transport_state'));
  assert.deepEqual(messages.at(-1),{type:'transport_state',state});assert(!JSON.stringify(messages).includes('secret'));
  for(const raw of ['', '{', 'x'.repeat(4097), JSON.stringify({transport:{...state,track:99}})]){
   const count=messages.length;push({...update,params:{'overtake_dsp:cloud_ui_state':raw}});await until(()=>messages.length>count);
   assert.deepEqual(messages.at(-1),{type:'transport_state',state:null});
  }
  assert.deepEqual(f.commands,[{type:'subscribe_tool'}],'observations add no reads, refetch or writes');
  socket.send(JSON.stringify({type:'transport',action:'play'}));await until(()=>messages.some(message=>message.type==='sent'));
  assert.equal(messages.at(-1).type,'sent');assert.equal(f.commands.length,2);
 }finally{await f.close();}
});
test('explicit future persistence capability plus stock 1.8.2 tool identity and set_param frames; no commands on connect/disconnect/reconnect',async()=>{
 const f=await setup();try{
  const {socket,messages}=f.connect();await until(()=>messages.some(message=>message.type==='ready'));
  assert.deepEqual(f.commands,[{type:'subscribe_tool'}]);
  for(const action of ['play','stop']){
   socket.send(JSON.stringify({type:'transport',action}));await until(()=>messages.some(message=>message.type==='sent'&&message.action===action));
  }
  assert.deepEqual(f.commands.slice(1),['play','stop'].map(value=>({type:'set_param',slot:0,key:'overtake_dsp:cmd',value})));
  assert.deepEqual(f.requests,['/api/remote-ui/module-assets/movy/module.json','/ws/remote-ui']);
  socket.close();await once(socket,'close');await until(()=>f.wss.clients.size===0);
  const again=f.connect();await until(()=>again.messages.some(message=>message.type==='ready'));
  assert.equal(f.commands.filter(message=>message.type==='set_param').length,2);
  for(const upstream of f.wss.clients)upstream.send(JSON.stringify({type:'tool_info',id:''}));
  await until(()=>again.messages.some(message=>message.type==='error'));await until(()=>again.socket.readyState===WebSocket.CLOSED);
 }finally{await f.close();}
});
test('older browser clients keep transport without receiving unsupported optional status frames',async()=>{
 const f=await setup();try{
  const {socket,messages}=f.connect({observe:false});await until(()=>messages.some(message=>message.type==='ready'));
  for(const upstream of f.wss.clients)upstream.send(JSON.stringify({type:'param_update',slot:0,params:{'overtake_dsp:cloud_ui_state':JSON.stringify({transport:{playing:false,phase:'idle',track:null,slot:null}})}}));
  socket.send(JSON.stringify({type:'transport',action:'play'}));await until(()=>messages.some(message=>message.type==='sent'));
  assert.equal(messages.some(message=>message.type==='transport_state'),false);
 }finally{await f.close();}
});
test('read-only default, pairing and exact origin checks reject before contacting Move',async()=>{
 for(const options of [{enabled:false},{token:'b'.repeat(64)},{requestOrigin:'https://unrelated.example'},{requestOrigin:''}]){
  const f=await setup(options);try{const {socket}=f.connect(options);await until(()=>socket.readyState===WebSocket.CLOSED);assert.deepEqual(f.requests,[]);}finally{await f.close();}
 }
});
test('wrong tool, unsupported installed version, arbitrary commands and upstream loss revoke transport',async()=>{
 for(const failure of ['tool','version','persistence','command','loss']){
  const f=await setup({persistenceSafe:failure!=='persistence',tool:failure==='tool'?'other':'movy',version:failure==='version'?'99.0.0':'0.34.0'});
  try{
   const {socket,messages}=f.connect();
   if(['command','loss'].includes(failure)){
    await until(()=>messages.some(message=>message.type==='ready'));
    if(failure==='command')socket.send(JSON.stringify({type:'set_param',key:'cmd',value:'jrec 1 1'}));
    else for(const upstream of f.wss.clients)upstream.terminate();
   }
   await until(()=>messages.some(message=>message.type==='error'));
   assert(!f.commands.some(message=>message.type==='set_param'));
   if(failure==='persistence'){assert.deepEqual(f.commands,[]);assert.equal(f.requests.length,1,'no unsafe tool subscription, only metadata');}
  }finally{await f.close();}
 }
});
test('browser adapter requires handshake, never queues, ignores old messages and closes with mirror',()=>{
 class Socket{
  static instances=[];readyState=1;bufferedAmount=0;sent=[];
  constructor(url,protocols){this.url=url;this.protocols=protocols;Socket.instances.push(this);}
  send(data){this.sent.push(JSON.parse(data));}close(){this.closed=true;}
  emit(message){this.onmessage({data:JSON.stringify(message)});}
 }
 const states=[],observations=[],control=openDeviceControl({url:'https://local.example',key,onState:(...args)=>states.push(args),onObservation:state=>observations.push(state),WebSocketClass:Socket});
 const socket=Socket.instances.at(-1);assert.equal(socket.url,'wss://local.example/ws/movy-transport');
 assert(!control.send('play'));socket.emit({type:'ready',tool:'movy',version:'0.34.0'});
 assert(control.send('play'));assert(!control.send('stop'),'pending request not queued');
 const state={playing:false,phase:'idle',track:null,slot:null};socket.emit({type:'transport_state',state});assert.deepEqual(observations,[state]);
 assert(!control.send('stop'),'a state report does not acknowledge the pending command');
 socket.emit({type:'transport_state',state:{...state,playing:'yes'}});assert.equal(observations.at(-1),null);
 socket.emit({type:'sent',action:'play'});
 assert(control.send('stop'));control.close();const count=states.length;socket.emit({type:'ready',tool:'movy',version:'0.34.0'});
 assert.equal(states.length,count);assert(!control.send('play'));assert(socket.closed);
 const observedCount=observations.length;socket.emit({type:'transport_state',state});assert.equal(observations.length,observedCount);assert.equal(observations.at(-1),null);
 let stream,controlled=0,closed=0;
 class Stream{constructor(){stream=this;}addEventListener(){}close(){}}
 const mirror=openDeviceConnection({url:'http://local',pairingKey:key,EventSourceClass:Stream,onFrame(){},onState(){},openControl:options=>{controlled++;options.onState(true,'ready');return {send:()=>true,close:()=>closed++};}});
 assert.equal(controlled,0);assert(!mirror.transport('play'));
 stream.onmessage({data:JSON.stringify(fixture.screen)});assert.equal(controlled,1);assert(mirror.transport('play'));
 stream.onerror();assert.equal(closed,1);assert(!mirror.transport('play'));mirror.close();
});

test('metadata diagnostic reports eligibility without subscribing or enabling transport',async()=>{
 for(const options of [{enabled:false,persistenceSafe:false},{enabled:false,persistenceSafe:true},{enabled:true,persistenceSafe:true},{version:'99.0.0'}]){
  const f=await setup(options);
  try{
   assert.equal((await fetch(f.origin+'/api/movy-capabilities?address=http://other')).status,400);
   assert.equal((await fetch(f.origin+'/api/movy-capabilities',{headers:{Origin:'https://unrelated.example'}})).status,403);
   assert.equal((await fetch(f.origin+'/api/movy-capabilities',{method:'POST'})).status,405);
   assert.deepEqual(f.requests,[]);
   const report=await checkDeviceCapabilities(f.origin,f.origin);
   assert.match(report,/Host version unknown/);
   assert.match(report,options.version?/not supported/:!options.persistenceSafe?/not advertised/:options.enabled?/eligible/:/companion is read-only/);
   assert.deepEqual(f.requests,['/api/remote-ui/module-assets/movy/module.json']);
   assert.deepEqual(f.commands,[]);assert.equal(f.wss.clients.size,0);
  }finally{await f.close();}
 }
 let reads=0;await assert.rejects(checkDeviceCapabilities('http://move.local','https://trial.example',{fetcher:()=>{reads++;}}),/HTTPS/);assert.equal(reads,0);
 await assert.rejects(checkDeviceCapabilities('http://move.local','http://local',{fetcher:async()=>({ok:true,json:async()=>({schema:1,semantic:true})})}),/Unsupported/);
});
