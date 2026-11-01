/** Fixed, opt-in companion boundary. Upstream uses only stock Schwung messages. */
import {timingSafeEqual} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {WebSocket,WebSocketServer} from 'ws';
import {deviceTransportMessage} from './move-transport.mjs';

export function moduleInfo(address){
 return new Promise((resolve,reject)=>{
  const url=new URL('/api/remote-ui/module-assets/movy/module.json',address);
  const request=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{headers:{Accept:'application/json'}},response=>{
   let body='';response.setEncoding('utf8');
   response.on('data',chunk=>{body+=chunk;if(body.length>16384)request.destroy(new Error('Oversized module metadata'));});
   response.on('error',reject);
   response.on('end',()=>{
    try{
     if(response.statusCode!==200)throw new Error('Installed Movy metadata unavailable');
     const info=JSON.parse(body);
     if(info?.id!=='movy'||typeof info.version!=='string'||info.version.length>80)throw new Error('Installed Movy metadata unavailable');
     resolve(info);
    }catch(error){reject(error);}
   });
  });
  request.setTimeout(5000,()=>request.destroy(new Error('Move metadata timed out')));
  request.on('error',reject);request.end();
 });
}
export const supportedModule=info=>/^0\.34\.(?:0|1-hbclean\.\d+)$/.test(info.version);
export function attachTransport(server,{origin,allowedOrigin,moveAddress,pairingKey}){
 if(!/^[a-f0-9]{64}$/.test(pairingKey))throw new Error('Invalid companion pairing key');
 const host=new URL(origin).host;
 const wsServer=new WebSocketServer({noServer:true,maxPayload:256,handleProtocols:()=> 'hb-movy-v1'});
 server.on('upgrade',(request,socket,head)=>{
  const protocols=(request.headers['sec-websocket-protocol']||'').split(',').map(value=>value.trim());
  const key=protocols.find(value=>value.startsWith('hb-key.'))?.slice(7)||'';
  const authorized=/^[a-f0-9]{64}$/.test(key)&&timingSafeEqual(Buffer.from(key),Buffer.from(pairingKey));
  if(request.url!=='/ws/movy-transport'||request.headers.host!==host||![origin,allowedOrigin].filter(Boolean).includes(request.headers.origin)||!authorized||!protocols.includes('hb-movy-v1')||wsServer.clients.size){
   socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
  }
  wsServer.handleUpgrade(request,socket,head,client=>wsServer.emit('connection',client));
 });
 wsServer.on('connection',client=>{
  let upstream,closed=false,ready=false,alive=true,clientAlive=true,info,timer;
  const send=message=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(message));};
  const finish=message=>{
   if(closed)return;closed=true;ready=false;clearInterval(timer);clearTimeout(handshake);
   if(message)send({type:'error',message});client.close();upstream?.terminate();
  };
  const handshake=setTimeout(()=>finish('Move transport handshake timed out'),6000);
  client.on('pong',()=>{clientAlive=true;});
  client.on('close',()=>finish());client.on('error',()=>finish());
  client.on('message',(data,isBinary)=>{
   try{
    const message=JSON.parse(data.toString());
    if(isBinary||Object.keys(message).sort().join(',')!=='action,type'||message.type!=='transport')throw new Error('Unsupported companion command');
    const command=deviceTransportMessage(message.action);
    if(!ready||closed||upstream.readyState!==WebSocket.OPEN||upstream.bufferedAmount)throw new Error('Transport is not ready; no command queued');
    upstream.send(JSON.stringify(command),error=>{if(error)finish('Move write failed');else if(!closed)send({type:'sent',action:message.action});});
   }catch(error){finish(error.message);}
  });
  moduleInfo(moveAddress).then(metadata=>{
   if(closed)return;info=metadata;
   if(!supportedModule(info))throw new Error('Installed Movy version is not supported by this transport adapter');
   // Stock subscribe_tool reads state and can consume the autosave dirty flag.
   if(info.browser_transport_v1?.state_read_preserves_dirty!==true)throw new Error('This Movy build lacks a persistence-safe remote subscription. Screen remains read-only.');
   const url=new URL('/ws/remote-ui',moveAddress);url.protocol=url.protocol==='https:'?'wss:':'ws:';
   upstream=new WebSocket(url,{maxPayload:1024*1024,handshakeTimeout:5000,followRedirects:false});
   upstream.on('open',()=>upstream.send(JSON.stringify({type:'subscribe_tool'})));
   upstream.on('pong',()=>{alive=true;});
   upstream.on('error',()=>finish('Move transport unavailable'));
   upstream.on('close',()=>finish('Move transport disconnected'));
   upstream.on('message',(data,isBinary)=>{
    if(closed)return;
    try{
     if(isBinary)throw new Error('Unexpected Move transport response');
     const message=JSON.parse(data.toString());
     if(message.type==='tool_info'){
      if(message.id!=='movy')throw new Error('Open Movy on Move, then reconnect');
      if(!ready){
       ready=true;clearTimeout(handshake);send({type:'ready',tool:'movy',version:info.version});
       timer=setInterval(()=>{if(!alive||!clientAlive){finish('Transport heartbeat lost');client.terminate();return;}alive=false;clientAlive=false;upstream.ping();client.ping();send({type:'heartbeat'});},2000);
      }
     }else if(message.type==='error')throw new Error('Move rejected the transport request');
     // custom_ui and param_update are not semantic Movy state. Do not synthesize any.
    }catch(error){finish(error.message);}
   });
  }).catch(error=>finish(error.message));
 });
 server.on('close',()=>{for(const client of wsServer.clients)client.terminate();wsServer.close();});
 return wsServer;
}
