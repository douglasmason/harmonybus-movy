import assert from 'node:assert/strict';
import {chromium} from '../../local/node_modules/playwright/index.mjs';
import {serve} from '../serve.mjs';
const server=serve(0); // Diagnostic harness is deliberately excluded from publication.
await new Promise(resolve=>server.once('listening',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/diagnostic-joint?engine=wasm`);
 await page.waitForFunction(()=>globalThis.__joint?.page().ready);
 for(const viewport of [{width:1024,height:768},{width:1180,height:720},{width:768,height:1024},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  for(const selector of ['#record','#play','#stop','#pads','#clip-status','#light-monitor']){
   const box=await page.locator(selector).boundingBox();assert(box&&box.y>=0&&box.y+box.height<=viewport.height,`${selector} fits ${JSON.stringify(viewport)}`);
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight));
 }
 await page.setViewportSize({width:1024,height:768});
 await page.locator('#light-monitor').click();assert(await page.locator('#view-lights').isVisible());
 await page.locator('#light-blackout').click();await page.locator('[data-view=perform]').click();
 await page.waitForFunction(()=>document.querySelector('#light-monitor-state').textContent==='Blackout');
 assert(await page.locator('#light-monitor [data-fixture]').evaluateAll(elements=>elements.every(element=>element.style.backgroundColor==='rgb(0, 0, 0)')));
 await page.locator('#light-monitor').click();await page.locator('#light-blackout').click();await page.locator('[data-view=perform]').click();
 assert.equal(await page.locator('#pads').evaluate(element=>getComputedStyle(element).touchAction),'none');
 await page.locator('#audio').click();await page.waitForFunction(()=>__joint.monitor.enabled);
 await page.locator('#record').click();await page.waitForFunction(()=>document.querySelector('#transport').textContent==='Count-in');
 assert.match(await page.locator('#capture-hint').textContent(),/not captured/);
 await page.waitForFunction(()=>document.querySelector('#transport').textContent==='Recording');
 const pad=page.getByRole('button',{name:'Pad 1',exact:true});
 await pad.focus();await page.keyboard.down('Space');await page.waitForTimeout(250);await page.keyboard.up('Space');
 await page.locator('#play').click();
 await page.waitForFunction(()=>document.querySelector('#transport').textContent==='Playing');
 assert.match(await page.evaluate(()=>__wasmRead('status')),/rec=0/);
 await page.waitForFunction(()=>[...document.querySelectorAll('.clip-card')].some(card=>/[1-9]\d* notes/.test(card.textContent)));
 await page.waitForFunction(()=>{const samples=new Float32Array(2048);__joint.monitor.analyser.getFloatTimeDomainData(samples);return samples.some(value=>Math.abs(value)>.001);});
 await page.locator('#stop').click();
 await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('Saved on this device'));
 const before=await page.evaluate(()=>__wasmRead('state'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('restored'));
 assert.equal(await page.evaluate(()=>__wasmRead('state')),before);
 await page.locator('#audio').click();await page.waitForFunction(()=>__joint.monitor.enabled);await page.locator('#play').click();
 await page.waitForFunction(()=>{const samples=new Float32Array(2048);__joint.monitor.analyser.getFloatTimeDomainData(samples);return samples.some(value=>Math.abs(value)>.001);});
 await page.locator('#stop').click();
 for(const name of ['controls','song','session','audio','lights','info','perform']){
  await page.locator(`[data-view=${name}]`).click();assert(await page.locator(`#view-${name}`).isVisible());assert(await page.locator('#record').isVisible());assert(await page.locator('#stop').isVisible());
 }
 assert.deepEqual(errors,[]);
 console.log('PASS tablet/phone viewport fit, panel navigation, count-in feedback, Record→Play closes take, captured-note counts, audible compiled replay and reload replay');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
