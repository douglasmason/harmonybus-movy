import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from './node_modules/playwright/index.mjs';
const server=createServer(async(request,response)=>{
 if(request.url==='/'){
  response.setHeader('Content-Type','text/html');response.end(`<!doctype html><style>body{margin:20px;background:#111;color:white}</style><main id="cloud"></main><script type="module">
  import {mountCloud} from '/cloud-web.mjs';window.sent=[];window.reads=0;
  window.state={actor:'Melody',track:3,slot:0,transport:{playing:false,phase:'idle',track:null,slot:null},cloud:true,values:[96,96,127,48,64,80,64,90],seed:71,explore:'Stop',footer:'Explore Melody T4:1',x:64,y:64,edge:'Bounded',trail:{scope:'pitch',window:'infinite',windowBeats:4,curve:'linear',decayBeats:4,strength:1,peak:1,floor:0}};
  window.view='cf1|64,64,127|20,30,100,6;35,50,100,4;52,65,110,2;64,64,120,0|30,35,95,5;50,60,100,2';
  window.component=mountCloud({root:document.querySelector('#cloud').attachShadow({mode:'open'}),api:{send:value=>sent.push(value),read:async()=>{window.reads++;return {ui:JSON.stringify(state),view};}}});
  </script>`);return;
 }
 if(!['/cloud-web.mjs','/cloud-view.mjs'].includes(request.url)){response.writeHead(404).end();return;}
 response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL('./build'+request.url,import.meta.url)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:860},hasTouch:true});const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.addInitScript(()=>{window.midiPort={id:'mpe-fixture',name:'MPE fixture',state:'connected',open:async()=>{},close:async()=>{}};window.midiAccess={inputs:new Map([[window.midiPort.id,window.midiPort]]),onstatechange:null};Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>window.midiAccess});});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.component);
 await page.waitForTimeout(100);const canvas=page.locator('canvas'),bounds=await canvas.boundingBox();const client=await page.context().newCDPSession(page);
 const touches=[{id:1,x:bounds.x+80,y:bounds.y+90,force:.8},{id:2,x:bounds.x+350,y:bounds.y+180,force:.7}];
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches.map(point=>({...point,x:point.x+70,y:point.y+25}))});
 await page.waitForTimeout(120);let sent=await page.evaluate(()=>window.sent);
 assert(sent.some(value=>value.startsWith('touch 3 96 ')));assert(sent.some(value=>value.startsWith('touch 3 97 ')));
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 sent=await page.evaluate(()=>window.sent);assert(sent.some(value=>/^touch 3 96 .* 0$/.test(value)));assert(sent.some(value=>/^touch 3 97 .* 0$/.test(value)));
 const greenPixels=()=>canvas.evaluate(element=>{
  const pixels=element.getContext('2d').getImageData(0,0,element.width,element.height).data;let count=0;
  for(let offset=0;offset<pixels.length;offset+=4)if(pixels[offset+1]>90&&pixels[offset+1]>pixels[offset]*1.4&&pixels[offset+1]>pixels[offset+2]*1.1)count++;
  return count;
 });
 assert(await greenPixels()>0,'an engine-confirmed direct contact is green');
 await page.evaluate(()=>{window.savedView=window.view;window.view='cf1||64,64,127,0;65,65,127,2|';window.state.holding=true;});await page.waitForTimeout(100);
 assert.equal(await greenPixels(),0,'held clouds and the parked X/Y cursor cannot invent green contacts');
 await page.evaluate(()=>{window.view=window.savedView;window.state.holding=false;});await page.waitForTimeout(100);
 await page.evaluate(()=>{
  const root=document.querySelector('#cloud').shadowRoot,bounds=root.querySelector('canvas').getBoundingClientRect();
  window.component.padGesture('down',{pointerId:902,clientX:bounds.left+1,clientY:bounds.top+1,pointerType:'pen',pressure:.5,preventDefault(){}},bounds);
  window.sent=[];root.querySelector('[data-action=hold]').click();
 });
 assert.match((await page.evaluate(()=>window.sent)).at(-2),/^move 3 96 /,'Hold refreshes even a stationary contact before capture');
 assert.equal((await page.evaluate(()=>window.sent)).at(-1),'hold 1');await page.evaluate(()=>window.component.release());
 await page.getByRole('button',{name:'Hold cloud',exact:true}).click();assert.equal((await page.evaluate(()=>window.sent)).at(-1),'hold 1');
 assert.equal(await page.getByRole('button',{name:'Hold cloud',exact:true}).getAttribute('aria-pressed'),'false','Hold waits for engine confirmation');
 await page.evaluate(()=>window.state.holding=true);await page.getByRole('button',{name:'Release cloud',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Release cloud',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Release cloud',exact:true}).click();assert.equal((await page.evaluate(()=>window.sent)).at(-1),'hold 0');
 await page.evaluate(()=>window.state.holding=false);await page.getByRole('button',{name:'Hold cloud',exact:true}).waitFor();
 await page.getByRole('combobox',{name:'Cloud field boundary'}).selectOption('Wrap');await page.getByRole('button',{name:'Draw x positive'}).click();
 assert((await page.evaluate(()=>window.sent)).includes('edge Wrap'));assert((await page.evaluate(()=>window.sent)).includes('draw x 4'));
 await page.evaluate(()=>{window.state.drawBits=14;window.state.pressure=100;window.state.pressureResponse={target:'Velocity',curve:'Linear',reverse:false,low:1,high:127};});await page.waitForTimeout(100);
 await page.getByRole('combobox',{name:'Cloud drawing precision'}).selectOption('fine');
 await page.getByRole('button',{name:'Draw x positive'}).click();
 assert((await page.evaluate(()=>window.sent)).includes('drawfine x 1'));
 await page.getByRole('slider',{name:'Cloud draw pressure',exact:true}).fill('37');
 assert((await page.evaluate(()=>window.sent)).includes('pressure 37'));
 await page.getByRole('combobox',{name:'Cloud pressure target',exact:true}).selectOption('Length');
 await page.getByRole('combobox',{name:'Cloud pressure response',exact:true}).selectOption('Firm');
 await page.getByRole('combobox',{name:'Cloud pressure direction',exact:true}).selectOption('Reverse');
 await page.getByRole('spinbutton',{name:'Cloud pressure low',exact:true}).fill('20');await page.getByRole('spinbutton',{name:'Cloud pressure low',exact:true}).press('Tab');
 for(const command of ['response target Length','response curve Firm','response direction Reverse','response low 20'])assert((await page.evaluate(()=>window.sent)).includes(command));

 await page.getByRole('combobox',{name:'Cloud drawing precision'}).selectOption('coarse');

 await page.getByRole('combobox',{name:'Cloud field axes'}).selectOption('pitch-x');assert((await page.evaluate(()=>window.sent)).includes('axes pitch-x'));
 await page.evaluate(()=>window.state.axes='Pitch / Activity');await page.waitForTimeout(100);assert.match(await canvas.getAttribute('aria-label'),/Horizontal movement changes harmonic height/);
 await page.getByRole('combobox',{name:'Cloud field activity'}).selectOption('Rate');assert((await page.evaluate(()=>window.sent)).includes('activity Rate'));
 await page.evaluate(()=>window.state.activity='Rate');await page.waitForTimeout(100);assert.match(await canvas.getAttribute('aria-label'),/vertical movement changes trigger rate/);
 await page.getByRole('slider',{name:'Cloud density',exact:true}).fill('110');assert((await page.evaluate(()=>window.sent)).includes('control cg_cloud_density 110'));
 await page.getByRole('button',{name:'Record',exact:true}).click();assert((await page.evaluate(()=>window.sent)).includes('record'));
 assert.equal(await page.getByRole('button',{name:'Record',exact:true}).getAttribute('aria-pressed'),'false','sending an action does not invent engine confirmation');
 await page.evaluate(()=>{window.state.transport={playing:false,phase:'count-in',track:1,slot:2};window.state.cloud=false;});
 await page.getByRole('button',{name:'Cancel count-in',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Cancel count-in',exact:true}).isEnabled(),true,'the original take can be cancelled from a non-cloud actor');
 assert.equal(await page.getByRole('button',{name:'Cancel count-in',exact:true}).getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('.cloud-transport').textContent(),/Count-in · Track 2 · Clip 3/);
 assert.equal(await page.getByRole('button',{name:'Bake clip',exact:true}).isEnabled(),false);
 await page.getByRole('button',{name:'Cancel count-in',exact:true}).click();assert.equal((await page.evaluate(()=>window.sent)).at(-1),'record');
 await page.evaluate(()=>{window.state.transport={playing:true,phase:'recording',track:1,slot:2};});
 await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Play',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.getByRole('button',{name:'Stop',exact:true}).isEnabled(),true);
 assert.match(await page.locator('.cloud-transport').textContent(),/Playing · Recording · Track 2 · Clip 3/);
 await page.evaluate(()=>{window.state.transport={playing:false,phase:'idle',track:null,slot:null};window.state.cloud=true;});
 await page.getByRole('button',{name:'Record',exact:true}).waitFor();
 assert.match(await page.locator('.cloud-status').textContent(),/Melody · Track 4 · Clip 1/);
 for(const width of [390,820]){
  await page.setViewportSize({width,height:860});const before=await canvas.boundingBox();
  for(const phase of ['armed','count-in','recording','idle']){
   await page.evaluate(phase=>{window.state.holding=phase==='recording';window.state.transport={playing:phase==='recording',phase,track:phase==='idle'?null:15,slot:phase==='idle'?null:7};},phase);
   await page.waitForTimeout(100);assert.equal((await canvas.boundingBox()).y,before.y,'recording labels cannot move the field under held fingers');
  }
 }
 await page.setViewportSize({width:1000,height:860});
 for(const action of ['Stop exploring','Clear cloud','Stop']){
  await page.evaluate(()=>{window.sent=[];window.state.cloud=true;window.state.explore='Stop';window.state.transport.playing=true;});
  await page.getByRole('button',{name:'Stop exploring',exact:true}).waitFor();await page.waitForTimeout(100);
  const current=await canvas.boundingBox();
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:current.x+80,y:current.y+90,force:.8}]});
  await page.waitForTimeout(300);sent=await page.evaluate(()=>window.sent);
  assert.equal(sent.filter(value=>value.startsWith('touch ')&&!/ 0(?: 1)?$/.test(value)).length,1,'only pointer down may acquire a contact');
  assert(sent.some(value=>value.startsWith('move ')),'heartbeats only update existing contacts');
  await page.getByRole('button',{name:action,exact:true}).evaluate(button=>button.click());
  assert.equal(await page.evaluate(()=>window.component.isHeld()),false,action+' releases local ownership immediately');
  const after=await page.evaluate(()=>window.sent.length);await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>window.sent.length),after,'a cancelled finger cannot keep sending heartbeats');
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 for(const reason of ['explore','transport','source','actor']){
  await page.evaluate(()=>{window.state.track=3;window.state.actor='Melody';window.state.cloud=true;window.state.explore='Stop';window.state.transport.playing=true;});await page.waitForTimeout(100);
  const current=await canvas.boundingBox();
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:current.x+80,y:current.y+90,force:.8}]});
  await page.evaluate(reason=>{if(reason==='explore')window.state.explore='Explore';else if(reason==='transport')window.state.transport.playing=false;else if(reason==='source')window.state.cloud=false;else{window.state.track=1;window.state.actor='Bass';window.state.cloud=false;}},reason);
  await page.waitForFunction(()=>!window.component.isHeld());
  const after=await page.evaluate(()=>window.sent.length);await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>window.sent.length),after,'observed '+reason+' cancellation cannot revive input');
  assert.match((await page.evaluate(()=>window.sent)).at(-1),/^touch 3 96 \d+ \d+ 0 1$/,'up retains the original track');
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 await page.evaluate(()=>{window.state.track=3;window.state.actor='Melody';window.state.cloud=true;window.state.explore='Stop';window.state.transport.playing=false;});await page.waitForTimeout(100);
 await canvas.evaluate(element=>element.addEventListener('pointerdown',event=>window.activePointer=event.pointerId,{once:true}));
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touches[0]]});
 await canvas.evaluate(element=>{
  const bounds=element.getBoundingClientRect();
  element.dispatchEvent(new PointerEvent('pointermove',{pointerId:window.activePointer,pointerType:'touch',clientX:bounds.x+bounds.width*.8,clientY:bounds.y+bounds.height*.8}));
  window.component.suspend();
 });assert.equal(await page.evaluate(()=>window.component.isHeld()),false);
 sent=await page.evaluate(()=>window.sent);
 assert.deepEqual(sent.slice(-2),['move 3 96 102 25 1 1','touch 3 96 102 25 0 1'],'suspension flushes the final pending position before releasing its captured activity mode');
 const reads=await page.evaluate(()=>window.reads);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.reads),reads,'visibility cannot revive a hidden workspace component');
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.evaluate(()=>window.component.resume());await page.waitForTimeout(100);
 await mkdir(new URL('../../artifacts/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../../artifacts/follower-cloud.png',import.meta.url).pathname,fullPage:true});
 assert.deepEqual(failures,[]);await page.evaluate(()=>{window.state.xyBits=14;window.state.cloud=true;window.component.resume();window.sent=[];});await page.waitForTimeout(100);
 await page.getByRole('button',{name:'Connect MPE input',exact:true}).click();await page.getByRole('combobox',{name:'MPE MIDI input'}).selectOption('mpe-fixture');
 await page.evaluate(()=>window.midiPort.onmidimessage({data:new Uint8Array([0x91,60,100])}));
 assert((await page.evaluate(()=>window.sent)).some(value=>value.startsWith('touch14 3 113 ')));
 await page.evaluate(()=>{window.midiPort.onmidimessage({data:new Uint8Array([0xe1,1,64])});window.midiPort.onmidimessage({data:new Uint8Array([0xb1,74,90])});window.midiPort.onmidimessage({data:new Uint8Array([0xd1,30])});});await page.waitForTimeout(100);
 assert((await page.evaluate(()=>window.sent)).some(value=>/^move14 3 113 7741 11610 30 1$/.test(value)),'MPE low-byte bend, slide and pressure share the precise contact');
 await page.getByRole('button',{name:'Disconnect MPE input',exact:true}).click();assert.equal(await page.evaluate(()=>window.component.isHeld()),false);assert.equal(await page.evaluate(()=>window.midiPort.onmidimessage),null);
 assert.match((await page.evaluate(()=>window.sent)).at(-1),/^touch14 3 113 .* 0 1$/);
 await canvas.scrollIntoViewIfNeeded();const preciseBounds=await canvas.boundingBox();
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:preciseBounds.x+preciseBounds.width*.5001,y:preciseBounds.y+preciseBounds.height*.5,force:.4}]});await page.waitForTimeout(100);
 sent=await page.evaluate(()=>window.sent);
 assert(sent.some(value=>/^touch14 3 96 8193 8192 51 1$/.test(value)),'real pointer retains fractional pad position and pressure: '+JSON.stringify(sent.slice(-5)));
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.evaluate(()=>window.component.dispose());
 assert.deepEqual(failures,[]);
 console.log('Cloud touchscreen: two real pointers, movement, release, controls, X/Y, suspension and shared renderer pass');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
