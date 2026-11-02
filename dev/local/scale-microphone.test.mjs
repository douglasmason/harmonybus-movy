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

test('microphone fails closed without browser audio APIs',async()=>{
 const status=[];
 const mic=createScaleMicrophone({onChroma:()=>{},onStatus:value=>status.push(value)});
 assert.equal(mic.supported(),false);
 assert.equal(await mic.start(),false);
 assert.equal(mic.active,false);
 mic.stop();
 assert.match(status.join(' '),/requires HTTPS/);
});
