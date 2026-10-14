/** End-to-end UI check. Uses an installed Playwright Chromium or HB_BROWSER. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async()=>{
  const {startServer}=await import('./server.mjs');
  const service=await startServer({port:0});
  const browser=await chromium.launch({headless:true,...(process.env.HB_BROWSER?{executablePath:process.env.HB_BROWSER}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  try {
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
    assert.deepEqual(errors,[]);console.log('Browser: real chord change, held-note travel, release, parameter edit, phone layout passed');
  }finally{await browser.close();await service.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
