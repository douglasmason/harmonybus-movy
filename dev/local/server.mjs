import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {Processor} from './processor.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const writeKeys=new Set(['travel_map','master_transpose','retrigger_held','chord_mode','chord_timing','quant_timing','pad_preview_inputs','pad_display','pad_pulse_rate']);
/** Limited development API; no autosave reads or arbitrary filesystem/loader commands. */
export async function startServer({port=7701,host='127.0.0.1',realtime=true}={}) {
  const metadata=JSON.parse(await readFile(resolve(root,'build/modules/midi_fx/harmonybus/module.json'),'utf8'));
  const params=metadata.capabilities.chain_params;
  const readable=new Set(params.filter(p=>!p.writeOnly&&p.key!=='state').map(p=>p.key));
  const enabledWrites=new Set([...writeKeys,...params.filter(p=>!p.readOnly&&p.access!=='read'&&!p.writeOnly&&['enum','int','float'].includes(p.type)).map(p=>p.key)]);
  metadata.dev={readable:[...readable],writable:[...enabledWrites]};
  for(const param of params)if(!enabledWrites.has(param.key)){param.readOnly=true;param.access='read';}
  const watches=new Map();
  const processor=new Processor(resolve(root,'build'));
  await processor.request('snapshot');
  const clients=new Set();let busy=false;let stopped=false;let recent=[];let eventSequence=0;let frameRemainder=0;
  processor.onResult=result=>{for(const packet of result.events)recent.push({sequence:++eventSequence,beat:result.beat,packet});recent=recent.slice(-256)};
  let serial=Promise.resolve();let queued=0;
  const enqueue=action=>{if(queued>=128)return Promise.reject(new Error('Command queue full'));queued++;const result=serial.then(action).finally(()=>queued--);serial=result.catch(()=>{});return result};
  const held=new Map();let surfaceSerial=0;let controller=null;const clientSerial=new Map();
  async function release(socket) {
    for(const [address,owner] of held.get(socket)??[]) {
      await processor.request('set','surface_events',`${++surfaceSerial},${owner.track},128,${address},${owner.pitch},0,0,-1,0`);
    }
    if(controller===socket)controller=null;clientSerial.delete(socket);
    held.delete(socket);await processor.request('step',1);
  }
  async function command(message,socket) {
    if(message.type==='set_param') {
      const key=String(message.key??'').replace(/^overtake_dsp:/,''); const value=String(message.value??'');
      if(value.length>1024||/[\r\n\t]/.test(value))throw new Error('Invalid value');
      if(controller && controller!==socket)throw new Error('Another browser owns the controls');
      controller=socket;
      if(key==='surface_events') {
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
        const match=/^ch([0-3]):midi_fx1:(\w+)$/.exec(key);
        if(!match||!enabledWrites.has(match[2]))throw new Error('Parameter is not enabled in this proof');
        await processor.request('set',key,value);
      }
    } else if(message.type==='dev_watch') {
      if(!Array.isArray(message.keys)||message.keys.length>64||message.keys.some(key=>{
        const match=typeof key==='string'&&/^ch([0-3]):midi_fx1:(\w+)$/.exec(key);
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
  const files={'/movy':['build/movy.html','text/html'],'/movy.js':['build/movy.js','text/javascript'],'/':['index.html','text/html'],'/panel.js':['build/panel.js','text/javascript'],'/static/schwung-remote-api.js':['build/schwung-remote-api.js','text/javascript']};
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
