/** Canonical Movy cmd values; both runtimes keep production transport semantics. */
export function transportCommand(action){
 if(action!=='play'&&action!=='stop')throw new Error('Unsupported transport action');
 return action;
}
export function deviceTransportMessage(action){
 return {type:'set_param',slot:0,key:'overtake_dsp:cmd',value:transportCommand(action)};
}
