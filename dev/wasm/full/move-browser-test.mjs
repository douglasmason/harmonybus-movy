/** CI browser regression: real DOM gestures, Worker, PCM, and persisted UI. */
import assert from 'node:assert/strict';
import {chromium} from '../../local/node_modules/playwright/index.mjs';
import {serve} from '../serve.mjs';
const server=serve(0,process.env.WASM_PACKAGED?new URL('../build/site/',import.meta.url):null);
await new Promise(resolve=>server.once('listening',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
let page;
try{
 page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true});const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/${process.env.WASM_PACKAGED?'':'move/'}`);
 const button=name=>page.getByRole('button',{name,exact:true});
 await button('Step 1').waitFor();await page.waitForFunction(()=>!document.querySelector('[aria-label="Step 1"]').disabled);
 await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('Autosaves'));
 assert.equal(await page.locator('#device').count(),0,'use our adaptable grid, not a fixed device drawing');
 assert.equal(await page.locator('#knobs .control').count(),8);
 assert.equal(await page.locator('#pads .control').count(),32);
 assert.equal(await page.locator('#steps .control').count(),16);
 await button('Track 4').tap();
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.startsWith('Track 4'));
 assert.match(await page.locator('#comp-route').textContent(),/Track 4 melody · Track 3 comp/);
 assert.equal(await page.locator('#comp-source').inputValue(),'0');
 await page.locator('#comp-source').selectOption('1');
 await page.waitForFunction(()=>document.querySelector('#comp-explanation').textContent.includes('without linked comp'));
 await button('Track 1').tap();
 await page.locator('#display-size').selectOption('640');
 await button('Enlarge display').click();
 assert(await page.locator('#hero').evaluate(el=>el.getBoundingClientRect().width>900));
 await button('Close large display').click();
 await button('Pad 2').tap();await button('Step 1').tap();
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('1 note'));
 const clip=await page.evaluate(()=>__wasmRead('state'));
 await button('Undo').tap();await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('0 notes'));
 await page.locator('#shift').check();await button('Undo').tap();await page.locator('#shift').uncheck();
 await page.waitForFunction(async()=>(await __wasmRead('state')).includes('cl 0 0'));
 assert.equal(await page.evaluate(()=>__wasmRead('state')),clip);
 // A cancelled hold must never toggle a note on pointer release.
 await button('Step 2').focus();await page.keyboard.down('Space');await page.keyboard.press('Escape');await page.keyboard.up('Space');
 assert.equal(await page.evaluate(()=>__wasmRead('state')),clip);
 await page.locator('#audio').click();await page.waitForFunction(()=>document.querySelector('#audio').textContent==='Disable audio');
 await button('Play / Stop').tap();
 await page.waitForFunction(()=>{try{return JSON.parse(document.querySelector('#audio-report').textContent).peak>.0001;}catch{return false;}});
 // UI drawing can stall without stopping the direct Worker-to-worklet clock.
 const before=await page.evaluate(()=>__wasmStats());
 await page.evaluate(()=>{const until=performance.now()+400;while(performance.now()<until){}});
 const after=await page.evaluate(()=>__wasmStats());assert(after.blocksProcessed>before.blocksProcessed+50);
 await page.locator('#stop').click();
 await page.getByText('Session files',{exact:true}).click();await page.locator('#session-save').click();
 await page.waitForFunction(()=>!document.querySelector('#session-save').disabled&&document.querySelector('#session-status').textContent.includes('Saved'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('restored'));
 assert.equal(await page.locator('#display-size').inputValue(),'640');
 assert.equal(await page.locator('#comp-source').inputValue(),'1','Comp source survives save and reload');
 await page.locator('#comp-source').selectOption('0');
 await page.waitForFunction(()=>document.querySelector('#comp-explanation').textContent.includes('also triggers'));
 assert.equal(await page.evaluate(()=>__wasmRead('state')),clip);
 // Production mode menu and Shift+Session shortcut reach Clips and all tracks.
 await page.locator('#shift').check();await button('Note / Session').tap();await page.locator('#shift').uncheck();await button('Step 16').tap();
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.startsWith('Track 16'));
 assert.match(await page.locator('#comp-route').textContent(),/Track 16 melody · Track 15 comp/);
 assert.equal(await page.locator('#comp-source').inputValue(),'0','each bank retains its own source');
 await button('Step 1').tap();
 await page.waitForFunction(async()=>Number((await __wasmRead('motif_clip_info_15')).split(',')[4])===1);
 // Landscape tablet geometry has no horizontal overflow or overlapping pad targets.
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const pads=await page.locator('.control[data-kind=note]').evaluateAll(buttons=>buttons.filter(button=>Number(button.dataset.index)>=68).map(button=>{const r=button.getBoundingClientRect();return {width:r.width,height:r.height};}));
 assert(pads.every(pad=>pad.width>=40&&pad.height>=28));
 for(const viewport of [{width:768,height:1024},{width:390,height:844},{width:1180,height:820}]){
  await page.setViewportSize(viewport);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'control grid fits '+viewport.width);
  assert(await button('Pad 1').isVisible());assert(await button('Record').isVisible());
 }
 await page.context().setOffline(true);await button('Track 13').tap();await button('Step 2').tap();
 assert.equal(await page.locator('#error').textContent(),'');assert.deepEqual(errors,[]);
 console.log('PASS adaptable HB/Movy touch surface, large display, complete Movy app, clip edit/Undo/Redo, PCM replay, independent audio clock, session reload, track 16, tablet/phone layouts and offline gestures');
}catch(error){
 if(page)console.error('Move browser failure:',await page.evaluate(async()=>({feedback:document.querySelector('#feedback')?.textContent,error:document.querySelector('#error')?.textContent,held:[...document.querySelectorAll('[data-held=true]')].map(el=>el.getAttribute('aria-label')),state:await globalThis.__wasmRead?.('state'),stats:await globalThis.__wasmStats?.()})).catch(String));
 throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
