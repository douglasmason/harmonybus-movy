/** Shared touch editor drives the packaged production controller and WASM engine. */
import assert from 'node:assert/strict';
import {chromium} from '../../local/node_modules/playwright/index.mjs';
import {serve} from '../serve.mjs';
const server=serve(0,process.env.WASM_PACKAGED?new URL('../build/site/',import.meta.url):null);
await new Promise(resolve=>server.once('listening',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let page;
// Evaluate the completed Worker read, not Playwright 1.51's async-predicate promise.
async function until(predicate){const deadline=Date.now()+15000;while(!await page.evaluate(predicate)){if(Date.now()>deadline)throw new Error('Timed out: '+predicate);await page.waitForTimeout(40);}}
try{
 page=await browser.newPage({viewport:{width:1100,height:1000},hasTouch:true});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/move/?view=cloud`);
 await until(async()=>{try{return JSON.parse(await __wasmRead('cloud_ui_state')).ready===true;}catch{return false;}});
 const savedBefore=await page.evaluate(()=>__wasmRead('persistent_state'));
 await page.getByRole('button',{name:'Euclidean',exact:true}).click();const editor=page.locator('[data-editor-panel=euclidean]');
 await editor.getByRole('button',{name:'Choose Euclidean',exact:true}).click();
 await until(async()=>!!JSON.parse(await __wasmRead('cloud_ui_state')).euclidean);
 for(const [name,value] of [['Hits','5'],['Steps','13'],['Accents','2'],['Accent depth','60'],['Gate','25']])await editor.getByRole('slider',{name:'Euclidean '+name,exact:true}).fill(value);
 await until(async()=>{const values=JSON.parse(await __wasmRead('cloud_ui_state')).euclideanValues;return values[0]==='5'&&values[1]==='13'&&values[4]==='2'&&values[5]==='60'&&values[6]==='25';});
 await editor.locator('[data-step="4"]').tap();
 await until(async()=>JSON.parse(await __wasmRead('cloud_ui_state')).euclideanValues[2]==='4');
 assert.equal(await page.evaluate(()=>__wasmRead('persistent_state')),savedBefore,'choosing and editing a draft does not persist a clip');
 await editor.getByRole('button',{name:'Explore',exact:true}).click();await editor.getByRole('button',{name:'Play',exact:true}).click();
 await until(async()=>JSON.parse(await __wasmRead('cloud_ui_state')).euclidean.cursor>=0);
 await editor.locator('[aria-current=step]').waitFor({state:'visible'});
 assert.equal(await editor.locator('[aria-current=step]').count(),1);
 assert.equal(await page.evaluate(()=>__wasmRead('persistent_state')),savedBefore,'audition remains temporary');
 await editor.getByRole('button',{name:'Record',exact:true}).click();
 await until(async()=>(await __wasmRead('status')).includes('rec=1'));
 await editor.getByRole('button',{name:'Stop recording',exact:true}).waitFor();
 await editor.getByRole('slider',{name:'Euclidean Gate',exact:true}).fill('75');await editor.locator('[data-step="7"]').tap();
 await until(async()=>{const values=JSON.parse(await __wasmRead('cloud_ui_state')).euclideanValues;return values[6]==='75'&&values[2]==='7';});
 await page.waitForTimeout(300);
 const bassBefore=await page.evaluate(async()=>(await __wasmRead('generator_info_1')).split('|').slice(0,3));
 await editor.getByRole('combobox',{name:'Euclidean actor'}).selectOption('Bass');
 await until(async()=>{const state=JSON.parse(await __wasmRead('cloud_ui_state'));return state.track===1&&state.transport.track===2&&state.transport.phase==='recording';});
 await editor.locator('.transport').filter({hasText:'Recording · Track 3 · Clip 1'}).waitFor();
 assert.match(await editor.locator('.transport').textContent(),/Recording · Track 3 · Clip 1/);
 await editor.getByRole('button',{name:'Stop recording',exact:true}).click();await until(async()=>(await __wasmRead('status')).includes('rec=0'));
 assert.deepEqual(await page.evaluate(async()=>(await __wasmRead('generator_info_1')).split('|').slice(0,3)),bassBefore,'finishing Comp does not start a Bass source');
 await editor.getByRole('button',{name:'Stop',exact:true}).click();await until(async()=>(await __wasmRead('status')).includes('play=0'));
 await editor.getByRole('combobox',{name:'Euclidean actor'}).selectOption('Comp');
 await until(async()=>JSON.parse(await __wasmRead('cloud_ui_state')).track===2);
 const saved=await page.evaluate(()=>__wasmRead('persistent_state'));
 assert.match(saved,/cg1 2 0 19 /);for(const name of ['hits','steps','rotation','division','intensity','accents','accent_depth','gate'])assert(saved.includes('generator:'+name));
 await page.locator('#sessions').evaluate(element=>element.open=true);await page.locator('#session-save').click();await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('Saved'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('restored'));
 await until(async()=>{try{return !!JSON.parse(await __wasmRead('cloud_ui_state')).euclidean;}catch{return false;}});
 await page.getByRole('button',{name:'Euclidean',exact:true}).click();
 assert.equal(await page.evaluate(()=>__wasmRead('persistent_state')),saved);
 await editor.getByRole('button',{name:'Play',exact:true}).click();await until(async()=>JSON.parse(await __wasmRead('cloud_ui_state')).euclidean.cursor>=0);
 await editor.getByRole('button',{name:'Stop',exact:true}).click();await until(async()=>(await __wasmRead('status')).includes('play=0'));
 await until(async()=>JSON.parse(await __wasmRead('cloud_ui_state')).canBake===true);
 await editor.getByRole('button',{name:'Bake clip',exact:true}).click();
 await until(async()=>!(await __wasmRead('persistent_state')).includes('cg1 2 0 '));
 assert.deepEqual(errors,[]);
 console.log('Euclidean standalone: real touch rotation, temporary exploration, observed cursor, expression automation, cross-actor Record ownership, saved replay and Bake pass');
}catch(error){if(page)console.error(await page.evaluate(async()=>({ui:await __wasmRead('cloud_ui_state'),status:await __wasmRead('status'),error:document.querySelector('#error')?.textContent})).catch(String));throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
