/** Canonical Movy cmd values; both runtimes keep production transport semantics. */
export function transportCommand(action){
 if(action!=='play'&&action!=='stop')throw new Error('Unsupported transport action');
 return action;
}
export function deviceTransportMessage(action){
 return {type:'set_param',slot:0,key:'overtake_dsp:cmd',value:transportCommand(action)};
}
/** Whitelist the existing controller's transport snapshot; never forward session content. */
export function deviceTransportState(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.playing!=='boolean'||!['idle','armed','count-in','recording'].includes(value.phase))return null;
 const {playing,phase,track,slot}=value;
 if(!(track===null||Number.isInteger(track)&&track>=0&&track<16)||!(slot===null||Number.isInteger(slot)&&slot>=0&&slot<8))return null;
 if(track===null&&slot!==null||phase==='idle'&&(track!==null||slot!==null)||phase==='armed'&&track===null)return null;
 return {playing,phase,track,slot};
}
