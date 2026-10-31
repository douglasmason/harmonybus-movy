/** CI: one real Worker, canonical editors, recomposition and source-derived Move SSE. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {chromium} from '../../local/node_modules/playwright/index.mjs';
import {createDeviceServer} from '../../local/move-device-server.mjs';
import {WebSocketServer} from '../../local/node_modules/ws/wrapper.mjs';
import {createFullEngine} from './engine.mjs';
const physicalFixture=await createFullEngine(),commands=[],pairingKey='b'.repeat(64);
physicalFixture.request('set','joint_map',Array(32).fill('0,60,-1,0').join(';'));
const fixture=JSON.parse(await readFile(new URL('../../local/fixtures/move-mirror-v1.json',import.meta.url)));
const clients=new Set();let connections=0,persistenceSafe=false;
const move=createServer((request,response)=>{
 if(request.url==='/api/remote-ui/module-assets/movy/module.json'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({id:'movy',version:'0.34.0',...(persistenceSafe?{browser_transport_v1:{state_read_preserves_dirty:true}}:{})}));return;}
 assert.equal(request.url,'/stream-auto?v=2');assert.equal(request.method,'GET');connections++;
 response.writeHead(200,{'Content-Type':'text/event-stream','Access-Control-Allow-Origin':'*'});clients.add(response);
 response.write('data: '+JSON.stringify(fixture.screen)+'\n\nevent: surface\ndata: '+JSON.stringify(fixture.surface)+'\n\n');
 const timer=setInterval(()=>response.write('event: hb\ndata: '+JSON.stringify(fixture.heartbeat)+'\n\n'),500);
 response.on('close',()=>{clearInterval(timer);clients.delete(response);});
}).listen(0,'127.0.0.1');await once(move,'listening');
const moveWS=new WebSocketServer({server:move});
moveWS.on('connection',(socket,request)=>{
 assert.equal(request.url,'/ws/remote-ui');
 socket.on('message',data=>{
  const message=JSON.parse(data.toString());commands.push(message);
  if(message.type==='subscribe_tool'){
   // Current Manager seeds state, which consumes the current DSP's save flag.
   if(!persistenceSafe)physicalFixture.request('get','state');
   socket.send(JSON.stringify({type:'tool_info',id:'movy'}));
  }
  else{assert.equal(message.type,'set_param');assert.equal(message.key,'overtake_dsp:cmd');physicalFixture.request('set','cmd',message.value);}
 });
});
const reservation=createServer().listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const origin=`http://127.0.0.1:${port}`,site=createDeviceServer({siteRoot:new URL('../build/site/',import.meta.url),moveAddress:`http://127.0.0.1:${move.address().port}`,origin,pairingKey});
site.listen(port,'127.0.0.1');await once(site,'listening');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let page;
try{
 page=await browser.newPage({viewport:{width:1024,height:768}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/joint/?view=field');await page.waitForURL('**/move/?view=field');
 await page.waitForFunction(()=>!document.querySelector('#engine').disabled);
 await page.locator('[data-workspace=field] #status').filter({hasText:'Connected'}).waitFor();
 await page.locator('#workspace-options summary').click();
 for(const name of ['choices','song','lights'])await page.locator(`[data-show-component=${name}]`).check();
 await page.locator('#song-scenes button').first().waitFor();assert.equal(await page.locator('#song-scenes button').count(),8);
 await page.locator('[data-workspace=choices] #choice-status').filter({hasText:'Record user motifs'}).waitFor();
 // A real Field slider changes the selected HB instance. Reordering keeps its root.
 const slider=page.locator('[data-workspace=field] .slider').first();
 await page.locator('[data-workspace=field] #override').selectOption('1');
 await page.waitForFunction(async()=>await __wasmRead('ch0:midi_fx1:field_override')==='1');
 await slider.press('ArrowRight');
 await page.waitForFunction(async()=>(Number((await __wasmRead('ch0:midi_fx1:field_outputs_view2')).split(',')[53])&1)===1);
 await page.locator('[data-workspace=field] #release').click();
 await page.locator('[data-workspace=field]').evaluate(node=>{node.dataset.identity='retained';});
 await page.getByRole('button',{name:'Move up · Field outputs',exact:true}).click();
 assert.equal(await page.locator('[data-workspace=field]').getAttribute('data-identity'),'retained');
 await page.locator('#workspace-layout').selectOption('columns');
 await page.locator('#component-track').selectOption('3');
 await page.locator('[data-workspace=field]').getByText('Sample Spread',{exact:true}).click();
 await page.locator('[data-workspace=field] #field_randomness').fill('42');await page.locator('[data-workspace=field] #field_randomness').press('Enter');await page.locator('[data-workspace=field] #field_randomness').press('Tab');
 await page.waitForFunction(async()=>await __wasmRead('ch3:midi_fx1:field_randomness')==='42');
 assert.equal(await page.evaluate(()=>__wasmRead('ch0:midi_fx1:field_randomness')),'42','Field placement is engine-global, as declared by HarmonyBus');
 await page.locator('#song-build').click();await page.waitForFunction(()=>document.querySelector('#song-build').getAttribute('aria-pressed')==='true');
 await page.getByRole('button',{name:'Scene 1',exact:true}).click();await page.getByRole('button',{name:'Scene 2',exact:true}).click();
 await page.getByRole('button',{name:'Loop',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#song-build').getAttribute('aria-pressed')==='false');
 await page.waitForFunction(()=>document.querySelector('#song-summary').textContent.includes('2 scene selections'));
 await page.locator('#song-edit').click();await page.waitForFunction(()=>document.querySelector('#play-mode').value==='3');
 await page.locator('#sessions summary').click();await page.locator('#session-save').click();
 await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('Saved')&&!document.querySelector('#session-save').disabled);
 const savedState=await page.evaluate(()=>__wasmRead('state'));
 // Release a held modifier before suspending the browser. No physical connection occurs on selection.
 await page.locator('#shift').check();await page.waitForFunction(async()=>(await __wasmStats()).move.held>0);
 await page.locator('#engine').selectOption('move');await page.waitForFunction(()=>document.querySelector('#engine-status').dataset.state==='disconnected');
 assert.equal(connections,0);assert(!(await page.locator('#shift').isChecked()));
 await page.waitForFunction(()=>document.querySelector('#hero').hidden===false&&[...document.querySelectorAll('.knob-name')].every(node=>!node.textContent));
 assert(!(await page.locator('[data-workspace=field] .component-content').isVisible()));
 assert(await page.getByRole('button',{name:'Pad 1',exact:true}).isDisabled());
 const stopped=await page.evaluate(()=>__wasmStats());await page.waitForTimeout(300);assert.equal((await page.evaluate(()=>__wasmStats())).blocksProcessed,stopped.blocksProcessed);
 await page.locator('#move-address').fill(origin);await page.locator('#move-connect').click();
 await page.waitForFunction(()=>document.querySelector('#engine-status').textContent.includes('screen & LEDs'));
 await page.waitForFunction(()=>document.querySelector('[aria-label="Pad 1"]').dataset.deviceHeld==='true');
 assert.equal(connections,1);assert.equal(await page.locator('#display-sharp').isDisabled(),true);
 assert.equal(await page.locator('#hero').evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,1,1).data[0]),255);
 for(const client of clients)client.destroy();await page.waitForFunction(()=>document.querySelector('#engine-status').dataset.state==='disconnected');
 await page.waitForTimeout(400);assert.equal(connections,1,'loss never silently reconnects');
 await page.locator('#move-connect').click();await page.waitForFunction(()=>document.querySelector('#engine-status').dataset.state==='connected');assert.equal(connections,2);
 await page.locator('#move-disconnect').click();await page.waitForFunction(()=>document.querySelector('#engine-status').dataset.state==='disconnected');
 // Actual companion + source-derived stock WS frames driving a separate production DSP fixture.
 physicalFixture.request('set','cmd','bpm 12000');
 assert.match(physicalFixture.request('get','status').value,/dirty=1/);
 await page.locator('#move-transport-enabled').check();
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:850});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Move connection controls fit the viewport');}
 await page.setViewportSize({width:1024,height:768});await page.locator('#move-pairing-key').fill(pairingKey);await page.locator('#move-connect').click();
 // Current installed metadata must fail BEFORE subscribe_tool can read state.
 await page.waitForFunction(()=>document.querySelector('#move-transport-status').textContent.includes('persistence-safe'));
 assert.equal(commands.length,0);assert.match(physicalFixture.request('get','status').value,/dirty=1/,'rejected subscription preserves pending autosave');assert(await page.locator('[data-move-transport=play]').isDisabled());
 await page.locator('#move-disconnect').click();
 // Future capability fixture only; production commands below still reach the real DSP.
 persistenceSafe=true;
 await page.locator('#move-pairing-key').fill(pairingKey);await page.locator('#move-connect').click();
 await page.waitForFunction(()=>!document.querySelector('[data-move-transport=play]').disabled);
 assert.equal(await page.locator('#move-pairing-key').inputValue(),'');assert.equal(commands.length,1,'capable fixture connects with a subscription only');
 physicalFixture.request('set','cmd','jrec 1 1');physicalFixture.request('step',1200);
 physicalFixture.request('midi','144,68,100');physicalFixture.request('step',64);physicalFixture.request('midi','128,68,0');
 await page.locator('[data-move-transport=stop]').click();await page.waitForFunction(()=>document.querySelector('#move-transport-status').textContent.includes('Stop request sent'));
 assert.match(physicalFixture.request('get','status').value,/rec=0/);assert.match(physicalFixture.request('get','status').value,/play=0/);
 await page.locator('[data-move-transport=play]').click();await page.waitForFunction(()=>document.querySelector('#move-transport-status').textContent.includes('Play request sent'));
 assert.match(physicalFixture.request('get','status').value,/play=1/);
 assert(physicalFixture.request('step',1500).events.some(packet=>(packet[1]&240)===144&&packet[2]===60&&packet[3]>0),'remote Play replays the production recording');
 assert(await page.getByRole('button',{name:'Pad 1',exact:true}).isDisabled());
 for(const socket of moveWS.clients)socket.terminate();await page.waitForFunction(()=>document.querySelector('[data-move-transport=play]').disabled);
 const sent=commands.length;await page.waitForTimeout(300);assert.equal(commands.length,sent,'transport loss never reconnects or replays');
 await page.locator('#move-disconnect').click();assert.match(physicalFixture.request('get','status').value,/play=1/,'disconnect does not stop the device');
 physicalFixture.request('set','cmd','stop');
 await page.locator('#engine').selectOption('browser');await page.waitForFunction(()=>!document.querySelector('[aria-label="Pad 1"]').disabled);
 assert.equal(await page.evaluate(()=>__wasmRead('state')),savedState,'device mirror never overwrites the browser session');
 assert.equal(await page.locator('#audio').getAttribute('aria-pressed'),'false');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('restored'));
 assert.equal(await page.locator('#workspace-layout').inputValue(),'columns');assert.equal(await page.locator('#component-track').inputValue(),'3');
 for(const name of ['field','choices','song','lights'])assert(await page.locator(`[data-workspace=${name}]`).isVisible());
 assert.equal(await page.locator('[data-workspace]').evaluateAll(nodes=>nodes.map(node=>node.dataset.workspace).indexOf('field')),1);
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:850});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 assert.deepEqual(errors,[]);console.log('Unified workspace: shared edits, composition, Song, persistence, live mirror, persistence capability refusal, authenticated future-capability fixture transport, real DSP record/replay, loss, reconnect and engine ownership pass');
}catch(error){if(page)console.error(await page.locator('#error').textContent(),await page.locator('#engine-status').textContent());throw error;}
finally{await browser.close();for(const socket of moveWS.clients)socket.terminate();moveWS.close();physicalFixture.dispose();for(const client of clients)client.destroy();site.closeAllConnections();move.closeAllConnections();await Promise.all([new Promise(resolve=>site.close(resolve)),new Promise(resolve=>move.close(resolve))]);}
