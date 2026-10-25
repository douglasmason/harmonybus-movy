/** End-to-end UI check. Uses an installed Playwright Chromium or HB_BROWSER. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async()=>{
  const {startServer}=await import('./server.mjs');
  const service=await startServer({port:0});
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.HB_BROWSER?{executablePath:process.env.HB_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    const page=await browser.newPage({viewport:{width:1100,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${service.port}/?tool=1`);
    await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Processor connected');
    await page.getByRole('button',{name:'C major',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#harmony').textContent.includes('C E G'));
    await page.locator('[data-pitch="60"]').dispatchEvent('pointerdown',{pointerId:1});
    await page.getByRole('button',{name:'D minor',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#state').textContent.includes('D4'));
    await page.locator('[data-pitch="60"]').dispatchEvent('pointerup',{pointerId:1});
    await page.getByRole('button',{name:'Release all',exact:true}).click();
    await page.locator('#travel').selectOption('None');
    await page.waitForFunction(()=>document.querySelector('#state').textContent.includes('"None"'));
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'phone layout fits');
    if(process.env.HB_SCREENSHOT)await page.screenshot({path:process.env.HB_SCREENSHOT,fullPage:true});
    await page.goto(`http://127.0.0.1:${service.port}/movy`);
    const version=(await service.processor.request('get','ch1:midi_fx1:version')).value;
    await page.waitForFunction(expected=>globalThis.__movy_model?.getViewModel().rows[0][0]?.displayValue===expected,version);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Movy phone layout fits');
    await page.locator('#btn-next').click();
    await page.waitForFunction(()=>globalThis.__movy_model.getViewModel().bankIndex===1);
    await page.waitForTimeout(300); // Native subscription fills the newly visible bank.
    const key='ch1:midi_fx1:master_transpose';
    const before=(await service.processor.request('get',key)).value;
    const knob=page.locator('#knob-0');const box=await knob.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-35,{steps:8});await page.mouse.up();
    await page.waitForTimeout(250);
    assert.notEqual((await service.processor.request('get',key)).value,before,'existing virtual knob writes native HB');
    await page.locator('#preset-select').selectOption('0');
    await page.waitForFunction(()=>globalThis.__movy_model.getViewModel().rows[0][2]?.displayValue==='1');
    await page.locator('#preset-select').selectOption('2');
    await page.waitForFunction(()=>globalThis.__movy_model.getViewModel().rows[0][2]?.displayValue==='3');
    await page.goto(`http://127.0.0.1:${service.port}/field?tool=1&component=ch1:midi_fx1`);
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Connected'));
    await page.locator('#override').selectOption('1');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('latch overrides'));
    const slider=page.getByRole('slider',{name:'Lane 1 field output',exact:true});
    await slider.focus();await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('.label').textContent.includes(' · L'));
    const field=(await service.processor.request('get','ch1:midi_fx1:field_outputs_view2')).value.split(',').slice(1).map(Number);
    assert.equal(field[52]&1,1,'production field panel creates native latch');
    await page.getByRole('button',{name:'Release all',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.label').textContent.includes(' · L'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Field Outputs phone layout fits');
    assert.deepEqual(errors,[]);console.log('Browser: real chord change, held-note travel, release, parameter edit, phone layout passed');
  }finally{await browser?.close();await service.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
