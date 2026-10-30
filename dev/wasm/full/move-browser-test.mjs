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
 assert.equal(await page.locator('#encoder option[value="14"]').count(),0,'Jog has dedicated controls');
 assert.equal(await page.locator('#enter').count(),0,'no duplicate Jog click');
 assert(await page.locator('#display-sharp').isChecked());
 await page.waitForFunction(()=>document.querySelectorAll('#screen-sharp text').length>0);
 assert(await page.locator('#screen-sharp').isVisible());
 assert(!(await page.locator('#hero').isVisible()));
 const jogBox=await button('Jog').boundingBox(),screenBox=await page.locator('#screen').boundingBox();
 const minusBox=await button('Decrease jog').boundingBox();
 assert(jogBox.y>=screenBox.y+screenBox.height&&minusBox.y>=jogBox.y+jogBox.height,'Jog and its turns sit below the screen');
 await button('Note / Session').tap();
 await page.waitForFunction(()=>document.querySelector('#screen-sharp').textContent.includes('Normal Play'));
 const beforeJog=await page.locator('#screen-sharp').innerHTML();
 await button('Increase jog').click();
 await page.waitForFunction(before=>document.querySelector('#screen-sharp').innerHTML!==before,beforeJog);
 await button('Decrease jog').click();await button('Jog').tap();
 assert.equal(await page.locator('#encoder').inputValue(),'71','Jog does not disturb the knob selector');
 await button('Track 4').tap();
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.startsWith('Track 4'));
 await page.waitForFunction(()=>document.querySelector('#pads [data-index="76"] .control-label').textContent==='→1');
 assert.equal(await button('Pad 1').locator('.pad-note').textContent(),'C3');
 assert.match(await page.locator('.pad-row-label[data-row="1"]').textContent(),/T4 Melody · Approach/);
 await button('Pad 9').tap();
 await page.waitForFunction(()=>document.querySelector('#played-output').textContent.includes('Ch 4:'));
 assert.match(await page.locator('#played-intent').textContent(),/target C3/);
 assert.equal(Number(await page.evaluate(()=>__wasmRead('ch3:midi_fx1:render_last_note'))),43);
 assert.match(await page.locator('#played-output').textContent(),/Ch 4: G2/,'readout agrees with the engine even before a Comp chord is available');
 assert.match(await page.locator('#comp-route').textContent(),/Track 4 melody · Track 3 comp/);
 assert.equal(await page.locator('#comp-source').inputValue(),'0');
 await page.locator('#comp-source').selectOption('1');
 await page.waitForFunction(()=>document.querySelector('#comp-explanation').textContent.includes('without linked comp'));
 await button('Pad 9').tap();
 await page.waitForFunction(()=>document.querySelector('#played-output').textContent.startsWith('Ch 4:'));
 assert(!String(await page.locator('#played-output').textContent()).includes('Ch 3:'));
 await button('Track 1').tap();
 await page.locator('#display-size').selectOption('640');
 await button('Enlarge display').click();
 assert(await page.locator('#screen').evaluate(el=>el.getBoundingClientRect().width>900));
 await button('Close large display').click();
 await page.locator('#display-sharp').uncheck();
 assert(await page.locator('#hero').isVisible());
 assert(!(await page.locator('#screen-sharp').isVisible()));
 assert(await page.locator('#hero').evaluate(el=>el.getContext('2d').getImageData(0,0,128,64).data.some((value,index)=>index%4!==3&&value>0)),'original bitmap remains rendered');
 await button('Pad 2').tap();await button('Step 1').tap();
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('1 note'));
 let clip=await page.evaluate(()=>__wasmRead('state'));
 await button('Undo').tap();await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('0 notes'));
 await page.locator('#shift').check();await button('Undo').tap();await page.locator('#shift').uncheck();
 await page.waitForFunction(async()=>(await __wasmRead('state')).includes('cl 0 0'));
 assert.equal(await page.evaluate(()=>__wasmRead('state')),clip);
 // A cancelled hold must never toggle a note on pointer release.
 await button('Step 2').focus();await page.keyboard.down('Space');await page.keyboard.press('Escape');await page.keyboard.up('Space');
 assert.equal(await page.evaluate(()=>__wasmRead('state')),clip);
 // The production conductor sends harmony, while Track 4 renders local audio.
 await button('Track 4').tap();await button('Pad 2').tap();await button('Step 1').tap();
 await page.waitForFunction(async()=>Number((await __wasmRead('motif_clip_info_3')).split(',')[4])===1);
 clip=await page.evaluate(()=>__wasmRead('state'));
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
 assert(!(await page.locator('#display-sharp').isChecked()),'screen mode survives reload');
 await page.locator('#display-sharp').check();
 await page.waitForFunction(()=>document.querySelectorAll('#screen-sharp text').length>0);
 assert.equal(await page.locator('#comp-source').inputValue(),'1','Comp source survives save and reload');
 await page.locator('#comp-source').selectOption('0');
 await page.waitForFunction(()=>document.querySelector('#comp-explanation').textContent.includes('also triggers'));
 assert.equal(await page.evaluate(()=>__wasmRead('state')),clip);
 // Starting fresh must preserve and expose the previous session, including
 // its clips and source choices. Reload keeps both the blank and its archive.
 await page.getByText('Session files',{exact:true}).click();
 // A failed preservation write must not clear the live engine or its current save.
 await page.evaluate(()=>{window.archiveAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(){throw new DOMException('Test storage full','QuotaExceededError');};});
 await page.locator('#session-new').click();
 await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('Current session retained'));
 assert.equal(await page.evaluate(()=>__wasmRead('state')),clip);
 assert.equal(await page.locator('#session-previous option').count(),1);
 await page.evaluate(()=>{IDBObjectStore.prototype.add=window.archiveAdd;delete window.archiveAdd;});
 await page.locator('#session-new').click();
 await page.waitForFunction(()=>document.querySelector('#session-status').textContent.startsWith('New session ·'));
 assert.equal(Number((await page.evaluate(()=>__wasmRead('motif_clip_info_0'))).split(',')[4]),0);
 assert.equal(await page.evaluate(()=>__wasmRead('ch2:midi_fx1:chord_mode')),'Conductor Chord');
 assert.equal(await page.locator('#session-previous option').count(),2);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('restored'));
 await page.getByText('Session files',{exact:true}).click();
 assert.equal(await page.locator('#session-previous option').count(),2);
 await page.locator('#session-previous').selectOption({index:1});await page.locator('#session-open-previous').click();
 await page.waitForFunction(()=>!document.querySelector('#session-open-previous').disabled&&document.querySelector('#session-status').textContent.includes('restored'));
 assert.equal(await page.evaluate(()=>__wasmRead('state')),clip);
 assert.equal(await page.locator('#session-previous option').count(),3,'opening an archive also preserves the session being left');
 // Record abstract chords plus melody through the real controls, stop with
 // the browser button, reload, and press Play without reselecting the mode.
 await page.locator('#session-new').click();
 await page.waitForFunction(()=>document.querySelector('#session-status').textContent.startsWith('New session ·'));
 await page.getByText('Session files',{exact:true}).click();
 await button('Note / Session').tap();
 for(let turn=0;turn<5;turn++)await button('Increase jog').click();
 await button('Jog').tap();
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.startsWith('Track 4 · Chord Play'));
 await button('Step 1').tap();await button('Record').tap();
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('Recording'));
 for(const [step,pad] of [['Step 2','Pad 3'],['Step 3','Pad 5']]){
  await button(step).tap();await button(pad).focus();await page.keyboard.down('Space');
  await page.waitForTimeout(250);await page.keyboard.up('Space');
 }
 await page.locator('#stop').click();
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('Chord Play · Stopped'));
 const chordClip=await page.evaluate(()=>__wasmRead('state'));
 assert(chordClip.split('\n').filter(line=>line.startsWith('ra 0 0 ')).length>=2,'harmonic descriptors are recorded');
 await page.getByText('Session files',{exact:true}).click();await page.locator('#session-save').click();
 await page.waitForFunction(()=>!document.querySelector('#session-save').disabled&&document.querySelector('#session-status').textContent.includes('Saved'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#session-status').textContent.includes('restored'));
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.startsWith('Track 4 · Chord Play'));
 assert.equal(await page.evaluate(()=>__wasmRead('state')),chordClip);
 await page.locator('#audio').click();await page.waitForFunction(()=>document.querySelector('#audio').textContent==='Disable audio');
 await button('Play / Stop').tap();
 await page.waitForFunction(()=>{try{return JSON.parse(document.querySelector('#audio-report').textContent).peak>.0001;}catch{return false;}});
 await page.locator('#stop').click();
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('Chord Play · Stopped'));
 // Resume the ordinary clip/track checks in Normal Play.
 await button('Note / Session').tap();
 for(let turn=0;turn<5;turn++)await button('Decrease jog').click();
 await button('Jog').tap();
 await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('Normal Play'));
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
 console.log('PASS adaptable HB/Movy touch surface, clip edit/Undo/Redo, PCM, independent audio clock, preserved session archives, Chord Play Record/Stop/Save/Reload/Play without mode reselection, track 16, tablet/phone layouts and offline gestures');
}catch(error){
 if(page)console.error('Move browser failure:',await page.evaluate(async()=>({feedback:document.querySelector('#feedback')?.textContent,error:document.querySelector('#error')?.textContent,held:[...document.querySelectorAll('[data-held=true]')].map(el=>el.getAttribute('aria-label')),state:await globalThis.__wasmRead?.('state'),stats:await globalThis.__wasmStats?.()})).catch(String));
 throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
