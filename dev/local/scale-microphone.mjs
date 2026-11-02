/** Opt-in, browser-only pitch-class observation.
 * No microphone samples are sent to HarmonyBus, the Move, or a remote server.
 * A small, capped 12-value chroma message goes to the local browser worker.
 */
export function frequencyToPitchClass(frequency){
 if(!Number.isFinite(frequency)||frequency<=0)return null;
 return ((Math.round(69+12*Math.log2(frequency/440))%12)+12)%12;
}

/** FFT magnitude -> conservative chroma. This is evidence, NOT a definitive
 * polyphonic transcription: harmonics of loud notes can cause false positives.
 * The ranker therefore never applies a key automatically.
 */
export function spectrumToChroma(decibels,sampleRate,fftSize){
 const result=new Array(12).fill(0);
 if(!Number.isFinite(sampleRate)||sampleRate<8000||!Number.isInteger(fftSize)||fftSize<256||
    !decibels||decibels.length<fftSize/2)return result;
 const hertzPerBin=sampleRate/fftSize;
 // Keep high-frequency noise and sub-bass movement out of the pitch estimator.
 const binAt=frequency=>Math.round(frequency/hertzPerBin);
 const strength=frequency=>{
   const index=binAt(frequency);
   if(index<2||index+2>=decibels.length)return 0;
   let maxDb=-120;
   for(let offset=-1;offset<=1;offset++)
    maxDb=Math.max(maxDb,decibels[index+offset]);
   if(maxDb<-72)return 0;
   return Math.pow(10,(Math.min(-12,maxDb)+72)/32);
 };
 for(let midi=42;midi<=88;midi++){
   const fundamental=440*Math.pow(2,(midi-69)/12);
   const energy=strength(fundamental)+.3*strength(fundamental*2)+.13*strength(fundamental*3);
   const note=midi%12;
   result[note]=Math.max(result[note],energy);
 }
 const peak=Math.max(...result);
 if(peak<.001)return result;
 return result.map(value=>Math.round(100*Math.max(0,Math.min(1,value/peak)))/100);
}

export function createScaleMicrophone({onChroma,onStatus=()=>{}}){
 let generation=0,stream=null,audioContext=null,source=null,analyser=null,timer=null,pending=null;
 const supported=()=>!!globalThis.navigator?.mediaDevices?.getUserMedia&&
    !!(globalThis.AudioContext||globalThis.webkitAudioContext);
 const stop=()=>{
   ++generation;
   if(timer!==null){clearInterval(timer);timer=null;}
   try{source?.disconnect();}catch{}
   source=null;analyser=null;
   for(const track of stream?.getTracks()??[])track.stop();
   stream=null;
   const context=audioContext;audioContext=null;
   if(context)void context.close().catch(()=>{});
   onStatus('Microphone stopped · evidence retained');
 };
 const start=async()=>{
   if(!supported()){onStatus('Microphone requires HTTPS and browser audio permission');return false;}
   if(timer!==null)return true;
   if(pending)return pending;
   const attempt=++generation;
   pending=(async()=>{
    let obtained=null,context=null;
    try{
     obtained=await navigator.mediaDevices.getUserMedia({
       audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},
       video:false
     });
     if(attempt!==generation){obtained.getTracks().forEach(track=>track.stop());return false;}
     const AudioApi=globalThis.AudioContext||globalThis.webkitAudioContext;
     context=new AudioApi({latencyHint:'playback'});
     const input=context.createMediaStreamSource(obtained);
     const analyserNode=context.createAnalyser();
     analyserNode.fftSize=8192;analyserNode.smoothingTimeConstant=.12;
     analyserNode.minDecibels=-100;analyserNode.maxDecibels=-10;
     input.connect(analyserNode); // Deliberately never connect to speakers.
     await context.resume();
     if(attempt!==generation){
       input.disconnect();obtained.getTracks().forEach(track=>track.stop());
       void context.close();return false;
     }
     audioContext=context;stream=obtained;source=input;analyser=analyserNode;
     const decibels=new Float32Array(analyserNode.frequencyBinCount);
     timer=setInterval(()=>{
       if(!analyser||document.hidden){stop();return;}
       analyser.getFloatFrequencyData(decibels);
       onChroma(spectrumToChroma(decibels,audioContext.sampleRate,analyser.fftSize));
     },90);
     onStatus('Listening · Loop stops and retains evidence');
     return true;
    }catch(error){
     for(const track of obtained?.getTracks()??[])track.stop();
     if(context)void context.close().catch(()=>{});
     if(attempt===generation)onStatus('Microphone unavailable: '+(error?.message??'permission denied'));
     return false;
    }
   })();
   try{return await pending;}finally{pending=null;}
 };
 return {start,stop,supported,get active(){return timer!==null;}};
}
