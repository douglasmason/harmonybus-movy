/** Local companion: same packaged UI, fixed mirror, optional paired transport. */
import {createServer as createHTTPServer,request as httpRequest} from 'node:http';
import {createServer as createHTTPSServer,request as httpsRequest} from 'node:https';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {randomBytes} from 'node:crypto';
import {attachTransport} from './move-transport-server.mjs';
import {files} from '../wasm/serve.mjs';
import {deviceStreamURL} from './move-device.mjs';

export function createDeviceServer({siteRoot,moveAddress,origin,allowedOrigin=null,tls=null,pairingKey=null}){
 const publicURL=new URL(origin),upstreamURL=new URL(deviceStreamURL(moveAddress,'http://localhost'));
 if(publicURL.origin!==origin||!['http:','https:'].includes(publicURL.protocol)||publicURL.username||publicURL.password)throw new Error('Specify the companion origin, without a path.');
 if((publicURL.protocol==='https:')!==!!tls)throw new Error('HTTPS requires a certificate and key trusted by the iPad.');
 if(allowedOrigin&&(!tls||new URL(allowedOrigin).origin!==allowedOrigin||!allowedOrigin.startsWith('https://')))throw new Error('An allowed hosted origin requires HTTPS on both sides.');
 const createServer=tls?handler=>createHTTPSServer(tls,handler):createHTTPServer;
 let streams=0;
 const server=createServer(async(request,response)=>{
  const sendError=(status,message)=>{if(!response.headersSent)response.writeHead(status,{'Content-Type':'text/plain'});response.end(message);};
  if(request.headers.host!==publicURL.host){sendError(421,'Unexpected companion host');return;}
  const requester=request.headers.origin;
  if(requester&&requester!==origin&&requester!==allowedOrigin){sendError(403,'Origin not allowed');return;}
  response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Cache-Control','no-store');
  if(request.method!=='GET'){sendError(405,'Read-only companion');return;}
  const url=new URL(request.url,origin),route=url.pathname.replace(/\/$/,'')||'/';
  if(route==='/stream-auto'){
   if(url.search!=='?v=2'){sendError(400,'Unsupported stream request');return;}
   if(streams>=2){sendError(503,'Two mirror connections already open');return;}
   streams++;let ended=false;
   const upstream=(upstreamURL.protocol==='https:'?httpsRequest:httpRequest)(upstreamURL,{method:'GET',headers:{Accept:'text/event-stream'}},incoming=>{
    if(incoming.statusCode!==200||!incoming.headers['content-type']?.startsWith('text/event-stream')){incoming.resume();sendError(502,'Move mirror unavailable');upstream.destroy();return;}
    response.setHeader('Content-Type','text/event-stream');response.setHeader('X-Accel-Buffering','no');
    if(requester===allowedOrigin){response.setHeader('Access-Control-Allow-Origin',allowedOrigin);response.setHeader('Vary','Origin');}
    response.flushHeaders();incoming.pipe(response);
    incoming.on('error',()=>response.destroy());
   });
   upstream.setTimeout(7000,()=>upstream.destroy(new Error('Move stream timed out')));
   upstream.on('error',()=>{if(response.headersSent)response.destroy();else sendError(502,'Cannot reach Move mirror');});
   const cleanup=()=>{if(ended)return;ended=true;streams--;upstream.destroy();};
   response.on('close',cleanup);request.on('aborted',cleanup);upstream.end();return;
  }
  if(!files.has(route)){sendError(404,'Not found');return;}
  const relative=route==='/'?'index.html':['/joint','/move'].includes(route)?route.slice(1)+'/index.html':route.slice(1);
  try{
   const data=await readFile(new URL(relative,siteRoot));
   response.setHeader('Content-Type',relative.endsWith('.wasm')?'application/wasm':/\.(mjs|js)$/.test(relative)?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.json')?'application/json':'text/html');
   response.end(data);
  }catch{sendError(404,'Missing packaged UI. Run node dev/wasm/package.mjs or supply --site.');}
 });
 if(pairingKey)attachTransport(server,{origin,allowedOrigin,moveAddress:upstreamURL.origin,pairingKey});
 else server.on('upgrade',(_request,socket)=>socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'));
 return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const {values}=parseArgs({options:{move:{type:'string'},site:{type:'string'},origin:{type:'string',default:'http://127.0.0.1:7703'},host:{type:'string',default:'127.0.0.1'},'tls-cert':{type:'string'},'tls-key':{type:'string'},'allow-origin':{type:'string'},'enable-transport':{type:'boolean',default:false}}});
 if(!values.move)throw new Error('Supply --move http://move.local:7700 (your existing Schwung Manager address).');
 const tls=values['tls-cert']||values['tls-key']?{cert:await readFile(values['tls-cert']),key:await readFile(values['tls-key'])}:null;
 if(values['enable-transport']&&!/^(?:127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(values.host))throw new Error('Transport requires binding one explicit loopback or private LAN IPv4 address.');
 const pairingKey=values['enable-transport']?randomBytes(32).toString('hex'):null;
 const siteRoot=pathToFileURL(resolve(values.site??'dev/wasm/build/site')+'/');
 const server=createDeviceServer({siteRoot,moveAddress:values.move,origin:values.origin,allowedOrigin:values['allow-origin'],tls,pairingKey});
 const url=new URL(values.origin);
 server.listen(Number(url.port||(tls?443:80)),values.host,()=>{console.log(`Move companion: ${values.origin}/move/ · ${pairingKey?'paired Play/Stop':'read-only'} · choose Move and Connect explicitly`);if(pairingKey)console.log('Pairing key (this launch only): '+pairingKey);});
}
