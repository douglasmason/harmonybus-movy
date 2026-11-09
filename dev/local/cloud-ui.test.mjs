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
  window.component=mountCloud({root:document.querySelector('#cloud').attachShadow({mode:'open'}),api:{send:value=>sent.push(value),read:async()=>{window.reads++;return {ui:state,view};}}});
  </script>`);return;
 }
 if(!['/cloud-web.mjs','/cloud-view.mjs'].includes(request.url)){response.writeHead(404).end();return;}
 response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL('./build'+request.url,import.meta.url)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:860},hasTouch:true});const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.component);
 await page.waitForTimeout(100);const canvas=page.locator('canvas'),bounds=await canvas.boundingBox();const client=await page.context().newCDPSession(page);
 const touches=[{id:1,x:bounds.x+80,y:bounds.y+90,force:.8},{id:2,x:bounds.x+350,y:bounds.y+180,force:.7}];
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches.map(point=>({...point,x:point.x+70,y:point.y+25}))});
 await page.waitForTimeout(120);let sent=await page.evaluate(()=>window.sent);
 assert(sent.some(value=>value.startsWith('touch 3 96 ')));assert(sent.some(value=>value.startsWith('touch 3 97 ')));
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 sent=await page.evaluate(()=>window.sent);assert(sent.some(value=>/^touch 3 96 .* 0$/.test(value)));assert(sent.some(value=>/^touch 3 97 .* 0$/.test(value)));
 await page.getByRole('combobox',{name:'Cloud field boundary'}).selectOption('Wrap');await page.getByRole('button',{name:'Draw x positive'}).click();
 assert((await page.evaluate(()=>window.sent)).includes('edge Wrap'));assert((await page.evaluate(()=>window.sent)).includes('draw x 4'));
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
   await page.evaluate(phase=>window.state.transport={playing:phase==='recording',phase,track:phase==='idle'?null:15,slot:phase==='idle'?null:7},phase);
   await page.waitForTimeout(100);assert.equal((await canvas.boundingBox()).y,before.y,'recording labels cannot move the field under held fingers');
  }
 }
 await page.setViewportSize({width:1000,height:860});
 await canvas.evaluate(element=>element.addEventListener('pointerdown',event=>window.activePointer=event.pointerId,{once:true}));
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touches[0]]});
 await canvas.evaluate(element=>{
  const bounds=element.getBoundingClientRect();
  element.dispatchEvent(new PointerEvent('pointermove',{pointerId:window.activePointer,pointerType:'touch',clientX:bounds.x+bounds.width*.8,clientY:bounds.y+bounds.height*.8}));
  window.component.suspend();
 });assert.equal(await page.evaluate(()=>window.component.isHeld()),false);
 sent=await page.evaluate(()=>window.sent);
 assert.deepEqual(sent.slice(-2),['touch 3 96 102 25 108 1','touch 3 96 102 25 0 1'],'suspension flushes the final pending position before releasing its captured activity mode');
 const reads=await page.evaluate(()=>window.reads);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.reads),reads,'visibility cannot revive a hidden workspace component');
 await page.evaluate(()=>window.component.resume());await page.waitForTimeout(100);
 await mkdir(new URL('../../artifacts/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../../artifacts/follower-cloud.png',import.meta.url).pathname,fullPage:true});
 assert.deepEqual(failures,[]);await page.evaluate(()=>window.component.dispose());
 console.log('Cloud touchscreen: two real pointers, movement, release, controls, X/Y, suspension and shared renderer pass');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
