import './hb-chord-pad-feedback.mjs';
import assert from 'node:assert/strict';
const chord=await import('../dist/esm/seq/chord-play.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const usage=await import('../dist/esm/app/interface-usage.js');
let now=1000000;Date.now=()=>now;
chord.setChordEnabled(true);seqState.playing=false;seqState.recording=false;
globalThis.tick();
const page=chord.chordPage(),pageTick=page.tick;
page.tick=()=>{now+=7;pageTick();};
const log=console.log,messages=[];
console.log=(...args)=>messages.push(args.join(' '));
const files=new Map();
usage.initInterfaceUsage();
globalThis.host_write_file=(path,text)=>{now+=5;files.set(path,text);};
globalThis.host_read_file=path=>files.get(path)??null;
try{
    // Two windows guarantee one complete 120-tick sample, regardless of fixture ticks.
    for(let index=0;index<240;index++){
        now+=100;
        usage.usageAction('usage_export',true);
        globalThis.tick();
    }
}finally{console.log=log;page.tick=pageTick;}
const phases=messages.filter(line=>line.includes('perf_phase'));
const totals=messages.filter(line=>line.includes('perf_ipc'));
const lastPhases=phases.at(-1),lastTotal=totals.at(-1);
assert(lastPhases&&lastTotal,'whole app tick emits profiler samples');
assert.equal(Number(/chords=([\d.]+)/.exec(lastPhases)?.[1]),7,'Chord Play prelude is timed');
assert.equal(Number(/usage=([\d.]+)/.exec(lastPhases)?.[1]),10,'usage journal and report writes are timed');
assert(Number(/tick_ms=([\d.]+)/.exec(lastTotal)?.[1])>=17,'total includes work before tickBody and after it');
console.log('UI whole-tick timing: '+lastPhases+' / '+lastTotal);
