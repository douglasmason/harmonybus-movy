import assert from 'node:assert/strict';
import {chromium} from '../local/node_modules/playwright/index.mjs';
import {serve} from './serve.mjs';
const server=serve(0);
await new Promise(resolve=>server.once('listening',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready'));
 // No engine server exists, and even the static server is unavailable now.
 await context.setOffline(true);
 await page.click('#seed');
 let notes=[];
 for(let step=0;step<5;step++){await page.click('#step');notes.push(...JSON.parse(await page.locator('#output').textContent()).output);}
 assert(notes.some(event=>((event>>>16)&255)===145),'actual follower output after network disconnect');
 await page.click('#stop');
 assert.deepEqual(errors,[]);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS Chromium: static-only load, offline compiled engines, clip replay, HB follower output, Stop, phone width');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
