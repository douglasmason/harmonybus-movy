/** Exercise the shipped control rows and observe packets sent to the real Worker. */
import assert from 'node:assert/strict';
export async function checkEncoderActions(browser,url){
 const page=await browser.newPage({viewport:{width:1180,height:820},hasTouch:true});
 try{
  await page.addInitScript(()=>{
   window.inputPackets=[];
   const postMessage=Worker.prototype.postMessage;
   Worker.prototype.postMessage=function(message,...rest){
    if(message.type==='send'){
     const data=JSON.parse(message.data);
     if(data.type==='move_midi'||data.type==='dev_release')window.inputPackets.push(data);
    }
    return postMessage.call(this,message,...rest);
   };
  });
  await page.goto(url);await page.waitForFunction(()=>{const button=document.querySelector('[aria-label="Step 1"]');return button&&!button.disabled;});
  const button=name=>page.getByRole('button',{name,exact:true});
  const packets=()=>page.evaluate(()=>window.inputPackets.filter(packet=>packet.type==='move_midi').map(packet=>packet.data));
  const clear=()=>page.evaluate(()=>{window.inputPackets=[];});
  assert.equal(await page.locator('.encoder-card').count(),10);
  assert.equal(await page.locator('.encoder-action').count(),14);
  // Eight knobs and Volume reuse the two selected-encoder rows; Jog keeps its own.
  for(const [name,index,touch] of [...Array.from({length:8},(_,slot)=>['Knob '+(slot+1),71+slot,slot]),['Volume',79,8],['Jog',14,9]]){
   if(name!=='Jog')await page.locator('#encoder').selectOption(String(index));
   const card=page.locator(name==='Jog'?'.encoder-card[data-encoder="14"]':'#encoder-actions');
   assert.equal(await card.locator('.encoder-action-row').count(),2);
   for(const shift of [false,true]){
    const actions=['left','touch',...(name==='Jog'?['click']:[]),'right'];
    assert.deepEqual(await card.locator(`[data-shift="${shift}"] button`).evaluateAll(elements=>elements.map(element=>element.dataset.action)),actions);
    for(const action of actions){
     const label=(shift?'Shift + ':'')+name+' '+(['left','right'].includes(action)?'turn '+action:action);
     await clear();await button(label).press('Enter');
     const expected=action==='click'?[[176,3,127],[176,3,0]]:[[144,touch,127],...(['left','right'].includes(action)?[[176,index,action==='left'?127:1]]:[]),[144,touch,0]];
     assert.deepEqual(await packets(),shift?[[176,49,127],...expected,[176,49,0]]:expected,label);
    }
   }
  }
  // A latched Shift remains held after a shifted click and the physical Shift.
  await page.locator('#shift').check();await clear();
  await button('Shift + Jog click').click();await button('Shift').press('Enter');
  assert.deepEqual(await packets(),[[176,3,127],[176,3,0]]);
  assert(await page.locator('#shift').isChecked());
  await page.locator('#shift').uncheck();
  assert.deepEqual((await packets()).at(-1),[176,49,0]);
  // Two independent shifted touches and a duplicate alias share one modifier.
  await clear();
  const event=async(name,type)=>page.getByRole('button',{name,exact:true}).dispatchEvent(type,{key:'Enter',bubbles:true});
  await page.locator('#encoder').selectOption('71');
  await event('Shift + Knob 1 touch','keydown');await event('Shift + Jog touch','keydown');
  assert(await page.locator('#encoder').isDisabled(),'selection stays attached to a held gesture');
  await event('Knob 1 touch','keydown');await event('Knob 1 touch','keyup');
  await event('Shift + Knob 1 touch','keyup');
  assert.deepEqual(await packets(),[[176,49,127],[144,0,127],[144,9,127],[144,0,0]]);
  await event('Shift + Jog touch','keyup');
  assert.deepEqual((await packets()).slice(-2),[[144,9,0],[176,49,0]]);
  // The large Jog's tap cannot release an already-held explicit Click.
  await clear();await event('Jog click','keydown');await button('Jog').press('Enter');
  assert.deepEqual(await packets(),[[176,3,127],[144,9,127],[144,9,0]]);
  await event('Jog click','keyup');assert.deepEqual((await packets()).at(-1),[176,3,0]);
  // Escape drops a shifted Jog click without synthesizing a release action.
  await clear();await event('Shift + Jog click','keydown');await page.keyboard.press('Escape');await event('Shift + Jog click','keyup');
  assert.deepEqual(await page.evaluate(()=>window.inputPackets),[{type:'move_midi',data:[176,49,127]},{type:'move_midi',data:[176,3,127]},{type:'dev_release'}]);
  await page.waitForFunction(async()=>(await __wasmStats()).move.held===0);
  for(const viewport of [{width:768,height:1024},{width:390,height:844},{width:601,height:850},{width:850,height:850},{width:1180,height:820}]){
   await page.setViewportSize(viewport);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await page.locator('#knobs').isVisible(),viewport.width>850,'individual knobs collapse on small screens');
   assert(await page.locator('#encoder-actions').evaluate(element=>element.getBoundingClientRect().top>=document.querySelector('#encoder').getBoundingClientRect().bottom),'actions sit below the selector');
   assert(await page.locator('.encoder-action').evaluateAll(elements=>elements.every(element=>element.scrollWidth<=element.clientWidth&&element.getBoundingClientRect().width>=32)),'action labels fit '+viewport.width);
  }
  console.log('PASS all 62 encoder actions, distinct Jog touch/click, Shift ownership, cancellation and responsive labels');
 }finally{await page.close();}
}
