import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {companionOptions} from './companion-start.mjs';
import {serve} from '../wasm/serve.mjs';
test('portable launcher requires an explicit private bind and explicit transport opt-in',()=>{
 assert.equal(companionOptions([]).host,'127.0.0.1');
 assert.equal(companionOptions(['--host','192.168.1.2']).origin,'http://192.168.1.2:7703');
 for(const host of ['0.0.0.0','8.8.8.8','localhost','192.168.999.1','172.32.1.1','::'])assert.throws(()=>companionOptions(['--host',host]));
 for(const port of ['80','0','-1','65536','7703/path'])assert.throws(()=>companionOptions(['--port',port]));
 assert.equal(companionOptions([])['enable-transport'],false);
 assert.equal(companionOptions(['--enable-transport'])['enable-transport'],true);
 assert.throws(()=>companionOptions(['--pairing-key','persistent-key']));
});
test('extracted archive boots independently, serves identical UI and proxies only an explicit mirror request',async t=>{
 const site=new URL('../wasm/build/site/',import.meta.url),archive=new URL('downloads/move-companion.tar.gz',site);
 const sha=createHash('sha256').update(await readFile(archive)).digest('hex');
 assert.equal((await readFile(new URL('downloads/move-companion.sha256',site),'utf8')).trim(),sha+'  move-companion.tar.gz');
 const website=serve(0,site);await once(website,'listening');t.after(()=>{website.closeAllConnections();website.close();});
 const download=await fetch(`http://127.0.0.1:${website.address().port}/downloads/move-companion.tar.gz`);
 assert.equal(download.status,200);assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),sha);
 const temp=await mkdtemp(join(tmpdir(),'move-companion-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 execFileSync('tar',['-xzf',fileURLToPath(archive),'-C',temp]);const root=join(temp,'move-companion');
 assert.match(execFileSync(process.execPath,['start.mjs','--help'],{cwd:root,encoding:'utf8'}),/YOUR_COMPUTER_LAN_IP/);
 const manifest=JSON.parse(await readFile(join(root,'BUILD.json')));
 for(const [path,hash]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(join(root,path))).digest('hex'),hash,path);
 async function compare(folder,prefix=''){
  for(const entry of await readdir(folder,{withFileTypes:true})){if(entry.name==='downloads')continue;const path=prefix+entry.name;
   if(entry.isDirectory())await compare(new URL(entry.name+'/',folder),path+'/');else assert.deepEqual(await readFile(join(root,'site',path)),await readFile(new URL(entry.name,folder)),path);}
 }
 await compare(site);
 let requests=0,closed=false;
 const fixture=JSON.parse(await readFile(new URL('./fixtures/move-mirror-v1.json',import.meta.url)));
 const upstream=createServer((req,res)=>{requests++;assert.equal(req.url,'/stream-auto?v=2');assert.equal(req.method,'GET');res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: '+JSON.stringify(fixture.screen)+'\n\n');res.on('close',()=>closed=true);});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');t.after(()=>{upstream.closeAllConnections();upstream.close();});
 const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const child=spawn(process.execPath,['start.mjs','--port',String(port),'--move',`http://127.0.0.1:${upstream.address().port}`],{cwd:root,env:{...process.env,NODE_PATH:''},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());
 const startupOutput=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Companion startup timeout')),10000);let output='';child.stdout.on('data',data=>{output+=data;if(output.includes('Select Engine')){clearTimeout(timer);resolve(output);}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Companion exited '+code+': '+output));});child.stderr.on('data',data=>output+=data);});
 assert.equal(requests,0,'startup never contacts Move');const origin=`http://127.0.0.1:${port}`;
 assert(startupOutput.includes(origin+'/move/?engine=move'),'printed entry skips the browser engine');
 assert.deepEqual(await (await fetch(origin+'/api/movy-companion')).json(),{schema:1,service:'hb-movy-companion'});assert.equal(requests,0,'identification never contacts Move');
 assert.equal(await (await fetch(origin+'/move/')).text(),await readFile(new URL('move/index.html',site),'utf8'));
 assert.equal(await (await fetch(origin+'/move/?engine=move')).text(),await readFile(new URL('move/index.html',site),'utf8'));
 assert.equal((await fetch(origin+'/stream-auto?v=2',{method:'POST'})).status,405);
 assert.equal((await fetch(origin+'/stream-auto?v=2',{headers:{Origin:'https://unrelated.example'}})).status,403);
 assert.equal((await fetch(origin+'/ws/remote-ui')).status,404);assert.equal(requests,0);
 const abort=new AbortController(),response=await fetch(origin+'/stream-auto?v=2',{signal:abort.signal});
 assert.equal(response.status,200);assert(new TextDecoder().decode((await response.body.getReader().read()).value).includes('mono1_packed'));
 abort.abort();await new Promise(resolve=>setTimeout(resolve,50));assert.equal(requests,1);assert(closed,'disconnect closes the upstream stream');
});

const until=async check=>{const deadline=Date.now()+5000;while(!check()){if(Date.now()>deadline)throw new Error('Portable companion fixture timeout');await new Promise(resolve=>setTimeout(resolve,5));}};
test('extracted launcher pairs only by opt-in, forwards Play/Stop, rotates keys and rejects legacy builds',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'move-companion-pairing-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 execFileSync('tar',['-xzf',fileURLToPath(new URL('../wasm/build/site/downloads/move-companion.tar.gz',import.meta.url)),'-C',temp]);
 const root=join(temp,'move-companion'),requests=[],commands=[],children=[],clients=[];
 const help=execFileSync(process.execPath,['start.mjs','--enable-transport','--help'],{cwd:root,encoding:'utf8'});
 assert.match(help,/--enable-transport/);assert.doesNotMatch(help,/Pairing key: [a-f0-9]{64}/);
 let persistenceSafe=true;
 const upstream=createServer((request,response)=>{
  requests.push(request.url);assert.equal(request.url,'/api/remote-ui/module-assets/movy/module.json');
  response.setHeader('Content-Type','application/json');
  response.end(JSON.stringify({id:'movy',version:persistenceSafe?'0.34.1-hbclean.320':'0.34.1-hbclean.319',...(persistenceSafe?{browser_transport_v1:{state_read_preserves_dirty:true}}:{})}));
 });
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 const wss=new WebSocketServer({server:upstream});
 wss.on('connection',(socket,request)=>{
  requests.push(request.url);socket.on('message',data=>{
   const message=JSON.parse(data.toString());commands.push(message);
   if(message.type==='subscribe_tool')socket.send(JSON.stringify({type:'tool_info',id:'movy'}));
  });
 });
 async function stop(child){if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited;}}
 t.after(async()=>{for(const socket of clients)socket.terminate();for(const child of children)await stop(child);for(const socket of wss.clients)socket.terminate();wss.close();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));});
 async function launch(enabled){
  const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const child=spawn(process.execPath,['start.mjs','--port',String(port),'--move',`http://127.0.0.1:${upstream.address().port}`,...(enabled?['--enable-transport']:[])],{cwd:root,env:{...process.env,NODE_PATH:''},stdio:['ignore','pipe','pipe']});
  children.push(child);let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  await until(()=>{assert.equal(child.exitCode,null,output);return output.includes('Use the hosted HTTPS trial');});
  const keys=[...output.matchAll(/Pairing key: ([a-f0-9]{64})/g)];assert.equal(keys.length,enabled?1:0);
  return {child,origin:`http://127.0.0.1:${port}`,key:keys[0]?.[1]};
 }
 function connect(server,key=server.key){
  const socket=new WebSocket(server.origin.replace('http:','ws:')+'/ws/movy-transport',['hb-movy-v1','hb-key.'+key],{origin:server.origin});clients.push(socket);
  const messages=[];socket.on('message',data=>messages.push(JSON.parse(data.toString())));socket.on('error',()=>{});return {socket,messages};
 }
 const readOnly=await launch(false);assert.deepEqual(requests,[],'startup never contacts Move');
 const rejected=connect(readOnly,'a'.repeat(64));await until(()=>rejected.socket.readyState===WebSocket.CLOSED);
 assert.deepEqual(requests,[],'read-only archive has no control route');await stop(readOnly.child);
 const paired=await launch(true);assert.deepEqual(requests,[],'transport opt-in does not connect');
 assert.deepEqual(await (await fetch(paired.origin+'/api/movy-companion')).json(),{schema:1,service:'hb-movy-companion'});
 assert.deepEqual(requests,[],'identity never discloses key or contacts Move');
 const first=connect(paired);await until(()=>first.messages.some(message=>message.type==='ready'));
 assert.deepEqual(commands,[{type:'subscribe_tool'}],'pairing does not start playback');
 for(const action of ['play','stop']){first.socket.send(JSON.stringify({type:'transport',action}));await until(()=>first.messages.some(message=>message.type==='sent'&&message.action===action));}
 assert.deepEqual(commands.slice(1),['play','stop'].map(value=>({type:'set_param',slot:0,key:'overtake_dsp:cmd',value})));
 first.socket.send(JSON.stringify({type:'set_param',key:'cmd',value:'jrec 1 1'}));await until(()=>first.socket.readyState===WebSocket.CLOSED);
 assert.equal(commands.length,3,'arbitrary writes are not forwarded');await stop(paired.child);
 const restarted=await launch(true);assert.notEqual(restarted.key,paired.key,'each process generates a fresh key');
 const requestCount=requests.length,oldKey=connect(restarted,paired.key);await until(()=>oldKey.socket.readyState===WebSocket.CLOSED);assert.equal(requests.length,requestCount,'old key rejected before metadata');
 persistenceSafe=false;
 const legacy=connect(restarted);await until(()=>legacy.socket.readyState===WebSocket.CLOSED);
 assert(legacy.messages.some(message=>message.type==='error'));
 assert.deepEqual(requests.slice(requestCount),['/api/remote-ui/module-assets/movy/module.json'],'legacy build rejected before subscription');
 assert.equal(commands.length,3,'no command replay after restart');
 const manifest=JSON.parse(await readFile(join(root,'BUILD.json')));
 for(const [path,hash]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(join(root,path))).digest('hex'),hash,'launch never persists pairing key: '+path);
});
