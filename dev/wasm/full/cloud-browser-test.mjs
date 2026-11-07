/** Canonical cloud UI drives the real compiled engine in the standalone workspace. */
import assert from 'node:assert/strict';
import {chromium} from '../../local/node_modules/playwright/index.mjs';
import {serve} from '../serve.mjs';
const server=serve(0,process.env.WASM_PACKAGED?new URL('../build/site/',import.meta.url):null);
await new Promise(resolve=>server.once('listening',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let page;
// Pinned Playwright 1.51 treats an async predicate as immediately truthy.
// Await the Worker read before deciding whether the musical condition holds.
async function until(predicate){const deadline=Date.now()+15000;while(!await page.evaluate(predicate)){if(Date.now()>deadline)throw new Error('Timed out: '+predicate);await page.waitForTimeout(40);}}
try{
 page=await browser.newPage({viewport:{width:1100,height:1000},hasTouch:true});const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/move/?view=cloud`);
 await until(async()=>{try{return JSON.parse(await __wasmRead('cloud_ui_state')).actor==='Comp';}catch{return false;}});
 const panel=page.locator('[data-workspace=cloud]');
 await panel.getByRole('combobox',{name:'Follower actor'}).selectOption('Melody');
 await until(async()=>{const state=JSON.parse(await __wasmRead('cloud_ui_state'));return state.actor==='Melody'&&state.track===3;});
 await panel.locator('.cloud-status').filter({hasText:'Melody · Track 4'}).waitFor();
 await panel.getByRole('button',{name:'Choose Cloud',exact:true}).click();
 await panel.getByRole('slider',{name:'Cloud density',exact:true}).fill('127');
 await panel.getByRole('slider',{name:'Cloud rate',exact:true}).fill('127');
 await panel.getByRole('button',{name:'Explore',exact:true}).click();
 const before=await page.evaluate(()=>__wasmRead('persistent_state'));
 await panel.getByRole('button',{name:'Play',exact:true}).click();
 const canvas=panel.locator('canvas'),bounds=await canvas.boundingBox(),client=await page.context().newCDPSession(page);
 const points=[{id:1,x:bounds.x+bounds.width*.85,y:bounds.y+bounds.height*.3,force:.8},{id:2,x:bounds.x+bounds.width*.7,y:bounds.y+bounds.height*.7,force:.7}];
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
 await until(async()=>{const view=(await __wasmRead('cloud_view_3')).split('|');return view[1].split(';').length===2&&view[3].length>0;});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points.map(point=>({...point,x:point.x-60,y:point.y+20}))});
 await page.waitForTimeout(180);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await until(async()=>(await __wasmRead('cloud_view_3')).split('|')[1]==='');
 await panel.getByRole('button',{name:'Stop',exact:true}).click();
 await until(async()=>(await __wasmRead('status')).includes('play=0'));
 assert.equal(await page.evaluate(()=>__wasmRead('persistent_state')),before,'live field leaves the saved Set untouched');
 await panel.getByRole('combobox',{name:'Cloud field axes'}).selectOption('pitch-x');
 await panel.getByRole('combobox',{name:'Cloud field boundary'}).selectOption('Wrap');
 await panel.getByRole('combobox',{name:'Cloud field activity'}).selectOption('Rate');
 await until(async()=>{const state=JSON.parse(await __wasmRead('cloud_ui_state'));return state.axes==='Pitch / Activity'&&state.edge==='Wrap'&&state.activity==='Rate';});
 await panel.getByRole('button',{name:'Record',exact:true}).click();
 await until(async()=>(await __wasmRead('status')).includes('rec=1'));
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});await page.waitForTimeout(700);
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await panel.getByRole('button',{name:'Stop',exact:true}).click();
 await until(async()=>(await __wasmRead('status')).includes('play=0'));
 const saved=await page.evaluate(()=>__wasmRead('persistent_state'));
 assert.match(saved,/cg1 3 0 18 /);assert.match(saved,/cp1 3 0 /);assert.match(saved,/generator:density/);
 const deposits=[...saved.matchAll(/^cp1 3 0 (-?\d+),(\d+),(\d+),(\d+),1$/gm)].map(match=>match.slice(1).map(Number));
 assert(deposits.some(([,activity,pitch])=>Math.abs(pitch-108)<=1&&Math.abs(activity-89)<=1),'recorded field retains rate behavior with horizontal pitch and vertical rate');
 await panel.getByRole('combobox',{name:'Cloud field axes'}).selectOption('pitch-y');
 await panel.getByRole('combobox',{name:'Cloud field activity'}).selectOption('Probability');
 await until(async()=>{const state=JSON.parse(await __wasmRead('cloud_ui_state'));return state.axes==='Activity / Pitch'&&state.activity==='Probability';});
 assert.equal(await page.evaluate(()=>__wasmRead('persistent_state')),saved,'changing projection cannot reinterpret the recorded musical gesture');
 await panel.getByRole('button',{name:'Play',exact:true}).click();
 await until(async()=>(await __wasmRead('cloud_view_3')).split('|')[3].length>0);
 await panel.getByRole('button',{name:'Stop',exact:true}).click();await until(async()=>(await __wasmRead('status')).includes('play=0'));
 await panel.getByRole('combobox',{name:'Cloud field axes'}).selectOption('pitch-x');
 await panel.getByRole('combobox',{name:'Cloud field activity'}).selectOption('Rate');
 await until(async()=>{const state=JSON.parse(await __wasmRead('cloud_ui_state'));return state.axes==='Pitch / Activity'&&state.activity==='Rate';});
 await page.locator('#sessions').evaluate(element=>element.open=true);await page.locator('#session-save').click();
 await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('Saved'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('restored'));
 await until(async()=>{try{const state=JSON.parse(await __wasmRead('cloud_ui_state'));return state.axes==='Pitch / Activity'&&state.activity==='Rate';}catch{return false;}});
 assert.equal(await page.evaluate(()=>__wasmRead('persistent_state')),saved);assert.deepEqual(errors,[]);
 console.log('Standalone cloud: real multitouch, reversible axes, temporary audition, Record/replay and saved projection preferences pass');
}catch(error){if(page)console.error(await page.evaluate(async()=>({ui:await __wasmRead('cloud_ui_state'),status:await __wasmRead('status'),error:document.querySelector('#error')?.textContent})).catch(String));throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
