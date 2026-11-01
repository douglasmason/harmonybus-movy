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
import {companionOptions} from './companion-start.mjs';
import {serve} from '../wasm/serve.mjs';
test('portable launcher requires an explicit private bind and has no write option',()=>{
 assert.equal(companionOptions([]).host,'127.0.0.1');
 assert.equal(companionOptions(['--host','192.168.1.2']).origin,'http://192.168.1.2:7703');
 for(const host of ['0.0.0.0','8.8.8.8','localhost','192.168.999.1','172.32.1.1','::'])assert.throws(()=>companionOptions(['--host',host]));
 for(const port of ['80','0','-1','65536','7703/path'])assert.throws(()=>companionOptions(['--port',port]));
 assert.throws(()=>companionOptions(['--enable-transport']));
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
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Companion startup timeout')),10000);let output='';child.stdout.on('data',data=>{output+=data;if(output.includes('Select Engine')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Companion exited '+code+': '+output));});child.stderr.on('data',data=>output+=data);});
 assert.equal(requests,0,'startup never contacts Move');const origin=`http://127.0.0.1:${port}`;
 assert.deepEqual(await (await fetch(origin+'/api/movy-companion')).json(),{schema:1,service:'hb-movy-companion'});assert.equal(requests,0,'identification never contacts Move');
 assert.equal(await (await fetch(origin+'/move/')).text(),await readFile(new URL('move/index.html',site),'utf8'));
 assert.equal((await fetch(origin+'/stream-auto?v=2',{method:'POST'})).status,405);
 assert.equal((await fetch(origin+'/stream-auto?v=2',{headers:{Origin:'https://unrelated.example'}})).status,403);
 assert.equal((await fetch(origin+'/ws/remote-ui')).status,404);assert.equal(requests,0);
 const abort=new AbortController(),response=await fetch(origin+'/stream-auto?v=2',{signal:abort.signal});
 assert.equal(response.status,200);assert(new TextDecoder().decode((await response.body.getReader().read()).value).includes('mono1_packed'));
 abort.abort();await new Promise(resolve=>setTimeout(resolve,50));assert.equal(requests,1);assert(closed,'disconnect closes the upstream stream');
});
