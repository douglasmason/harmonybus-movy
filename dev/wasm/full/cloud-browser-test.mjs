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
 await panel.getByRole('button',{name:'Hold cloud',exact:true}).click();
 await until(async()=>JSON.parse(await __wasmRead('cloud_ui_state')).holding===true);
 await panel.getByRole('button',{name:'Release cloud',exact:true}).waitFor();
 await panel.getByRole('combobox',{name:'Follower actor'}).selectOption('Comp');
 await until(async()=>JSON.parse(await __wasmRead('cloud_ui_state')).track===2);
 await page.waitForTimeout(5000); // More than both contact leases and the four-beat trail at 120 BPM.
 assert.equal(await page.evaluate(()=>__wasmRead('cloud_hold_3')),'1');
 assert.equal(await page.evaluate(()=>__wasmRead('cloud_hold_2')),'0','Hold belongs to the captured actor');
 const heldView=(await page.evaluate(()=>__wasmRead('cloud_view_3'))).split('|');
 assert.equal(heldView[1],'','held clouds never synthesize green finger contacts');assert(heldView[2].length>0&&heldView[3].length>0);
 assert.equal(await page.evaluate(()=>__wasmRead('persistent_state')),before,'Hold is a transient audition until Record');
 await panel.getByRole('combobox',{name:'Follower actor'}).selectOption('Melody');
 await panel.getByRole('button',{name:'Release cloud',exact:true}).waitFor();
 assert.equal(await canvas.evaluate(element=>{
  const pixels=element.getContext('2d').getImageData(0,0,element.width,element.height).data;
  for(let offset=0;offset<pixels.length;offset+=4)if(pixels[offset+1]>90&&pixels[offset+1]>pixels[offset]*1.4&&pixels[offset+1]>pixels[offset+2]*1.1)return true;
  return false;
 }),false,'the compiled browser renders a neutral parked cursor while the cloud remains held');
 await panel.getByRole('button',{name:'Release cloud',exact:true}).click();
 await until(async()=>(await __wasmRead('cloud_hold_3'))==='0');
 await until(async()=>{const view=(await __wasmRead('cloud_view_3')).split('|');return view[2]===''&&view[3]==='';});
 await panel.getByRole('button',{name:'Stop',exact:true}).click();
 await until(async()=>(await __wasmRead('status')).includes('play=0'));
 assert.equal(await page.evaluate(()=>__wasmRead('persistent_state')),before,'live field leaves the saved Set untouched');
 await panel.getByRole('combobox',{name:'Cloud field axes'}).selectOption('pitch-x');
 await panel.getByRole('combobox',{name:'Cloud field boundary'}).selectOption('Wrap');
 await panel.getByRole('combobox',{name:'Cloud field activity'}).selectOption('Rate');
 await until(async()=>{const state=JSON.parse(await __wasmRead('cloud_ui_state'));return state.axes==='Pitch / Activity'&&state.edge==='Wrap'&&state.activity==='Rate';});
 await panel.getByRole('button',{name:'Record',exact:true}).click();
 await until(async()=>(await __wasmRead('status')).includes('rec=1'));
 await panel.getByRole('button',{name:'Stop recording',exact:true}).waitFor();
 assert.equal(await panel.getByRole('button',{name:'Stop recording',exact:true}).getAttribute('aria-pressed'),'true');
 assert.match(await panel.locator('.cloud-transport').textContent(),/Recording · Track 4 · Clip 1/);
 // Actor and lower control selectors can scroll the page. Capture viewport
 // coordinates at this gesture, not before the preceding Hold/actor sequence.
 await canvas.scrollIntoViewIfNeeded();const recordingBounds=await canvas.boundingBox();
 const recordingPoints=[{id:1,x:recordingBounds.x+recordingBounds.width*.85,y:recordingBounds.y+recordingBounds.height*.3,force:.8},{id:2,x:recordingBounds.x+recordingBounds.width*.7,y:recordingBounds.y+recordingBounds.height*.7,force:.7}];
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:recordingPoints});
 await until(async()=>{const contacts=(await __wasmRead('cloud_view_3')).split('|')[1].split(';').map(value=>value.split(',').map(Number));return contacts.length===2&&contacts.some(point=>Math.abs(point[0]-89)<=1&&Math.abs(point[1]-108)<=1);});
 // Chromium may coalesce a move packet. Wait for its pointer event before up;
 // do not wait for the controller's batched send or a musical clock boundary.
 await canvas.evaluate(element=>{window.cloudMoveSeen=false;element.addEventListener('pointermove',()=>window.cloudMoveSeen=true,{once:true});});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:recordingPoints.map((point,index)=>({...point,x:recordingBounds.x+recordingBounds.width*(index===0?.15:.3)}))});
 await page.waitForFunction(()=>window.cloudMoveSeen);
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await until(async()=>[...(await __wasmRead('persistent_state')).matchAll(/^cp1 3 0 (-?\d+),(\d+),(\d+),(\d+),1$/gm)].some(match=>Math.abs(Number(match[2])-89)<=1&&Number(match[3])>20&&Number(match[3])<107));
 const otherSource=await page.evaluate(async()=>(await __wasmRead('generator_info_2')).split('|').slice(0,3));
 await panel.getByRole('combobox',{name:'Follower actor'}).selectOption('Comp');
 await until(async()=>{const state=JSON.parse(await __wasmRead('cloud_ui_state'));return state.track===2&&!state.cloud&&state.transport.track===3&&state.transport.phase==='recording';});
 assert.match(await panel.locator('.cloud-transport').textContent(),/Recording · Track 4 · Clip 1/);
 await panel.getByRole('button',{name:'Stop recording',exact:true}).click();
 await until(async()=>(await __wasmRead('status')).includes('rec=0'));
 assert((await page.evaluate(()=>__wasmRead('status'))).includes('play=1'),'ending the take leaves playback running');
 await panel.getByRole('button',{name:'Record',exact:true}).waitFor();
 assert.equal(await panel.getByRole('button',{name:'Record',exact:true}).getAttribute('aria-pressed'),'false');
 assert.equal(await panel.getByRole('button',{name:'Record',exact:true}).isEnabled(),false,'a non-cloud actor cannot accidentally start a cloud take');
 assert.deepEqual(await page.evaluate(async()=>(await __wasmRead('generator_info_2')).split('|').slice(0,3)),otherSource,'finishing Melody does not start or change the browsed Comp source');
 await panel.getByRole('combobox',{name:'Follower actor'}).selectOption('Melody');
 await until(async()=>JSON.parse(await __wasmRead('cloud_ui_state')).track===3);
 await panel.getByRole('button',{name:'Stop',exact:true}).click();
 await until(async()=>(await __wasmRead('status')).includes('play=0'));
 const saved=await page.evaluate(()=>__wasmRead('persistent_state'));
 assert.match(saved,/cg1 3 0 18 /);assert.match(saved,/cp1 3 0 /);assert.match(saved,/generator:density/);
 const deposits=[...saved.matchAll(/^cp1 3 0 (-?\d+),(\d+),(\d+),(\d+),1$/gm)].map(match=>match.slice(1).map(Number));
 assert(deposits.some(([,activity,pitch])=>Math.abs(pitch-108)<=1&&Math.abs(activity-89)<=1),'recorded field retains rate behavior with horizontal pitch and vertical rate');
 assert(deposits.some(([,activity,pitch])=>Math.abs(activity-89)<=1&&pitch>20&&pitch<107),'fast swipes persist intermediate cloud deposits after finger release');
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
}catch(error){if(page)console.error(await page.evaluate(async()=>({ui:await __wasmRead('cloud_ui_state'),status:await __wasmRead('status'),error:document.querySelector('#error')?.textContent,points:(await __wasmRead('persistent_state')).split('\n').filter(line=>line.startsWith('cp1 3 0 ')).slice(0,40),canvas:document.querySelector('[data-workspace=cloud] .component-content').shadowRoot.querySelector('canvas').getBoundingClientRect().toJSON()})).catch(String));throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
