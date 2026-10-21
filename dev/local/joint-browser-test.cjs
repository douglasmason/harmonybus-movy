const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const {startServer}=await import('./server.mjs');
 const service=await startServer({port:0});let browser;
 const requests=[];const nativeRequest=service.processor.request.bind(service.processor);
 service.processor.request=(...args)=>{requests.push(args);return nativeRequest(...args);};
 async function nativeValue(key,expected){
  for(let attempt=0;attempt<50;attempt++){
   const value=(await nativeRequest('get',key)).value;if(value===expected)return;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal((await nativeRequest('get',key)).value,expected,key);
 }
 try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.HB_BROWSER?{executablePath:process.env.HB_BROWSER}:{})});
  const page=await browser.newPage({viewport:{width:1100,height:1000}});const errors=[];
  page.on('websocket',socket=>socket.on('framereceived',frame=>{const value=JSON.parse(String(frame.payload));if(value.type==='error'){errors.push(value.message);console.error(value.message);}}));
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.goto(`http://127.0.0.1:${service.port}/joint`);
  await page.waitForFunction(()=>globalThis.__joint?.page().ready);
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#status').textContent(),'Native Joint Play connected');
  await page.waitForFunction(()=>[...document.querySelectorAll('.pad')].some(pad=>pad.style.backgroundColor!=='rgb(0, 0, 0)'&&pad.style.backgroundColor!==''));
  const root=page.getByRole('button',{name:'Pad 1',exact:true});
  await root.focus();await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  await nativeValue('ch0:midi_fx1:pad_output','po1,48');
  await nativeValue('ch1:midi_fx1:pad_output','po1,48');
  await page.keyboard.up('Space');
  await nativeValue('ch0:midi_fx1:pad_output','po1');
  await nativeValue('ch1:midi_fx1:pad_output','po1');
  const actorPage=await page.evaluate(()=>__joint.page().ctl.pages.findIndex(item=>item.keys?.includes('joint_actor_3_travel_map')));
  await page.locator('#panel').selectOption(String(actorPage));
  await page.waitForFunction(()=>document.querySelector('[data-key="joint_actor_3_travel_map"]'));
  const travel=page.locator('[data-key="joint_actor_3_travel_map"]');
  const before=(await service.processor.request('get','ch3:midi_fx1:travel_map')).value;
  await travel.focus();await page.keyboard.press('ArrowUp');await page.waitForTimeout(400);
  assert.notEqual((await nativeRequest('get','ch3:midi_fx1:travel_map')).value,before,'actor knob updates native track');
  const operationPage=await page.evaluate(()=>__joint.page().ctl.pages.findIndex(item=>item.keys?.includes('approach_bank_5')));
  assert(operationPage>=0);
  await page.locator('#panel').selectOption(String(operationPage));
  await page.waitForFunction(()=>document.querySelector('[data-key="approach_bank_5"]'));
  const operation=page.locator('[data-key="approach_bank_5"]');const operationBox=await operation.boundingBox();
  const requestStart=requests.length;
  await page.mouse.move(operationBox.x+operationBox.width/2,operationBox.y+operationBox.height/2);await page.mouse.down();
  await page.waitForTimeout(100);await page.mouse.up();await page.waitForTimeout(150);
  const touched=requests.slice(requestStart).filter(args=>args[0]==='set'&&args[1].includes('joint_pad_approach_touch_5'));
  assert(touched.some(args=>args[1]==='ch3:midi_fx1:joint_pad_approach_touch_5'&&args[2].endsWith('|Down')),'production touch reaches native melody');
  assert(touched.some(args=>args[1]==='ch3:midi_fx1:joint_pad_approach_touch_5'&&args[2].includes('|Up,')),'production release reaches original owner');
  assert(!touched.some(args=>args[1].startsWith('ch1:')),'following bass is not double modified');
  await page.locator('#panel').selectOption('0');
  await page.waitForFunction(()=>document.querySelector('[data-key="joint_unit"]'));
  const box=await root.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await nativeValue('ch0:midi_fx1:pad_output','po1,48');
  await page.locator('[data-key="joint_bass"]').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');
  await page.waitForFunction(()=>__joint.joint.jointSnapshot()[0].bass===2);
  await page.mouse.up();await nativeValue('ch0:midi_fx1:pad_output','po1');await nativeValue('ch1:midi_fx1:pad_output','po1');
  await page.locator('[data-key="joint_unit"]').focus();await page.keyboard.press('ArrowUp');
  await page.waitForFunction(()=>document.querySelector('[data-pad="0"]').textContent.startsWith('Root'));
  await page.waitForTimeout(300);
  await root.focus();await page.keyboard.down('Space');await nativeValue('ch4:midi_fx1:pad_output','po1,48');
  await page.keyboard.up('Space');await nativeValue('ch4:midi_fx1:pad_output','po1');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Joint phone layout fits');
  if(process.env.HB_JOINT_SCREENSHOT)await page.screenshot({path:process.env.HB_JOINT_SCREENSHOT,fullPage:true});
  await root.focus();await page.keyboard.down('Space');await nativeValue('ch4:midi_fx1:pad_output','po1,48');
  await page.close();await new Promise(resolve=>setTimeout(resolve,100));await nativeRequest('step',512);await nativeValue('ch4:midi_fx1:pad_output','po1');await nativeValue('ch5:midi_fx1:pad_output','po1');
  assert.deepEqual(errors,[]);
  console.log('Joint browser: real actor routing, follow bass, knob edit, operation touch/release, layout change, quartet selection, disconnect cleanup and phone layout pass');
 } finally {await browser?.close();await service.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
