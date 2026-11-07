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
const installedMetadata=JSON.parse(await readFile(new URL('../build/full/modules/movy/module.json',import.meta.url)));
assert.equal(installedMetadata.browser_transport_v1?.state_read_preserves_dirty,true);
const clients=new Set();let connections=0,metadataRequests=0,persistenceSafe=false;
const move=createServer((request,response)=>{
 if(request.url==='/api/remote-ui/module-assets/movy/module.json'){metadataRequests++;response.setHeader('Content-Type','application/json');response.end(JSON.stringify({...installedMetadata,...(persistenceSafe?{}:{browser_transport_v1:undefined})}));return;}
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
   // Stock Manager reads state on subscription and later polls it.
   for(let index=0;index<5;index++)physicalFixture.request('get','state');
   assert.match(physicalFixture.request('get','status').value,/dirty=1/,'real observer preserves autosave');
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
 const sharedContext=await browser.newContext({viewport:{width:1024,height:768}});
 page=await sharedContext.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 async function downloadReport(){
  const before={connections,commands:commands.length,metadataRequests};
  const pending=page.waitForEvent('download');await page.locator('#move-report').click();const download=await pending;
  assert.equal(download.suggestedFilename(),'hb-movy-connection-report.json');
  const text=await readFile(await download.path(),'utf8'),report=JSON.parse(text);
  assert.equal(report.schema,1);assert.equal(report.type,'hb-movy-connection-report');
  assert.deepEqual({connections,commands:commands.length,metadataRequests},before,'export is passive');
  for(const privateValue of [origin,pairingKey,fixture.screen.data])assert(!text.includes(privateValue),'report excludes private connection content');
  assert.equal(report.limits.hostVersion,null);assert.equal(report.limits.deviceExecutionConfirmed,false);
  return report;
 }
 await page.addInitScript(()=>{
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.testEngineWorker=this;}};
 });
 await page.goto(origin+'/joint/?view=field');await page.waitForURL('**/move/?view=field');
 await page.waitForFunction(()=>!document.querySelector('#engine').disabled);
 await page.waitForFunction(expected=>document.querySelector('#move-address').value===expected,origin);
 assert.equal(connections,0);assert.equal(commands.length,0,'autofill never contacts Move');
 assert.equal(await page.locator('#engine').inputValue(),'browser');
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
 // Global cancellation must reach the canonical editor, not just physical Move inputs.
 // Dispatch at the document so the field slider's own Escape handler cannot mask the gap.
 await slider.focus();await page.keyboard.down('ArrowRight');
 await page.locator('#workspace-layout').selectOption('columns');
 assert.equal(await page.locator('#workspace-layout').inputValue(),'stack','held editor blocks recomposition');
 await page.getByRole('button',{name:'Enlarge · Field outputs',exact:true}).evaluate(node=>node.click());
 assert(!(await page.locator('#display-dialog').evaluate(node=>node.open)),'held editor blocks reparenting into the enlarged workspace');
 await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 await page.locator('#workspace-layout').selectOption('columns');
 assert.equal(await page.locator('#workspace-layout').inputValue(),'columns','global Escape releases the editor owner');
 await page.waitForTimeout(550); // Past the canonical editor's 400ms hold refresh.
 await page.keyboard.up('ArrowRight');
 assert.equal(Number((await page.evaluate(()=>__wasmRead('ch0:midi_fx1:field_outputs_view2'))).split(',')[53]),0,'late key-up cannot latch a cancelled gesture');

 await page.locator('[data-workspace=field]').evaluate(node=>{node.dataset.identity='retained';});
 await page.getByRole('button',{name:'Move up · Field outputs',exact:true}).click();
 assert.equal(await page.locator('[data-workspace=field]').getAttribute('data-identity'),'retained');
 await page.locator('#workspace-layout').selectOption('columns');
 await page.locator('#component-track').selectOption('3');
 await page.locator('[data-workspace=field]').getByText('Sample Spread',{exact:true}).click();
 await page.locator('[data-workspace=field] #field_randomness').fill('42');await page.locator('[data-workspace=field] #field_randomness').press('Enter');await page.locator('[data-workspace=field] #field_randomness').press('Tab');
 await page.waitForFunction(async()=>await __wasmRead('ch3:midi_fx1:field_randomness')==='42');
 assert.equal(await page.evaluate(()=>__wasmRead('ch0:midi_fx1:field_randomness')),'42','Field placement is engine-global, as declared by HarmonyBus');
 // Every component can enter the same enlarged workspace even with the Move display hidden.
 await page.locator('[data-show-component=controls]').uncheck();
 const labels={field:'Field outputs',choices:'Motif probabilities',song:'Scenes & Song',lights:'Lighting preview'};
 await page.locator('[data-workspace=field] .component-content').evaluate(node=>{window.testFieldRoot=node.shadowRoot;});
 for(const [name,label] of Object.entries(labels)){
  const entry=page.getByRole('button',{name:`Enlarge · ${label}`,exact:true});
  await entry.click();
  assert(await page.locator('#display-dialog').evaluate(node=>node.open));
  assert(await page.locator(`#display-dialog [data-workspace=${name}]`).evaluate(node=>document.activeElement===node));
  assert.equal(await page.locator('#display-dialog [data-workspace=field] .component-content').evaluate(node=>node.shadowRoot===window.testFieldRoot),true,'canonical editor root is retained');
  assert.equal(await page.locator('#workspace').getAttribute('data-layout'),'columns','enlargement never overwrites the saved layout');
  if(name==='field'){
   await page.locator('[data-workspace=field] #field_randomness').fill('43');await page.locator('[data-workspace=field] #field_randomness').press('Tab');
   await page.waitForFunction(async()=>await __wasmRead('ch3:midi_fx1:field_randomness')==='43');
  }
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:850});assert(await page.locator('#display-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1));}
  await page.getByRole('button',{name:'Close large display',exact:true}).click();
  await page.waitForFunction(label=>document.activeElement?.getAttribute('aria-label')===`Enlarge · ${label}`,label);
 }
 await page.setViewportSize({width:1024,height:768});
 assert.equal(await page.locator('body > main [data-workspace=field]').getAttribute('data-identity'),'retained');
 await page.locator('[data-show-component=controls]').check();
 await page.locator('#song-build').click();await page.waitForFunction(()=>document.querySelector('#song-build').getAttribute('aria-pressed')==='true');
 await page.getByRole('button',{name:'Scene 1',exact:true}).click();await page.getByRole('button',{name:'Scene 2',exact:true}).click();
 await page.getByRole('button',{name:'Loop',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#song-build').getAttribute('aria-pressed')==='false');
 await page.waitForFunction(()=>document.querySelector('#song-summary').textContent.includes('2 scene selections'));
 await page.locator('#song-edit').click();await page.waitForFunction(()=>document.querySelector('#play-mode').value==='3');
 await page.locator('#sessions summary').click();await page.locator('#session-save').click();
 await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('Saved')&&!document.querySelector('#session-save').disabled);
 const savedState=await page.evaluate(()=>__wasmRead('persistent_state'));
 // One theme crosses component shadow roots, engine modes and reparented editor.
 const originalLED=await page.getByRole('button',{name:'Pad 1',exact:true}).getAttribute('style');
 await page.locator('#appearance summary').click();
 assert(await page.locator('#appearance-neutral').isChecked());
 assert.equal(await page.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(0, 0, 0)');
 await page.locator('#appearance-neutral').uncheck();
 const wheel=await page.locator('#appearance-wheel').boundingBox();
 await page.mouse.click(wheel.x+wheel.width*.25,wheel.y+wheel.height*.067);
 const selectedHue=Number(await page.locator('#appearance-hue').inputValue());assert(Math.abs(selectedHue-240)<3);
 await page.locator('#appearance-saturation').press('End');await page.locator('#appearance-brightness').press('End');
 assert.equal(await page.locator('#appearance-brightness').inputValue(),'100');
 const themeBackground=await page.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor);
 assert.equal(await page.locator('body').evaluate(node=>getComputedStyle(node).color),'rgb(0, 0, 0)');
 assert.equal(await page.locator('[data-workspace=field] .component-content').evaluate(node=>getComputedStyle(node).backgroundColor),await page.locator('.accompaniment').evaluate(node=>getComputedStyle(node).backgroundColor));
 assert.equal(await page.getByRole('button',{name:'Pad 1',exact:true}).getAttribute('style'),originalLED,'theme does not recolor musical LEDs');
 assert.equal(await page.evaluate(()=>__wasmRead('persistent_state')),savedState,'appearance does not edit musical state');
 await page.locator('#appearance').evaluate(node=>node.dataset.identity='same-theme');
 await page.locator('#display-expand').click();
 assert.equal(await page.locator('#display-dialog #appearance').getAttribute('data-identity'),'same-theme');
 assert.equal(await page.locator('#display-dialog').evaluate(node=>getComputedStyle(node).backgroundColor),themeBackground);
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:850});assert(await page.locator('#display-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1));}
 await page.getByRole('button',{name:'Close large display',exact:true}).click();
 await page.setViewportSize({width:1024,height:768});await page.locator('#appearance summary').click();
 // Release a held modifier before suspending the browser. No physical connection occurs on selection.
 await page.locator('#shift').check();await page.waitForFunction(async()=>(await __wasmStats()).move.held>0);
 await page.locator('#engine').selectOption('move');await page.waitForFunction(()=>document.querySelector('#engine-status').dataset.state==='disconnected');
 assert.equal(await page.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor),themeBackground);
 assert.equal(connections,0);assert(!(await page.locator('#shift').isChecked()));
 await page.waitForFunction(()=>document.querySelector('#hero').hidden===false&&[...document.querySelectorAll('.knob-name')].every(node=>!node.textContent));
 assert(!(await page.locator('[data-workspace=field] .component-content').isVisible()));
 assert(await page.getByRole('button',{name:'Pad 1',exact:true}).isDisabled());
 const stopped=await page.evaluate(()=>__wasmStats());await page.waitForTimeout(300);assert.equal((await page.evaluate(()=>__wasmStats())).blocksProcessed,stopped.blocksProcessed);
 assert.equal(await page.locator('#move-address').inputValue(),origin,'companion endpoint is ready without typing');
 const initialReport=await downloadReport();assert.equal(initialReport.attempt,0);assert.equal(initialReport.metadata.state,'not-checked');assert.equal(initialReport.mirror.screenFrames,0);
 await page.locator('#move-check').click();await page.locator('#move-capabilities').filter({hasText:'Persistence-safe subscription is not advertised'}).waitFor();
 assert.equal(connections,0);assert.equal(commands.length,0,'metadata check never opens an unsafe subscription');
 assert(await page.getByRole('button',{name:'Pad 1',exact:true}).isDisabled());
 await page.locator('#move-connect').click();
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
 // Legacy metadata must fail BEFORE subscribe_tool can read state.
 await page.waitForFunction(()=>document.querySelector('#move-transport-status').textContent.includes('persistence-safe'));
 assert.equal(commands.length,0);assert.match(physicalFixture.request('get','status').value,/dirty=1/,'rejected subscription preserves pending autosave');assert(await page.locator('[data-move-transport=play]').isDisabled());
 const legacyReport=await downloadReport();assert.equal(legacyReport.metadata.stateReadPreservesDirty,false);assert.equal(legacyReport.mirror.state,'connected');assert.equal(legacyReport.transport.lastFailure,'transport-rejected');assert(legacyReport.mirror.screenFrames>0);assert(legacyReport.mirror.surfaceFrames>0);
 await page.locator('#move-disconnect').click();
 // Use the actual composed module metadata and production DSP for the safe path.
 persistenceSafe=true;
 await page.locator('#move-check').click();await page.locator('#move-capabilities').filter({hasText:'Paired Play/Stop eligible'}).waitFor();
 assert.equal(commands.length,0,'eligible metadata does not open a subscription');
 assert(await page.locator('[data-move-transport=play]').isDisabled());
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
 const lossReport=await downloadReport();assert.equal(lossReport.metadata.stateReadPreservesDirty,true);assert.equal(lossReport.transport.everReady,true);assert.equal(lossReport.transport.lastFailure,'transport-rejected');assert.deepEqual(lossReport.transport.sent,{play:1,stop:1});assert(lossReport.build.hostCommit);assert(lossReport.build.wasmSha256);
 const sent=commands.length;await page.waitForTimeout(300);assert.equal(commands.length,sent,'transport loss never reconnects or replays');
 await page.locator('#move-disconnect').click();assert.match(physicalFixture.request('get','status').value,/play=1/,'disconnect does not stop the device');
 const closedReport=await downloadReport();assert.equal(closedReport.mirror.closedBy,'user');assert.equal(closedReport.transport.lastFailure,lossReport.transport.lastFailure);
 await page.locator('#move-address').fill('http://changed.example');await page.locator('#move-address').dispatchEvent('input');
 const clearedReport=await downloadReport();assert.equal(clearedReport.attempt,0);assert.equal(clearedReport.metadata.state,'not-checked');assert.equal(clearedReport.transport.sent.play,0);
 physicalFixture.request('set','cmd','stop');
 await page.locator('#engine').selectOption('browser');await page.waitForFunction(()=>!document.querySelector('[aria-label="Pad 1"]').disabled);
 assert.equal(await page.evaluate(()=>__wasmRead('persistent_state')),savedState,'device mirror never overwrites the browser session');
 assert.equal(await page.locator('#audio').getAttribute('aria-pressed'),'false');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('restored'));
 assert.equal(await page.locator('#appearance-brightness').inputValue(),'100');
 assert(!(await page.locator('#appearance-neutral').isChecked()));
 assert.equal(await page.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor),themeBackground,'appearance survives a saved-session reload');
 await page.locator('#appearance summary').click();await page.locator('#appearance-reset').click();assert.equal(await page.locator('#appearance-brightness').inputValue(),'0');await page.locator('#appearance summary').click();
 assert.equal(await page.locator('#workspace-layout').inputValue(),'columns');assert.equal(await page.locator('#component-track').inputValue(),'3');
 for(const name of ['field','choices','song','lights'])assert(await page.locator(`[data-workspace=${name}]`).isVisible());
 assert.equal(await page.locator('[data-workspace]').evaluateAll(nodes=>nodes.map(node=>node.dataset.workspace).indexOf('field')),1);
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:850});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 assert.deepEqual(errors,[]);console.log('Unified workspace: shared color wheel, contrast, persistence, enlarged theme, shared edits, composition, Song, persistence, live mirror, persistence capability refusal, authenticated production-capability transport, real DSP record/replay, loss, reconnect and engine ownership pass');
 // Exercise the real Worker error -> transport close -> shared owner path.
 await page.evaluate(()=>window.testEngineWorker.dispatchEvent(new ErrorEvent('error',{message:'Fixture Worker failure'})));
 await page.waitForFunction(()=>document.querySelector('#engine-status').dataset.state==='error');
 for(const name of ['field','choices','song','lights']){
  assert(!(await page.locator(`[data-workspace=${name}] .component-content`).isVisible()));
  assert.match(await page.locator(`[data-workspace=${name}] .component-limit`).textContent(),/Browser engine offline/);
 }
 assert(await page.getByRole('button',{name:'Pad 1',exact:true}).isDisabled());
 assert(await page.locator('#audio').isDisabled());assert(await page.locator('#stop').isDisabled());
 const connectionsAtFailure=connections;
 await page.locator('#engine').selectOption('move');
 assert.equal(await page.locator('#engine').inputValue(),'browser');
 assert.equal(await page.locator('#engine-status').getAttribute('data-state'),'error');
 assert.equal(connections,connectionsAtFailure,'engine failure never automatically contacts Move');
 assert.deepEqual(errors,[]);console.log('Worker failure clears shared editors and disables dispatch until reload');
 // Failed startup has no browser session owner. The same UI can still mirror and
 // use explicitly paired transport, without reading or replacing its saved session.
 const originalPage=page,context=page.context();
 const readSaved=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('harmonybus-browser',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const database=request.result,query=database.transaction('sessions').objectStore('sessions').get('move');query.onerror=()=>reject(query.error);query.onsuccess=()=>{resolve(JSON.stringify(query.result));database.close();};};});
 const savedBeforeFailure=await page.evaluate(readSaved);assert(savedBeforeFailure);
 for(const scenario of ['direct','wasm','audio','worker']){
  page=await context.newPage();const startupErrors=[];page.on('pageerror',error=>startupErrors.push(error.message));
  const engineRequests=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/wasm/'))engineRequests.push(request.url());});
  await page.addInitScript(failure=>{
   const NativeWorker=window.Worker;window.testWorkerStarts=0;window.testWorkerTerminations=0;window.testSessionOpens=0;
   const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.testSessionOpens++;return open(...args);};
   window.Worker=class extends NativeWorker{
    constructor(...args){if(failure==='worker')throw new Error('Worker unavailable fixture');super(...args);window.testWorkerStarts++;}
    terminate(){window.testWorkerTerminations++;super.terminate();}
   };
  },scenario);
  if(scenario==='wasm')await page.route('**/engine.wasm',route=>route.fulfill({status:503,body:'Engine fixture unavailable'}));
  if(scenario==='audio')await page.route('**/pcm-worklet.mjs',route=>route.fulfill({status:404,body:'Audio fixture unavailable'}));
  const before={connections,commands:commands.length,metadataRequests};
  await page.goto(origin+'/move/'+(scenario==='direct'?'?engine=move&view=field':''));await page.waitForFunction(()=>!document.querySelector('#engine').disabled);
  await page.waitForFunction(expected=>document.querySelector('#move-address').value===expected,origin);
  assert.equal(await page.locator('#engine').inputValue(),'move');
  assert.equal(await page.locator('#engine option[value=browser]').evaluate(option=>option.disabled),scenario!=='direct');
  if(scenario==='direct')assert.equal(await page.locator('#error').textContent(),'');
  else assert.match(await page.locator('#error').textContent(),/Move connections remain available/);
  assert.equal(await page.evaluate(()=>window.testWorkerTerminations),['direct','worker'].includes(scenario)?0:1);
  assert.equal(await page.evaluate(()=>window.testSessionOpens),0,'recovery does not open browser storage');
  assert.deepEqual({connections,commands:commands.length,metadataRequests},before,'recovery never contacts Move automatically');
  assert(await page.getByRole('button',{name:'Pad 1',exact:true}).isDisabled());
  for(const id of ['audio','audio-test','stop'])assert(await page.locator('#'+id).isDisabled());
  assert(!(await page.locator('#sessions').isVisible()));
  await page.locator('#display-size').selectOption('384');
  assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--display-width')),'384px','display sizing remains available without the browser engine');
  await page.locator('#move-address').dispatchEvent('input');
  const expectedFailure=scenario==='direct'?null:'browser-startup-failed';
  const failedReport=await downloadReport();assert.equal(failedReport.ownerFailure,expectedFailure);assert.equal(failedReport.environment.startupEngine,scenario==='direct'?'move':'browser');
  await page.locator('#move-check').click();await page.locator('#move-capabilities').filter({hasText:'Paired Play/Stop eligible'}).waitFor();
  if(['direct','audio'].includes(scenario)){
   physicalFixture.request('set','cmd','bpm 12000');
   await page.locator('#move-transport-enabled').check();await page.locator('#move-pairing-key').fill(pairingKey);
  }
  await page.locator('#move-connect').click();await page.waitForFunction(()=>document.querySelector('#engine-status').dataset.state==='connected');
  // Connection readiness precedes the surface's next animation-frame paint.
  await page.waitForFunction(()=>document.querySelector('#hero').getContext('2d').getImageData(0,0,1,1).data[0]===255&&document.querySelector('[aria-label="Pad 1"]').dataset.deviceHeld==='true');
  assert.equal(await page.locator('#hero').evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,1,1).data[0]),255);
  if(['direct','audio'].includes(scenario)){
   await page.waitForFunction(()=>!document.querySelector('[data-move-transport=play]').disabled);
   await page.locator('[data-move-transport=play]').click();await page.waitForFunction(()=>document.querySelector('#move-transport-status').textContent.includes('Play request sent'));
   assert.match(physicalFixture.request('get','status').value,/play=1/);
   await page.locator('[data-move-transport=stop]').click();await page.waitForFunction(()=>document.querySelector('#move-transport-status').textContent.includes('Stop request sent'));
   assert.match(physicalFixture.request('get','status').value,/play=0/);
  }
  const recoveredReport=await downloadReport();assert.equal(recoveredReport.ownerFailure,expectedFailure);assert(recoveredReport.mirror.screenFrames>0);
  if(scenario==='direct'){
   assert.deepEqual(engineRequests,[],'direct Move mode downloads no browser engine or audio assets');
   assert.equal(await page.evaluate(()=>window.testWorkerStarts),0);assert.equal(await page.evaluate(()=>window.testSessionOpens),0);
   assert(!(await page.locator('#move-direct').isVisible()));
   const commandsBeforeBrowser=commands.length;
   await page.locator('#engine').selectOption('browser');await page.waitForURL('**/move/?view=field');
   await page.waitForFunction(()=>!document.querySelector('#engine').disabled&&document.querySelector('#session-status').textContent.includes('restored'));
   assert.equal(await page.locator('#engine').inputValue(),'browser');
   assert.equal(await page.evaluate(()=>__wasmRead('persistent_state')),savedState,'explicit Browser entry restores the original studio session');
   assert.equal(await page.evaluate(()=>window.testWorkerStarts),1);
   assert.equal(commands.length,commandsBeforeBrowser,'opening Browser never sends a device command');
   assert(!(await page.locator('#move-direct').isVisible()),'a running browser session cannot be replaced by the startup shortcut');
  }else await page.locator('#move-disconnect').click();
  assert.equal(await page.evaluate(readSaved),savedBeforeFailure,'Move mode preserves the saved browser session byte for byte');
  assert.deepEqual(startupErrors,[]);await page.close();
 }
 // The static shortcut also escapes a Worker script that has not finished loading.
 page=await context.newPage();let blockedWorker;
 await page.route('**/joint-worker.mjs',route=>{blockedWorker=route;});
 const beforeShortcut={connections,commands:commands.length,metadataRequests};
 const workerRequested=page.waitForRequest('**/joint-worker.mjs');
 await page.goto(origin+'/move/?view=field',{waitUntil:'domcontentloaded'});
 await workerRequested;
 await page.waitForFunction(()=>!document.querySelector('#move-direct').hidden&&document.querySelector('#engine').disabled);
 await page.locator('#move-direct').click();await page.waitForURL('**/move/?view=field&engine=move');
 await page.waitForFunction(()=>!document.querySelector('#engine').disabled);
 assert.equal(await page.locator('#engine').inputValue(),'move');
 assert.equal(await page.locator('#error').textContent(),'');
 assert.deepEqual({connections,commands:commands.length,metadataRequests},beforeShortcut,'startup shortcut does not contact Move');
 await blockedWorker?.abort().catch(()=>{});await page.close();
 page=originalPage;console.log('Move entry/recovery: no synth assets or Worker in direct mode, untouched browser storage, explicit Browser restore, startup shortcut, failed WASM/audio/Worker creation, passive report and real DSP paired transport pass');
}catch(error){if(page)console.error(await page.locator('#error').textContent(),await page.locator('#engine-status').textContent());throw error;}
finally{await browser.close();for(const socket of moveWS.clients)socket.terminate();moveWS.close();physicalFixture.dispose();for(const client of clients)client.destroy();site.closeAllConnections();move.closeAllConnections();await Promise.all([new Promise(resolve=>site.close(resolve)),new Promise(resolve=>move.close(resolve))]);}
