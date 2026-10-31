/** CI: one real Worker, canonical editors, recomposition and source-derived Move SSE. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {chromium} from '../../local/node_modules/playwright/index.mjs';
import {serve} from '../serve.mjs';
const site=serve(0,process.env.WASM_PACKAGED?new URL('../build/site/',import.meta.url):null);
await once(site,'listening');
const fixture=JSON.parse(await readFile(new URL('../../local/fixtures/move-mirror-v1.json',import.meta.url)));
const clients=new Set();let connections=0;
const move=createServer((request,response)=>{
 assert.equal(request.url,'/stream-auto?v=2');assert.equal(request.method,'GET');connections++;
 response.writeHead(200,{'Content-Type':'text/event-stream','Access-Control-Allow-Origin':'*'});clients.add(response);
 response.write('data: '+JSON.stringify(fixture.screen)+'\n\nevent: surface\ndata: '+JSON.stringify(fixture.surface)+'\n\n');
 const timer=setInterval(()=>response.write('event: hb\ndata: '+JSON.stringify(fixture.heartbeat)+'\n\n'),500);
 response.on('close',()=>{clearInterval(timer);clients.delete(response);});
}).listen(0,'127.0.0.1');await once(move,'listening');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let page;
try{
 page=await browser.newPage({viewport:{width:1024,height:768}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const origin=`http://127.0.0.1:${site.address().port}`;
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
 await page.locator('[data-workspace=field] #field_randomness').fill('42');await page.locator('[data-workspace=field] #field_randomness').press('Tab');
 await page.waitForFunction(async()=>await __wasmRead('ch3:midi_fx1:field_randomness')==='42');
 assert.equal(await page.evaluate(()=>__wasmRead('ch0:midi_fx1:field_randomness')),'42','Field placement is engine-global, as declared by HarmonyBus');
 await page.locator('#song-build').click();await page.waitForFunction(()=>document.querySelector('#song-build').getAttribute('aria-pressed')==='true');
 await page.getByRole('button',{name:'Scene 1',exact:true}).click();await page.getByRole('button',{name:'Scene 2',exact:true}).click();
 await page.locator('#song-build').click();await page.waitForFunction(()=>document.querySelector('#song-summary').textContent.includes('2 scene selections'));
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
 await page.locator('#move-address').fill(`http://127.0.0.1:${move.address().port}`);await page.locator('#move-connect').click();
 await page.waitForFunction(()=>document.querySelector('#engine-status').textContent.includes('screen & LEDs'));
 await page.waitForFunction(()=>document.querySelector('[aria-label="Pad 1"]').dataset.deviceHeld==='true');
 assert.equal(connections,1);assert.equal(await page.locator('#display-sharp').isDisabled(),true);
 assert.equal(await page.locator('#hero').evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,1,1).data[0]),255);
 for(const client of clients)client.destroy();await page.waitForFunction(()=>document.querySelector('#engine-status').dataset.state==='disconnected');
 await page.waitForTimeout(400);assert.equal(connections,1,'loss never silently reconnects');
 await page.locator('#move-connect').click();await page.waitForFunction(()=>document.querySelector('#engine-status').dataset.state==='connected');assert.equal(connections,2);
 await page.locator('#move-disconnect').click();await page.waitForFunction(()=>document.querySelector('#engine-status').dataset.state==='disconnected');
 await page.locator('#engine').selectOption('browser');await page.waitForFunction(()=>!document.querySelector('[aria-label="Pad 1"]').disabled);
 assert.equal(await page.evaluate(()=>__wasmRead('state')),savedState,'device mirror never overwrites the browser session');
 assert.equal(await page.locator('#audio').getAttribute('aria-pressed'),'false');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('restored'));
 assert.equal(await page.locator('#workspace-layout').inputValue(),'columns');assert.equal(await page.locator('#component-track').inputValue(),'3');
 for(const name of ['field','choices','song','lights'])assert(await page.locator(`[data-workspace=${name}]`).isVisible());
 assert.equal(await page.locator('[data-workspace]').evaluateAll(nodes=>nodes.map(node=>node.dataset.workspace).indexOf('field')),1);
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:850});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 assert.deepEqual(errors,[]);console.log('Unified workspace: shared edits, composition, Song, persistence, live mirror, loss, reconnect and engine ownership pass');
}catch(error){if(page)console.error(await page.locator('#error').textContent(),await page.locator('#engine-status').textContent());throw error;}
finally{await browser.close();for(const client of clients)client.destroy();site.closeAllConnections();move.closeAllConnections();await Promise.all([new Promise(resolve=>site.close(resolve)),new Promise(resolve=>move.close(resolve))]);}
