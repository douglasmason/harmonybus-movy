/** Shared normalized contacts for touchscreen and MIDI MPE input. */
export const EXPRESSION_MAX=16383;
export type ExpressionPoint={x:number;y:number;pressure:number};
export function cloudPointer(event:{clientX:number;clientY:number;pointerType?:string;pressure?:number},bounds:{left:number;top:number;width:number;height:number},maximum=EXPRESSION_MAX):ExpressionPoint|null {
 if(![event.clientX,event.clientY,bounds.left,bounds.top,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)return null;
 const force=event.pointerType==='mouse'||!Number.isFinite(event.pressure)?0.85:Math.max(0,Math.min(1,event.pressure!));
 return {x:Math.round(Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width))*maximum),y:Math.round(Math.max(0,Math.min(1,1-(event.clientY-bounds.top)/bounds.height))*maximum),pressure:Math.max(1,Math.round(force*127))};
}
export type MpeContact=ExpressionPoint&{id:number;action:'down'|'move'|'up'};
/** Lower MPE zone. MIDI channel 1 is the manager; channels 2–16 own fingers.
 * X is absolute note pitch plus member/manager bend over MIDI's note range;
 * Y is CC74 and Z channel pressure. Expression alone never creates a contact.
 * RPN 6 configures the zone; RPN 0 supplies bend ranges (48/2 by default). */
export function createCloudMpeInput(emit:(contact:MpeContact)=>void){
 const fresh=(channel:number)=>({note:-1,velocity:100,bend:8192,slide:64,pressure:null as number|null,range:channel===0?2:48,cents:0,rpnMsb:127,rpnLsb:127});
 let channels=Array.from({length:16},(_,channel)=>fresh(channel)),members=15;
 function point(channel:number):ExpressionPoint {
  const member=channels[channel],manager=channels[0];
  const bend=(state:typeof member)=>(state.bend-8192)/8192*Math.min(96,state.range+state.cents/100);
  return {x:Math.round(Math.max(0,Math.min(127,member.note+bend(member)+bend(manager)))*129),y:Math.max(0,Math.min(127,member.slide+manager.slide-64))*129,pressure:Math.max(1,member.pressure??member.velocity,manager.pressure??0)};
 }
 function release(channel:number){if(channels[channel].note<0)return;emit({...point(channel),id:112+channel,action:'up',pressure:0});channels[channel].note=-1;}
 function update(channel:number){if(channel===0){for(let member=1;member<=members;member++)update(member);}else if(channels[channel].note>=0)emit({...point(channel),id:112+channel,action:'move'});}
 function releaseAll(){for(let channel=1;channel<16;channel++)release(channel);}
 function reset(){releaseAll();channels=Array.from({length:16},(_,channel)=>fresh(channel));members=15;}
 function midi(input:ArrayLike<number>):boolean {
  const data=Array.from(input),status=data[0],kind=status&240,channel=status&15;
  if(!Number.isInteger(status)||status<128||status>239||![128,144,176,208,224].includes(kind)||data.length!==(kind===208?2:3)||data.slice(1).some(value=>!Number.isInteger(value)||value<0||value>127))return false;
  if(channel>members)return false;
  const state=channels[channel],key=data[1],value=data[2];
  if(kind===128||kind===144){
   if(channel===0)return false;
   if(kind===128||value===0){if(state.note===key)release(channel);return true;}
   release(channel);state.note=key;state.velocity=value;emit({...point(channel),id:112+channel,action:'down'});return true;
  }
  if(kind===224){state.bend=key+(value<<7);update(channel);return true;}
  if(kind===208){state.pressure=key;update(channel);return true;}
  if(key===74){state.slide=value;update(channel);return true;}
  if(key===101){state.rpnMsb=value;return true;}
  if(key===100){state.rpnLsb=value;return true;}
  if(key===6||key===38){
   if(state.rpnMsb===0&&state.rpnLsb===0){if(key===6)state.range=Math.min(96,value);else state.cents=Math.min(99,value);update(channel);}
   else if(channel===0&&key===6&&state.rpnMsb===0&&state.rpnLsb===6){members=Math.min(15,value);for(let member=members+1;member<16;member++)release(member);}
   return true;
  }
  if(key===120||key===123){if(channel===0){for(let member=1;member<16;member++)release(member);}else release(channel);return true;}
  if(key===121){state.bend=8192;state.slide=64;state.pressure=null;state.rpnMsb=state.rpnLsb=127;update(channel);return true;}
  return false;
 }
 return {midi,release:releaseAll,reset};
}
