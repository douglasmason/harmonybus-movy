import assert from 'node:assert/strict';
import {chromium} from '../../local/node_modules/playwright/index.mjs';
import {serve} from '../serve.mjs';
const server=serve(0,process.env.WASM_PACKAGED?new URL('../build/site/',import.meta.url):null);
await new Promise(resolve=>server.once('listening',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/joint?engine=wasm`);
 await page.waitForFunction(()=>globalThis.__joint?.page().ready);
 await page.locator('#record').click();await page.waitForFunction(()=>document.querySelector('#transport').textContent==='Recording');
 await page.getByRole('button',{name:'Pad 1',exact:true}).focus();await page.keyboard.down('Space');await page.waitForTimeout(250);await page.keyboard.up('Space');await page.locator('#stop').click();
 await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('Saved on this device'));
 const before=await page.evaluate(()=>__wasmRead('state'));assert.match(before,/\d+:\d+:\d+:100:/);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('restored'));
 assert.equal(await page.evaluate(()=>__wasmRead('state')),before);
 await page.waitForFunction(()=>document.querySelector('[data-pad="0"]')?.textContent!=='Root —');
 await page.getByRole('button',{name:'Pad 1',exact:true}).press('Space');
 await page.waitForFunction(()=>document.querySelector('#events').textContent.includes('9 144'));
 const session=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('harmonybus-browser',1);request.onsuccess=()=>{const database=request.result,query=database.transaction('sessions').objectStore('sessions').get('current');query.onsuccess=()=>{resolve(query.result);database.close();};query.onerror=()=>reject(query.error);};}));
 // A damaged backup cannot replace a restored recording or overwrite its device save.
 const corrupt=structuredClone(session);corrupt.payload.sequencer+='broken';
 await page.locator('#session-file').setInputFiles({name:'bad.hb-session.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});
 await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('checksum mismatch'));
 assert.equal(await page.evaluate(()=>__wasmRead('state')),before);
 await page.locator('#session-file').setInputFiles({name:'good.hb-session.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(session))});
 await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('restored'));
 assert.equal(await page.evaluate(()=>__wasmRead('state')),before);
 const downloadPromise=page.waitForEvent('download');await page.locator('#session-export').click();const download=await downloadPromise;assert(download.suggestedFilename().endsWith('.hb-session.json'));
 await page.locator('#panel').selectOption(await page.getByRole('option',{name:/BassT\/Bass Clip Variation$/}).getAttribute('value'));
 await page.waitForFunction(()=>document.querySelector('[data-key="joint_variation_1_amount"]')?.textContent.includes('0'));
 await page.locator('[data-key="joint_variation_1_amount"]').press('ArrowUp');
 await page.waitForFunction(async()=>(await __wasmRead('variation_1')).split(' ')[1]!=='0');
 await page.locator('#panel').selectOption(await page.getByRole('option',{name:/BassT\/Bass Sources$/}).getAttribute('value'));
 await page.locator('[data-key="joint_source_1_enabled"]').press('ArrowUp');
 await page.waitForFunction(async()=>(await __wasmRead('source_route_1')).startsWith('1 1 '));
 assert.deepEqual(errors,[]);
 console.log('PASS IndexedDB recording reload, corrupt-import preservation, valid import/export and production variation/source panel edits');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
