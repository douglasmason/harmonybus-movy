/** Test real controller/analyzer sources with a deterministic host and binary WAV. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { resolve } from 'node:path';
const stripTypeScriptTypes=nodeModule.stripTypeScriptTypes || (source=>nodeModule.createRequire(resolve(process.argv[2],'package.json'))('typescript').transpile(source,{target:99,module:99}));
const load = source => import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const { OutputWave }=await load(readFileSync(new URL('../integration/audio-profile/output-wave.ts',import.meta.url),'utf8'));
function wav(silent=false,glitch=false) {
    const frames=44100*11, bytes=Buffer.alloc(44+frames*4);
    bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(44100,24);bytes.writeUInt32LE(176400,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*4,40);
    for(let frame=0;frame<frames;frame++) {
        const triangle=2*Math.abs(2*((frame*220/44100)%1)-1)-1;
        const value=silent?0:Math.round(triangle*2048);
        bytes.writeInt16LE(glitch&&frame===100000?30000:value,44+frame*4);bytes.writeInt16LE(Math.round(value/2),46+frame*4);
    }
    return bytes;
}
function file(bytes) {
    let cursor=0,closed=false;
    return {read(buffer,position,count){assert(!closed);const size=Math.min(count,bytes.length-cursor);new Uint8Array(buffer,position,size).set(bytes.subarray(cursor,cursor+size));cursor+=size;return size;},seek(offset){cursor=offset;return 0;},close(){closed=true;},get closed(){return closed;}};
}
for(const silent of [false,true]) {
    const input=file(wav(silent)), analyzer=new OutputWave(input);
    let ticks=0;while(!analyzer.tick())ticks++;
    assert(ticks>100);assert(input.closed);assert.equal(analyzer.result.frames,485100);
    assert.equal(analyzer.result.windows.length,110);
    if(silent)assert(analyzer.result.windows.every(row=>row[4]===0&&row[6]===0));
    else {assert(analyzer.result.windows.every(row=>row[6]>1600&&row[7]>800));assert(Math.max(...analyzer.result.windows.map(row=>row[8]))<50);}
}
const corrupt=new OutputWave(file(wav(false,true)));while(!corrupt.tick()){}assert(Math.max(...corrupt.result.windows.map(row=>row[8]))>20000);
const shortFile=file(wav().subarray(0,50));const truncated=new OutputWave(shortFile);assert.throws(()=>truncated.tick(),/TRUNCATED/);assert(shortFile.closed);
const invalid=file(Buffer.alloc(44));assert.throws(()=>new OutputWave(invalid),/RIFF/);assert(invalid.closed);

let sequence=1,recording=false,stops=0,overlay={samplerState:0,samplerSource:0,samplerSamplesWritten:0,transportPlaying:0},written={},commands=[];
const seqState={playing:false,recording:false,countingIn:false,cpuTone:'2,900000,0,0,2646000',workerBuild:'test-build'};
globalThis.outputTestEnv={appState:{dirty:false},seqState,seqCmd:command=>commands.push(command),statusSeq:()=>sequence,engineReady:()=>true,currentSetUuid:()=> 'test-set',sessionReady:()=>true,safeWrite:(path,text)=>{written[path]=JSON.parse(text);return true;},OutputWave};
globalThis.shadow_get_overlay_state=()=>({...overlay});globalThis.host_sampler_start=()=>{recording=true;overlay.samplerState=2;return true;};globalThis.host_sampler_stop=()=>{stops++;return true;};globalThis.host_sampler_is_recording=()=>recording;globalThis.std={open:()=>file(wav())};
const source=readFileSync(new URL('../integration/audio-profile/output-capture.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const controller=await load('const {appState,seqState,seqCmd,statusSeq,engineReady,currentSetUuid,sessionReady,safeWrite,OutputWave}=globalThis.outputTestEnv;\n'+source);
const {outputCapture,clickOutputCapture,tickOutputCapture,cancelOutputCapture}=controller;
// Existing recording is never stopped or replaced.
clickOutputCapture(0);overlay.samplerState=2;recording=true;clickOutputCapture(1);assert.equal(outputCapture.stage,'error');assert.equal(stops,0);
recording=false;overlay.samplerState=0;cancelOutputCapture();
clickOutputCapture(10);clickOutputCapture(11);sequence++;tickOutputCapture(12);assert.equal(outputCapture.stage,'settle');tickOutputCapture(1012);assert.equal(outputCapture.stage,'recording');
overlay.samplerSamplesWritten=1000;tickOutputCapture(1100);overlay.samplerSamplesWritten=22050;tickOutputCapture(1512);assert.equal(outputCapture.stage,'tone');sequence++;tickOutputCapture(1513);assert.equal(outputCapture.stage,'tone','stale completed tone must not pass');
seqState.cpuTone='1,1000,0,0,1000';sequence++;tickOutputCapture(1550);seqState.cpuTone='2,880236,0,0,441000';sequence++;tickOutputCapture(11512);assert.equal(outputCapture.stage,'tail');tickOutputCapture(12012);assert.equal(stops,1);assert.equal(outputCapture.stage,'finalizing');
tickOutputCapture(12013);assert.equal(outputCapture.stage,'finalizing','wait for recorder file completion');recording=false;overlay.samplerState=0;tickOutputCapture(12014);assert.equal(outputCapture.stage,'analysis');
for(let count=0;count<200&&outputCapture.stage==='analysis';count++)tickOutputCapture(12015+count);
assert.equal(outputCapture.stage,'results');const report=Object.values(written)[0];assert(report.complete);assert.match(report.observation,/present/);assert.equal(report.initialOverlay.samplerSource,0);
// Cancel during pending capture start must request stop, even before recorder acknowledgment.
cancelOutputCapture();clickOutputCapture(20000);clickOutputCapture(20001);sequence++;tickOutputCapture(20002);tickOutputCapture(21002);cancelOutputCapture();assert.equal(stops,2);assert.equal(outputCapture.stage,'idle');
console.log('PASS: waveform silence/tone/discontinuity, truncated input, recorder ownership, stale status, finalization and cancellation');
