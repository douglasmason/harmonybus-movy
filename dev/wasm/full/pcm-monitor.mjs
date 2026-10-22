/** UI lifecycle for actual compiled synth PCM; no synthesis on the page thread. */
export class PcmMonitor {
 constructor(worker){this.worker=worker;this.enabled=false;this.generation=0;this.levels=[.6,.6,.6,.6];this.muted=[false,false,false,false];this.context=null;this.stats={};this.moduleSource=null;this.previousSessionType=null;this.startupTimer=null;this.phase='Disabled';this.transitions=[];this.lastError=null;this.master=.35;}
 diagnostic(){
  let outputPeak=0;
  if(this.context?.state==='running'&&this.analyser?.getFloatTimeDomainData){const samples=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(samples);for(const value of samples)outputPeak=Math.max(outputPeak,Math.abs(value));}
  return {phase:this.phase,context:this.context?.state??'closed',engineRate:44100,outputRate:this.context?.sampleRate??null,audioSession:globalThis.navigator?.audioSession?.type??'unavailable',masterGain:this.gain?.gain.value??this.master,actorLevels:this.levels,actorMuted:this.muted,outputPeak,...this.stats,transitions:this.transitions.slice(-8),error:this.lastError,userAgent:globalThis.navigator?.userAgent??''};
 }
 report(text){this.onStatus?.(text);this.onDiagnostic?.(this.diagnostic());}
 async bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out. Tap Enable audio again in Safari.`)),5000);})]);}finally{clearTimeout(timer);}}
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
  this.phase='Starting';this.lastError=null;this.report('Starting audio…');
  // The production engines use 44.1 kHz. Reject unsupported rates, never retune them.
  try{
   const context=new AudioContext({sampleRate:44100,latencyHint:'interactive'});this.context=context;
   if(!context.audioWorklet)throw new Error('AudioWorklet is unavailable. Open the HTTPS page directly in Safari.');
   context.onstatechange=()=>{
    if(this.context!==context)return;
    this.transitions.push(context.state);
    if(this.enabled&&context.state!=='running'){const state=context.state;this.disable();this.phase=state;this.report(`Audio ${state}. Tap Enable audio to resume.`);}
   };
   // Invoke resume synchronously in the click handler, before any network/module await.
   await this.bounded(context.resume(),'Audio startup');
   if(generation!==this.generation)return false;
   if(context.sampleRate!==44100)throw new Error(`Output is ${context.sampleRate} Hz; engine requires 44100 Hz. No pitch or timing conversion was applied.`);
   if(!this.moduleSource)throw new Error('Audio processor has not loaded. Reload the page while online.');
   const moduleURL=URL.createObjectURL(new Blob([this.moduleSource],{type:'text/javascript'}));
   try{await this.bounded(context.audioWorklet.addModule(moduleURL),'Audio processor loading');}finally{URL.revokeObjectURL(moduleURL);}
   if(generation!==this.generation){if(context.state!=='closed')await context.close();return false;}
   const node=new AudioWorkletNode(context,'hb-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});this.node=node;
   this.analyser=context.createAnalyser();this.gain=context.createGain();this.gain.gain.value=this.master;
   node.connect(this.gain);this.gain.connect(this.analyser);this.analyser.connect(context.destination);
   const channel=new MessageChannel();
   node.port.onmessage=({data})=>{
    if(data.type!=='stats'||generation!==this.generation)return;
    this.stats=data;if(data.rendered>0)clearTimeout(this.startupTimer);
    this.phase='Running';this.report(data.rendered>0?`Audio running · ${data.peak>.0001?'sound generated':'no notes sounding'} · ${context.sampleRate} Hz`:'Audio running · waiting for engine samples');
   };
   node.onprocessorerror=()=>{this.disable();this.lastError='Audio processor failed';this.report('Audio processor failed. Tap Enable audio to retry.');};
   await this.bounded(context.resume(),'Audio activation');
   if(generation!==this.generation)return false;
   if(context.state!=='running')throw new Error(`AudioContext is ${context.state}. Tap Enable audio to retry.`);
   node.port.postMessage({type:'connect',port:channel.port1},[channel.port1]);
   this.worker.postMessage({type:'audio-start',port:channel.port2},[channel.port2]);
   this.stats={};this.enabled=true;
   this.report('Audio enabled · waiting for output');
   this.startupTimer=setTimeout(()=>{if(this.enabled&&generation===this.generation)this.report('No engine samples received. Disable audio, then enable it again.');},3000);
   return true;
  }catch(error){if(generation!==this.generation)return false;this.disable();this.lastError=error.message;this.phase='Failed';this.report(error.message);throw error;}
 }
 async testSpeaker(){
  if(!this.enabled&&!await this.enable())return;
  const context=this.context,oscillator=context.createOscillator(),envelope=context.createGain();
  oscillator.frequency.value=440;envelope.gain.setValueAtTime(0,context.currentTime);envelope.gain.linearRampToValueAtTime(.08,context.currentTime+.02);envelope.gain.setValueAtTime(.08,context.currentTime+.35);envelope.gain.linearRampToValueAtTime(0,context.currentTime+.4);
  oscillator.connect(envelope);envelope.connect(this.gain);oscillator.start();oscillator.stop(context.currentTime+.42);
  oscillator.onended=()=>{oscillator.disconnect();envelope.disconnect();};
  this.report('Speaker test: short 440 Hz tone. If silent, check iPad media volume and output route.');
 }
 disable(){
  this.generation++;this.enabled=false;this.phase='Disabled';clearTimeout(this.startupTimer);
  this.worker.postMessage({type:'audio-stop'});
  this.node?.disconnect();this.node=null;
  if(this.context&&this.context.state!=='closed')void this.context.close();
  this.context=null;this.gain=null;this.analyser=null;
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
