/** Exercise the shipped generator editors, actor routing and lifecycle in Chromium. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from './node_modules/playwright/index.mjs';
const files=new Set(['/generator-web.mjs','/euclidean-web.mjs','/cloud-web.mjs','/cloud-view.mjs']);
const server=createServer(async(request,response)=>{
 if(request.url==='/'){
  response.setHeader('Content-Type','text/html');response.end(`<!doctype html><style>body{margin:16px;background:#111;color:white}main{max-width:1100px;margin:auto}</style><main id="generators"></main><script type="module">
  import {mountGenerators} from '/generator-web.mjs';window.sent=[];window.reads=0;window.fail=false;
  window.state={ready:true,actor:'Comp',track:2,slot:0,transport:{playing:false,phase:'idle',track:null,slot:null},cloud:false,values:[96,96,127,48,64,80,64,90],seed:71,explore:'Start',footer:'Temporary Comp T3:1',x:64,y:64,edge:'Bounded',trail:{scope:'pitch',window:'infinite',windowBeats:4,curve:'linear',decayBeats:4,strength:1,peak:1,floor:0},euclidean:{hits:3,steps:7,rotation:0,rate:0,cursor:-1,mask:41,accents:2,depth:60,gate:25,accentMask:33},euclideanValues:['3','7','0','1/16','2','60','25','50']};
  window.component=mountGenerators({root:document.querySelector('#generators').attachShadow({mode:'open'}),api:{send:value=>sent.push(value),read:async()=>{window.reads++;if(window.fail)throw Error('Disconnected');return {ui:structuredClone(state),view:'cf1|||'};}}});
  </script>`);return;
 }
 if(!files.has(request.url)){response.writeHead(404).end();return;}
 response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL('./build'+request.url,import.meta.url)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:1000},hasTouch:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.getByRole('button',{name:'Euclidean',exact:true}).click();
 const editor=page.locator('[data-editor-panel=euclidean]');await editor.getByRole('slider',{name:'Euclidean Hits',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('#generators').shadowRoot.querySelector('[data-editor-panel=euclidean]').shadowRoot.querySelector('[data-step="0"]').disabled===false);
 assert.equal(await editor.locator('[data-step]:enabled').count(),7);assert.equal(await editor.locator('[data-accent=true]').count(),2);assert.equal(await editor.locator('[aria-current=step]').count(),0);
 await editor.locator('[data-step="3"]').tap();assert.equal((await page.evaluate(()=>sent)).at(-1),'euclidean 2 rotate 3');
 assert.equal(await editor.locator('[aria-current=step]').count(),0,'gestures never invent a clock');
 await page.evaluate(()=>{state.transport.playing=true;state.euclidean.cursor=5;});await editor.locator('[data-step="5"][aria-current=step]').waitFor();
 await editor.getByRole('slider',{name:'Euclidean Gate',exact:true}).fill('75');
 await page.waitForFunction(()=>sent.includes('euclidean 2 control cg_euclid_gate 75'));
 await editor.getByRole('combobox',{name:'Euclidean Rate',exact:true}).selectOption('1/8');
 assert((await page.evaluate(()=>sent)).includes('euclidean 2 control cg_euclid_rate 1/8'));
 await editor.getByRole('button',{name:'Record',exact:true}).click();assert.equal((await page.evaluate(()=>sent)).at(-1),'euclidean 2 record');
 assert.equal(await editor.getByRole('button',{name:'Record',exact:true}).getAttribute('aria-pressed'),'false');
 await page.evaluate(()=>{state.actor='Bass';state.track=1;state.euclidean=null;state.euclideanValues=null;state.transport={playing:true,phase:'recording',track:2,slot:3};});
 await editor.getByRole('button',{name:'Stop recording',exact:true}).waitFor();assert.match(await editor.locator('.transport').textContent(),/Track 3 · Clip 4/);
 await editor.getByRole('button',{name:'Stop recording',exact:true}).click();assert.equal((await page.evaluate(()=>sent)).at(-1),'euclidean 1 record');
 assert(await editor.getByRole('slider',{name:'Euclidean Gate',exact:true}).isDisabled());
 await page.evaluate(()=>{state.actor='Comp';state.track=2;state.euclidean={hits:5,steps:13,rotation:2,rate:1,cursor:8,mask:1317,accents:2,depth:60,gate:25,accentMask:1028};state.euclideanValues=['5','13','2','1/8','2','60','25','50'];state.transport={playing:true,phase:'idle',track:null,slot:null};});
 await editor.locator('[data-step="12"]:enabled').waitFor();
 // A rapid slider gesture is one latest value per polling interval, not a queue flood.
 await editor.getByRole('slider',{name:'Euclidean Hits',exact:true}).evaluate(input=>{window.sent=[];for(let value=1;value<=16;value++){input.value=String(value);input.dispatchEvent(new Event('input'));}});
 await page.waitForFunction(()=>sent.includes('euclidean 2 control cg_euclid_hits 16'));assert.equal((await page.evaluate(()=>sent)).filter(value=>value.includes('cg_euclid_hits')).length,1);
 // Reading fails closed; the old cursor and write targets cannot remain live.
 await page.evaluate(()=>window.fail=true);await editor.getByRole('button',{name:'Explore',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('#generators').shadowRoot.querySelector('[data-editor-panel=euclidean]').shadowRoot.querySelector('[data-action=explore]').disabled);
 assert.equal(await editor.locator('[aria-current=step]').count(),0);
 await page.evaluate(()=>window.fail=false);await editor.locator('[data-step="12"]:enabled').waitFor();
 await mkdir(new URL('../../artifacts/',import.meta.url),{recursive:true});
 for(const width of [390,820]){
  await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await editor.locator('.step').evaluateAll(elements=>elements.every(element=>element.getBoundingClientRect().width>=44)));
  await page.screenshot({path:new URL('../../artifacts/euclidean-'+width+'.png',import.meta.url).pathname,fullPage:true});
 }
 await page.evaluate(()=>component.suspend());const reads=await page.evaluate(()=>window.reads),writes=await page.evaluate(()=>sent.length);
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>window.reads),reads);assert.equal(await page.evaluate(()=>sent.length),writes);
 await page.evaluate(()=>component.resume());await editor.locator('[data-step="12"]:enabled').waitFor();
 await page.getByRole('button',{name:'Cloud',exact:true}).click();assert(await page.locator('canvas').isVisible());assert(await editor.isHidden());
 assert.deepEqual(errors,[]);await page.evaluate(()=>component.dispose());
 console.log('Euclidean touchscreen: actor-bound controls, observed cursor, recording owner, coalescing, offline/suspension, shared Cloud tabs and phone/tablet layout pass');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
