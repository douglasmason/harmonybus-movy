/** Exercise dropped/stale audio without relying on nondeterministic CPU overload. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
test('PCM sink bounds buffering, emits silence on starvation, and discards pre-Stop audio',async()=>{
 let Sink;const requests=[];
 runInNewContext(await readFile(new URL('./pcm-worklet.mjs',import.meta.url),'utf8'),{
  AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},
  registerProcessor:(_name,processor)=>{Sink=processor;}
 });
 const sink=new Sink(),stream={start(){},postMessage:message=>requests.push(message)};
 sink.port.onmessage({data:{type:'connect',port:stream}});
 const receive=data=>stream.onmessage({data});
 const process=()=>{const output=[new Float32Array(128),new Float32Array(128)];sink.process([], [output]);return output;};
 receive({type:'reset',epoch:1});assert.equal(requests.length,1);
 for(let index=0;index<20;index++)assert(process()[0].every(value=>value===0));
 assert.equal(requests.length,1,'only one pull outstanding during worker starvation');
 const pcm=new Int16Array(2048);for(let index=0;index<1024;index++){pcm[index*2]=16384;pcm[index*2+1]=-8192;}
 receive({type:'pcm',epoch:1,pcm});
 const stereo=process();assert.equal(stereo[0][0],.5);assert.equal(stereo[1][0],-.25);
 receive({type:'reset',epoch:2});
 receive({type:'pcm',epoch:1,pcm});assert(process()[0].every(value=>value===0),'late PCM cannot revive sound after Stop');
 receive({type:'pcm',epoch:2,pcm});receive({type:'pcm',epoch:2,pcm});receive({type:'pcm',epoch:2,pcm});
 assert.equal(sink.frames,2048,'buffer has a hard capacity');
 for(let index=0;index<16;index++)assert.equal(process()[0][0],.5);
 assert(process()[0].every(value=>value===0),'buffer exhaustion is silence, never a repeated block');
});
