/** Thin API transport around the complete compiled production Movy plugin. */
import createModule from '../build/full/engine.mjs';
export async function createFullEngine(options={}) {
 const module=await createModule(options);
 const initialize=module.cwrap('full_init','number',['string']);
 const set=module.cwrap('full_set',null,['string','string']);
 const get=module.cwrap('full_get','string',['string']);
 if(initialize('/modules')!==0)throw new Error('Production host initialization failed');
 function events(){
  if(module._full_overflow())throw new Error('Browser MIDI capture overflow');
  return Array.from({length:module._full_count()},(_,index)=>{const packed=module._full_event(index)>>>0;return [packed>>>24,(packed>>>16)&255,(packed>>>8)&255,packed&255];});
 }
 function request(operation,...args){
  module._full_clear();let value=null,pcm;
  if(operation==='set')set(...args);
  else if(operation==='get')value=get(args[0]);
  else if(operation==='step'){
   if(!Number.isInteger(args[0])||args[0]<0||args[0]>4096)throw new Error('Invalid block count');
   module._full_step(args[0]);
  }else if(operation==='render'){
   if(!Number.isInteger(args[0])||args[0]<1||args[0]>8)throw new Error('Invalid audio block count');
   const pointer=module._full_render(args[0]);
   pcm=module.HEAP16.slice(pointer/2,pointer/2+args[0]*256);
  }else if(operation==='midi'){
   const values=String(args[0]).split(',').map(Number);
   if(values.length!==3||values.some(value=>!Number.isInteger(value))||module._full_midi(...values)!==0)throw new Error('Invalid MIDI');
  }else throw new Error('Unsupported operation');
  return {value,events:events(),...(pcm?{pcm}:{})};
 }
 return {request};
}
