/** Browser storage envelope around production sequencer, module and mixer serializers. */
import {encodeBulk,decodeBulk,lfoStateKeys,lfoPairs,wrapState,parseState,adler32} from '../../local/build/session-codecs.mjs';
export const MAX_SESSION_BYTES=8*1024*1024;
const required=(value,label)=>{if(typeof value!=='string'||!value||value.length>1048575)throw new Error(`Cannot save/read ${label}`);return value;};
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
// HB's production loader forces its retired clip_context field to Live (0).
// It is still serialized as 1 by a fresh instance; no other difference is accepted.
const normalizeHB=value=>typeof value==='string'?value.replace(/^hb16,([^;]+)/,prefix=>{const fields=prefix.split(',');if(fields.length===26)fields[16]='0';return fields.join(',');}):value;
const sameState=(left,right)=>{try{return canonical(JSON.parse(left))===canonical(JSON.parse(right));}catch{return normalizeHB(left)===normalizeHB(right);}};
function checksum(payload){return adler32(JSON.stringify(payload));}
function checkChains(chains){
 if(!Array.isArray(chains)||chains.length!==16)throw new Error('Session must contain all 16 browser tracks');
 for(let track=0;track<16;track++){
  const item=chains[track];
  if(item?.track!==track||item.components?.length!==2)throw new Error(`Invalid components on track ${track+1}`);
  for(const [index,component] of ['midi_fx1','synth'].entries()){
   const entry=item.components[index];
   if(entry?.component!==component||entry.module!==(index===0?'harmonybus':'nusaw'))throw new Error(`Unsupported instrument/effect on track ${track+1}: ${entry?.module??'missing'} (${entry?.component??component}). This host supports HarmonyBus + NuSaw only.`);
   required(entry.state,`track ${track+1} ${component} state`);
  }
  if(!lfoPairs(item.lfo)||typeof item.mix!=='string'||!/^[-0-9.,]+$/.test(item.mix))throw new Error(`Invalid LFO/mixer state on track ${track+1}`);
 }
}
export function capturePayload(engine,ui={}){
 const read=key=>engine.request('get',key).value;
 const doc=decodeBulk(read('chains'));
 if(!doc||doc.length!==16*6)throw new Error('Unsupported or incomplete chain set; export would discard modules');
 const chains=[];
 for(let track=0;track<16;track++){
  const components=[];
  for(const component of ['midi_fx1','synth']){
   const entries=[];for(let index=0;index<doc.length;index+=3)if(doc[index]===String(track)&&doc[index+1]===component)entries.push(doc[index+2]);
   if(entries.length!==1)throw new Error(`Missing/duplicate ${component} on track ${track+1}`);
   components.push({component,module:entries[0],state:required(read(`ch${track}:${component}:state`),component)});
  }
  chains.push({track,components,lfo:lfoStateKeys().map(key=>read(`ch${track}:${key}`)??''),mix:read(`ch${track}:mix`)});
 }
 checkChains(chains);
 for(let bus=0;bus<2;bus++)if(read(`snd${bus}:module`))throw new Error('Send effects are unsupported; session was not saved');
 const sequencer=required(read('state'),'sequencer');
 if(!sequencer.startsWith('movy1\n'))throw new Error('Invalid production sequencer state');
 return {sequencer:wrapState(sequencer,1),chains,ui};
}
export async function sealSession(payload,build){
 const session={format:'harmonybus-browser-session',version:1,build,savedAt:new Date().toISOString(),payload,checksum:checksum(payload)};
 if(JSON.stringify(session).length>MAX_SESSION_BYTES)throw new Error('Session exceeds 8 MB limit');
 return session;
}
export async function validateSession(session){
 if(!session||session.format!=='harmonybus-browser-session'||session.version!==1)throw new Error('Unsupported session format/version');
 if(JSON.stringify(session).length>MAX_SESSION_BYTES)throw new Error('Session exceeds 8 MB limit');
 if(checksum(session.payload)!==session.checksum)throw new Error('Session checksum mismatch; file may be damaged');
 const state=parseState(session.payload?.sequencer);
 if(!state||state.legacy)throw new Error('Invalid or incomplete sequencer snapshot');
 checkChains(session.payload.chains);
 const ui=session.payload.ui;
 if(!ui||typeof ui!=='object'||Array.isArray(ui))throw new Error('Invalid session UI state');
 for(const key of ['levels','muted'])if(ui[key]!==undefined&&(!Array.isArray(ui[key])||ui[key].length!==4||ui[key].some(value=>key==='levels'?typeof value!=='number'||!Number.isFinite(value)||value<0||value>1:typeof value!=='boolean')))throw new Error('Invalid audio mix controls');
 return state.payload;
}
/** Apply only to a fresh candidate engine; caller swaps it in after all readbacks pass. */
export async function restoreCandidate(engine,session){
 const state=await validateSession(session),payload=session.payload;
 const triples=payload.chains.flatMap(track=>track.components.flatMap(entry=>[String(track.track),entry.component,entry.module]));
 const doc=encodeBulk(triples);
 engine.request('set','chains',doc);engine.request('step',128);
 if(engine.request('get','chains').value!==doc)throw new Error('Engine rejected chain modules');
 engine.request('set','state',state);
 if(engine.request('get','state').value!==state)throw new Error('Engine cannot restore this sequencer state without changes');
 for(const track of payload.chains){
  for(const entry of track.components)engine.request('set',`ch${track.track}:${entry.component}:state`,entry.state);
  // Zero Hz is the production sentinel for an uninitialized LFO. A write would
  // clamp it to 0.1 Hz; leave the fresh candidate's zero sentinel intact.
  for(const [key,value] of lfoPairs(track.lfo))if(!key.endsWith(':rate_hz')||Number(value)!==0)engine.request('set',`ch${track.track}:${key}`,value);
  engine.request('set',`ch${track.track}:mix`,track.mix);
 }
 // Validate after ALL restores: HB has shared settings, so a later track can affect an earlier one.
 for(const track of payload.chains){
  for(const entry of track.components)if(!sameState(engine.request('get',`ch${track.track}:${entry.component}:state`).value,entry.state))throw new Error(`State readback differs on track ${track.track+1} ${entry.component}`);
  if(engine.request('get',`ch${track.track}:mix`).value!==track.mix)throw new Error(`Mixer readback differs on track ${track.track+1}`);
  for(const [key,value] of lfoPairs(track.lfo))if(engine.request('get',`ch${track.track}:${key}`).value!==value)throw new Error(`Unsupported LFO state: track ${track.track+1} ${key}`);
 }
 return payload.ui;
}
