import test from 'node:test';
import assert from 'node:assert/strict';
import {frequencyToPitchClass,spectrumToChroma,createScaleMicrophone} from './scale-microphone.mjs';

test('pitch-class conversion preserves octave classes and rejects invalid frequency',()=>{
 assert.equal(frequencyToPitchClass(440),9);
 assert.equal(frequencyToPitchClass(880),9);
 assert.equal(frequencyToPitchClass(261.626),0);
 assert.equal(frequencyToPitchClass(-1),null);
 assert.equal(frequencyToPitchClass(Infinity),null);
});

test('silence returns bounded zero chroma, sinusoid evidence peaks on correct pitch',()=>{
 const fftSize=8192,sampleRate=44100;
 const silence=new Float32Array(fftSize/2).fill(-100);
 assert.deepEqual(spectrumToChroma(silence,sampleRate,fftSize),Array(12).fill(0));
 const tone=new Float32Array(fftSize/2).fill(-105);
 const target=440;
 const bin=Math.round(target*fftSize/sampleRate);
 tone[bin]=-23;
 const chroma=spectrumToChroma(tone,sampleRate,fftSize);
 assert.equal(chroma.length,12);
 assert.equal(chroma[9],1,'A is the loudest detected pitch class');
 assert(chroma.every(value=>Number.isFinite(value)&&value>=0&&value<=1));
 assert.deepEqual(spectrumToChroma(tone,0,fftSize),Array(12).fill(0));
});

test('harmonic-rich C is not misidentified as G or E',()=>{
 const fftSize=8192,sampleRate=44100;
 const spectrum=new Float32Array(fftSize/2).fill(-105);
 const assign=(midi,level)=>{
  const frequency=440*Math.pow(2,(midi-69)/12);
  const bin=Math.round(frequency*fftSize/sampleRate);
  spectrum[bin]=level;
 };
 assign(48,-23); // C3 fundamental
 assign(60,-28); // C4 second harmonic
 assign(67,-34); // G4 third harmonic, NOT an independent G
 assign(76,-43); // E5 fifth harmonic, NOT an independent E
 const result=spectrumToChroma(spectrum,sampleRate,fftSize);
 assert.equal(result[0],1);
 assert(result[7]<.12,'third partial should not be reported as G: '+result);
 assert(result[4]<.12,'fifth partial should not be reported as E: '+result);
});

test('real simultaneous chord fundamentals survive overtone suppression',()=>{
 const fftSize=8192,sampleRate=44100;
 const spectrum=new Float32Array(fftSize/2).fill(-105);
 for(const [midi,level] of [[48,-24],[52,-22],[55,-24],[74,-35],[83,-35]]){
  const frequency=440*Math.pow(2,(midi-69)/12);
  spectrum[Math.round(frequency*fftSize/sampleRate)]=level;
 }
 const result=spectrumToChroma(spectrum,sampleRate,fftSize);
 for(const note of [0,4,7])assert(result[note]>.5,'missed C major triad tone '+note+': '+result);
 for(const note of [2,11])assert(result[note]<.16,'accepted overtone as independent note '+note+': '+result);
});

test('genuine upper fifth remains when separately played',()=>{
 const fftSize=8192,sampleRate=44100;
 const spectrum=new Float32Array(fftSize/2).fill(-105);
 for(const [midi,level] of [[48,-24],[67,-23]]){
  const hz=440*Math.pow(2,(midi-69)/12);
  spectrum[Math.round(hz*fftSize/sampleRate)]=level;
 }
 const result=spectrumToChroma(spectrum,sampleRate,fftSize);
 assert(result[7]>.3,'true G4 should remain independently visible: '+result);
});

test('low-level actual upper fifth survives residual removal',()=>{
 const fftSize=8192,sampleRate=44100;
 const spectrum=new Float32Array(fftSize/2).fill(-105);
 for(const [midi,level] of [[48,-24],[67,-29]]){
  const frequency=440*Math.pow(2,(midi-69)/12);
  spectrum[Math.round(frequency*fftSize/sampleRate)]=level;
 }
 const result=spectrumToChroma(spectrum,sampleRate,fftSize);
 assert(result[7]>.2,'independently played quieter fifth must remain: '+result);
});

test('microphone fails closed without browser audio APIs',async()=>{
 const status=[];
 const mic=createScaleMicrophone({onChroma:()=>{},onStatus:value=>status.push(value)});
 assert.equal(mic.supported(),false);
 assert.equal(await mic.start(),false);
 assert.equal(mic.active,false);
 mic.stop();
 assert.match(status.join(' '),/requires HTTPS/);
});
