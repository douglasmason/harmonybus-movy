/** UI lifecycle for actual compiled synth PCM; no synthesis on the page thread. */
export class PcmMonitor {
 constructor(worker){this.worker=worker;this.enabled=false;this.generation=0;this.levels=[.6,.6,.6,.6];this.muted=[false,false,false,false];this.context=null;this.stats={};this.moduleSource=null;this.previousSessionType=null;this.startupTimer=null;}
 async prepare(){
  const response=await fetch(new URL('./pcm-worklet.mjs',import.meta.url));
  if(!response.ok)throw new Error('Missing audio processor');
  this.moduleSource=await response.text();
 }
 async enable(){
  const generation=++this.generation;
  if(!globalThis.isSecureContext)throw new Error('Audio needs HTTPS. Open this page in Safari using its https link.');
  if(!globalThis.AudioContext||!globalThis.AudioWorkletNode)throw new Error('AudioWorklet is unavailable. Open this page directly in Safari.');
  // WebKit otherwise classifies Web Audio as ambient, which can obey Silent Mode.
  if(navigator.audioSession){
   try{this.previousSessionType=navigator.audioSession.type;navigator.audioSession.type='playback';}catch{this.previousSessionType=null;}
  }
  this.onStatus?.('Starting audio…');
  // The production engines use 44.1 kHz. Reject unsupported rates, never retune them.
  try{
   const context=new AudioContext({sampleRate:44100,latencyHint:'interactive'});this.context=context;
   if(!context.audioWorklet)throw new Error('AudioWorklet is unavailable. Open the HTTPS page directly in Safari.');
   await context.resume();
   if(context.sampleRate!==44100)throw new Error('Compiled synth requires a 44.1 kHz AudioContext');
   const moduleURL=URL.createObjectURL(new Blob([this.moduleSource],{type:'text/javascript'}));
   try{await context.audioWorklet.addModule(moduleURL);}finally{URL.revokeObjectURL(moduleURL);}
   if(generation!==this.generation){if(context.state!=='closed')await context.close();return false;}
   const node=new AudioWorkletNode(context,'hb-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});this.node=node;
   this.analyser=context.createAnalyser();this.gain=context.createGain();this.gain.gain.value=.35;
   node.connect(this.gain);this.gain.connect(this.analyser);this.analyser.connect(context.destination);
   const channel=new MessageChannel();
   node.port.onmessage=({data})=>{
    if(data.type!=='stats'||generation!==this.generation)return;
    this.stats=data;clearTimeout(this.startupTimer);
    this.onStatus?.(data.rendered>0?`Audio running · ${data.peak>.0001?'sound generated':'no notes sounding'} · ${context.sampleRate} Hz`:'Audio running · waiting for engine samples');
   };
   node.onprocessorerror=()=>{this.disable();this.onStatus?.('Audio processor failed. Tap Enable audio to retry.');};
   node.port.postMessage({type:'connect',port:channel.port1},[channel.port1]);
   this.worker.postMessage({type:'audio-start',port:channel.port2},[channel.port2]);
   this.stats={};this.enabled=true;
   this.onStatus?.('Audio enabled · waiting for output');
   this.startupTimer=setTimeout(()=>{if(this.enabled&&generation===this.generation)this.onStatus?.('No audio output received. Disable audio, then enable it again.');},3000);
   context.onstatechange=()=>{if(this.context===context&&this.enabled&&context.state!=='running'){const state=context.state;this.disable();this.onStatus?.(`Audio ${state}. Tap Enable audio to resume.`);}};
   for(let actor=0;actor<4;actor++)this.mix(actor,this.levels[actor],this.muted[actor]);
   return true;
  }catch(error){if(generation!==this.generation)return false;this.disable();throw error;}
 }
 disable(){
  this.generation++;this.enabled=false;clearTimeout(this.startupTimer);
  this.worker.postMessage({type:'audio-stop'});
  this.node?.disconnect();this.node=null;
  if(this.context&&this.context.state!=='closed')void this.context.close();
  this.context=null;
  if(this.previousSessionType!==null){try{navigator.audioSession.type=this.previousSessionType;}catch{}this.previousSessionType=null;}
  this.onDisable?.();
 }
 mix(actor,level,muted){
  this.levels[actor]=Math.max(0,Math.min(1,level));this.muted[actor]=muted;
  this.worker.postMessage({type:'audio-mix',actor,level:this.muted[actor]?0:this.levels[actor]});
 }
 silence(){/* Stop/release is ordered with the engine command and flushes queued PCM. */}
 consume(){/* The compiled chain supplies PCM, not a second MIDI synthesizer. */}
}
