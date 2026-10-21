import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {Processor} from './processor.mjs';
const root=dirname(fileURLToPath(import.meta.url));
import {trackKey,jointAction,routingKeys,prepareMetadata} from './protocol-policy.mjs';
/** Limited development API; no autosave reads or arbitrary filesystem/loader commands. */
export async function startServer({port=7701,host='127.0.0.1',realtime=true}={}) {
  const metadata=JSON.parse(await readFile(resolve(root,'build/modules/midi_fx/harmonybus/module.json'),'utf8'));
  const {readable,enabledWrites}=prepareMetadata(metadata);
  const watches=new Map();
  const processor=new Processor(resolve(root,'build'));
  await processor.request('snapshot');
  const clients=new Set();let busy=false;let stopped=false;let recent=[];let eventSequence=0;let frameRemainder=0;
  processor.onResult=result=>{for(const packet of result.events)recent.push({sequence:++eventSequence,beat:result.beat,packet});recent=recent.slice(-256)};
  let serial=Promise.resolve();let queued=0;
  const enqueue=action=>{if(queued>=128)return Promise.reject(new Error('Command queue full'));queued++;const result=serial.then(action).finally(()=>queued--);serial=result.catch(()=>{});return result};
  const held=new Map(),physical=new Map(),touches=new Map();let surfaceSerial=0;let controller=null;const clientSerial=new Map();
  async function release(socket) {
    for(const [address,owner] of held.get(socket)??[]) {
      await processor.request('set','surface_events',`${++surfaceSerial},${owner.track},128,${address},${owner.pitch},0,0,-1,0`);
    }
    for(const note of physical.get(socket)??[])await processor.request('midi',`128,${note},0`);
    physical.delete(socket);
    for(const [key,cancel] of touches.get(socket)??[])await processor.request('set',key,cancel);
    touches.delete(socket);
    if(controller===socket) {
      await processor.request('set','cmd','stop');
      await processor.request('set','joint_release','1');
      await processor.request('set','joint_map','off');
      await processor.request('set','joint_links',[0,4,8,12].map(base=>`${base},0,0,0,0,0`).join(';'));
      const released='fo1,'+Array(16).fill(-1).join(',');
      for(let track=0;track<4;track++)await processor.request('set',`ch${track}:midi_fx1:field_outputs_remote`,released);
      controller=null;
    }
    clientSerial.delete(socket);
    held.delete(socket);await processor.request('step',1);
  }
  async function command(message,socket) {
    if(message.type==='set_param') {
      const key=String(message.key??'').replace(/^overtake_dsp:/,''); const value=String(message.value??'');
      if(value.length>1024||/[\r\n\t]/.test(value))throw new Error('Invalid value');
      if(controller && controller!==socket)throw new Error('Another browser owns the controls');
      controller=socket;
      if(routingKeys.has(key)) {
        await processor.request('set',key,value);
      } else if(key==='surface_events') {
        const fields=value.split(',').map(Number);
        if(fields.length!==9||fields.some(value=>!Number.isInteger(value)))throw new Error('Invalid surface event');
        const [serial,track,status,address,pitch,velocity,shift,row,full]=fields;
        if(serial<1||track<0||track>3||![128,144].includes(status)||address<0||address>127||pitch<0||pitch>127||velocity<0||velocity>127||shift!==0||row!==-1||full!==0)throw new Error('Invalid surface event');
        if(serial<=(clientSerial.get(socket)??0))return {type:'ack',requestId:message.id};
        clientSerial.set(socket,serial);
        const notes=held.get(socket)??new Map();held.set(socket,notes);
        if(status===144&&velocity)notes.set(address,{track,pitch});else notes.delete(address);
        fields[0]=++surfaceSerial;
        await processor.request('set',key,fields.join(','));
      } else {
        const match=trackKey.exec(key);
        if(!match||(!enabledWrites.has(match[2])&&!jointAction.test(match[2])))throw new Error('Parameter is not enabled in this host: '+key);
        if(jointAction.test(match[2])) {
          const active=touches.get(socket)??new Map();touches.set(socket,active);
          if(/(?:^|\|)(?:Down|Touch|Knob)/.test(value))active.set(key,(value.includes('|')?value.split('|')[0]+'|':'')+'Cancel');
          else if(/(?:Up|Cancel)/.test(value))active.delete(key);
        }
        await processor.request('set',key,value);
      }
    } else if(message.type==='dev_transport') {
      const action=message.action;
      let command;
      if(action==='play'||action==='stop')command=action;
      else if(action==='record') {
        const {mask,overwrite}=message;
        if(!Number.isInteger(mask)||mask<1||mask>65535||!Number.isInteger(overwrite)||overwrite<0||overwrite>65535||(overwrite&mask)!==overwrite)throw new Error('Invalid recording masks');
        command=`jrec ${mask} ${overwrite}`;
      } else throw new Error('Invalid transport action');
      if(controller&&controller!==socket)throw new Error('Another browser owns the controls');
      controller=socket;
      await processor.request('set','cmd',command);
    } else if(message.type==='dev_midi') {
      const data=message.data;
      if(!Array.isArray(data)||data.length!==3||data.some(value=>!Number.isInteger(value))||![128,144,160].includes(data[0])||data[1]<68||data[1]>99||data[2]<0||data[2]>127)throw new Error('Invalid physical pad event');
      if(controller&&controller!==socket)throw new Error('Another browser owns the controls');
      controller=socket;
      const notes=physical.get(socket)??new Set();physical.set(socket,notes);
      if(data[0]===144&&data[2])notes.add(data[1]);else if(data[0]===128||data[0]===144)notes.delete(data[1]);
      await processor.request('midi',data.join(','));
    } else if(message.type==='dev_watch') {
      if(!Array.isArray(message.keys)||message.keys.length>64||message.keys.some(key=>{
        const match=typeof key==='string'&&trackKey.exec(key);
        return !match||!readable.has(match[2]);
      }))throw new Error('Invalid parameter watch');
      watches.set(socket,[...new Set(message.keys)]);
    } else if(message.type==='dev_step') {
      const blocks=Number(message.blocks);if(!Number.isInteger(blocks)||blocks<0||blocks>4096)throw new Error('Invalid block count');
      await processor.request('step',blocks);
    } else if(message.type==='dev_release')await release(socket);
    else if(!['subscribe_tool','refetch_tool','subscribe','get_hierarchy'].includes(message.type))throw new Error('Unsupported message');
    const result=await processor.request('snapshot');
    Object.assign(result.value,(await processor.request('read_many',(watches.get(socket)??[]).join(','))).value);
    return {type:'param_update',slot:0,params:result.value,beat:result.beat,events:recent,requestId:message.id};
  }
  const files={'/joint':['joint.html','text/html'],'/joint.js':['build/joint.js','text/javascript'],'/field':['build/field.html','text/html'],'/field-web.js':['build/field-web.js','text/javascript'],'/movy':['build/movy.html','text/html'],'/movy.js':['build/movy.js','text/javascript'],'/':['index.html','text/html'],'/panel.js':['build/panel.js','text/javascript'],'/static/schwung-remote-api.js':['build/schwung-remote-api.js','text/javascript']};
  const server=http.createServer(async(request,response)=>{
    const pathname=new URL(request.url,'http://local').pathname;
    if(pathname==='/api/dev/module'){response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify(metadata));return}
    const entry=files[pathname];
    if(!entry){response.writeHead(404);response.end();return}
    try{response.writeHead(200,{'Content-Type':entry[1],'Cache-Control':'no-store'});response.end(await readFile(resolve(root,entry[0])))}catch{response.writeHead(500);response.end('Build the local host first')}
  });
  const websockets=new WebSocketServer({noServer:true,maxPayload:4096});
  server.on('upgrade',(request,socket,head)=>{
    if(request.url!=='/ws/remote-ui'||(request.headers.origin&&request.headers.origin!==`http://${request.headers.host}`)){socket.destroy();return}
    websockets.handleUpgrade(request,socket,head,websocket=>websockets.emit('connection',websocket));
  });
  websockets.on('connection',socket=>{
    clients.add(socket);
    socket.on('message',raw=>enqueue(async()=>{try{const result=await command(JSON.parse(String(raw)),socket);if(socket.readyState===1)socket.send(JSON.stringify(result))}catch(error){if(socket.readyState===1)socket.send(JSON.stringify({type:'error',message:error.message}))}}).catch(()=>socket.close(1013,'Command queue full')));
    socket.on('close',()=>{clients.delete(socket);watches.delete(socket);enqueue(()=>release(socket)).catch(error=>console.error(error.message))});
  });
  const timer=setInterval(()=>{
    if(!realtime||busy||stopped||!clients.size)return;
    busy=true;
    enqueue(async()=>{
      frameRemainder+=44100*0.02;const blocks=Math.floor(frameRemainder/128);frameRemainder-=blocks*128;
      await processor.request('step',blocks);
      const result=await processor.request('snapshot');
      const keys=[...new Set([...watches.values()].flat())];
      for(let offset=0;offset<keys.length;offset+=64)Object.assign(result.value,(await processor.request('read_many',keys.slice(offset,offset+64).join(','))).value);
      const message=JSON.stringify({type:'param_update',slot:0,params:result.value,beat:result.beat,events:recent});
      for(const socket of clients)if(socket.readyState===1&&socket.bufferedAmount<65536)socket.send(message);
    }).catch(error=>console.error(error.message)).finally(()=>busy=false);
  },20);
  await new Promise(resolve=>server.listen(port,host,resolve));
  return {port:server.address().port,processor,close:async()=>{stopped=true;clearInterval(timer);await Promise.all([...clients].map(socket=>new Promise(resolve=>{socket.once('close',resolve);socket.close()})));await serial;processor.close();websockets.close();await new Promise(resolve=>server.close(resolve))}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const service=await startServer({port:Number(process.env.PORT??7701),host:process.env.HB_DEV_BIND??'127.0.0.1',realtime:!process.argv.includes('--manual')});
  console.log(`HB local processor: http://127.0.0.1:${service.port}/?tool=1`);
  process.on('SIGINT',async()=>{await service.close();process.exit(0)});
}
