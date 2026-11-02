/** Opt-in, browser-only pitch-class observation.
 * No microphone samples are sent to HarmonyBus, the Move, or a remote server.
 * A small, capped 12-value chroma message goes to the local browser worker.
 */
export function frequencyToPitchClass(frequency){
 if(!Number.isFinite(frequency)||frequency<=0)return null;
 return ((Math.round(69+12*Math.log2(frequency/440))%12)+12)%12;
}

/** Local FFT peaks -> harmonic-residual pitch-class evidence.
 * Never turn this into automatic chord transcription or key changes.
 * Low notes remain limited by the FFT's ~5.4 Hz bin resolution at 44.1 kHz.
 */
export function spectrumToChroma(decibels,sampleRate,fftSize){
 const result=new Array(12).fill(0);
 if(!Number.isFinite(sampleRate)||sampleRate<8000||!Number.isInteger(fftSize)||fftSize<256||
    !decibels||decibels.length<fftSize/2)return result;
 const hertzPerBin=sampleRate/fftSize;
 const lowestMidi=42,highestMidi=88;
 const spectrum=new Array(highestMidi-lowestMidi+1).fill(0);
 // A single low FFT bin often falls inside several candidate ±1-bin
 // searches; that created adjacent-note ghosts even for a pure C. Attribute
 // each *local spectral peak* exactly once to its nearest semitone.
 const lowestFrequency=440*Math.pow(2,(lowestMidi-69)/12);
 const highestFrequency=440*Math.pow(2,(highestMidi-69)/12);
 const startBin=Math.max(2,Math.floor(lowestFrequency/hertzPerBin)-2);
 const endBin=Math.min(decibels.length-2,Math.ceil(highestFrequency/hertzPerBin)+2);
 for(let bin=startBin;bin<=endBin;bin++){
   const level=decibels[bin];
   if(level<-72||level<decibels[bin-1]||level<=decibels[bin+1])continue;
   const exactMidi=69+12*Math.log2((bin*hertzPerBin)/440);
   const midi=Math.round(exactMidi);
   if(midi<lowestMidi||midi>highestMidi||Math.abs(exactMidi-midi)>.5)continue;
   const energy=Math.pow(10,(Math.min(-12,level)+72)/32);
   const index=midi-lowestMidi;
   spectrum[index]=Math.max(spectrum[index],energy);
 }
 for(let index=0;index<spectrum.length;index++){
   const third=index>=19?.28*spectrum[index-19]:0;
   const fifth=index>=28?.20*spectrum[index-28]:0;
   const energy=Math.max(0,spectrum[index]-third-fifth);
   const pitchClass=(lowestMidi+index)%12;
   result[pitchClass]=Math.max(result[pitchClass],energy);
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
     onStatus('Listening · Sample stops and retains evidence');
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
