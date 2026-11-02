import test from 'node:test';
import assert from 'node:assert/strict';
import {files as packagedRoutes} from '../wasm/serve.mjs';
import {functionalTemplates,analyzeHarmonicFunction,createHarmonicFunctionTracker}
 from './harmonic-function.mjs';

const major={tonic:0,name:'Major',notes:[0,2,4,5,7,9,11]};
const minor={tonic:9,name:'Natural Minor',notes:[9,11,0,2,4,5,7]};
const signal=notes=>Array.from({length:12},(_,index)=>notes.includes(index)?1:0);
const chord=notes=>analyzeHarmonicFunction(signal(notes),major);

test('requires a valid explicit seven-note tonic hypothesis',()=>{
 assert.equal(functionalTemplates(major).length,6);
 assert.equal(functionalTemplates(minor).length,4);
 assert(!functionalTemplates(minor).some(entry=>entry.degree===7),'natural minor bVII is not an automatic dominant');
 const harmonicMinor={tonic:9,notes:[9,11,0,2,4,5,8]};
 assert(functionalTemplates(harmonicMinor).some(entry=>entry.functionName==='D'&&entry.degree===7),'raised leading-tone VII can be dominant');
 assert.equal(functionalTemplates({...major,notes:[0,2]}).length,0);
 assert.equal(functionalTemplates({...major,notes:[2,4,5,7,9,11,0]}).length,0);
 assert.equal(analyzeHarmonicFunction(signal([0,4,7]),null).functionName,'?');
});

test('I-IV-V-I produces broad functions but does not manufacture chord names',()=>{
 for(const [notes,expected] of [
  [[0,4,7],'T'],[[5,9,0],'PD'],[[7,11,2],'D'],[[0,4,7],'T']
 ]){
  const result=chord(notes);
  assert.equal(result.functionName,expected,JSON.stringify({notes,result}));
  assert.equal(typeof result.strength,'number');
  assert.equal('chordName' in result,false);
 }
});

test('monophonic melody, dyads, silence and ambiguous mixed chords abstain',()=>{
 for(const notes of [[],[0],[0,7],[0,4],[0,4,7,5,9,2,11]])
  assert.equal(chord(notes).functionName,'?',JSON.stringify(notes));
});

test('chromatic note is an independent flag, not a fabricated fourth function',()=>{
 const values=signal([7,11,2]);values[1]=0.5;
 const result=analyzeHarmonicFunction(values,major);
 assert.equal(result.chromatic,true);
 assert(['D','?'].includes(result.functionName));
 const diatonic=chord([7,11,2]);
 assert.equal(diatonic.chromatic,false);
});

test('tonic and relative minor remain an explicit user hypothesis',()=>{
 assert.equal(analyzeHarmonicFunction(signal([0,4,7]),major).functionName,'T');
 assert.equal(analyzeHarmonicFunction(signal([9,0,4]),minor).functionName,'T');
 assert.equal(chord([0,4,7]).functionName,'T');
});

test('never infer change before dwell, freeze on stopped input, cap timeline',()=>{
 const tracker=createHarmonicFunctionTracker({minimumDwellMs:300,maxSegments:3});
 assert.equal(tracker.pin(major),true);
 const play=(notes,start)=>{for(let ms=start;ms<=start+400;ms+=100)tracker.observe(signal(notes),ms);};
 tracker.observe(signal([0,4,7]),0);
 assert.equal(tracker.snapshot().segments.length,0);
 play([0,4,7],100);
 assert.deepEqual(tracker.snapshot().segments.map(x=>x.functionName),['T']);
 play([5,9,0],600);play([7,11,2],1200);play([0,4,7],1800);
 assert.deepEqual(tracker.snapshot().segments.map(x=>x.functionName),['PD','D','T']);
 assert.equal(tracker.snapshot().pinned.tonic,0);
 tracker.unpin();
 assert.equal(tracker.snapshot().segments.length,0);
 assert.equal(tracker.snapshot().active,false);
});

test('silence and discontinuous timestamps never force a cadence',()=>{
 const tracker=createHarmonicFunctionTracker({minimumDwellMs:200});
 tracker.pin(major);
 for(const ms of [0,100,200])tracker.observe(signal([0,4,7]),ms);
 assert.equal(tracker.snapshot().segments.length,1);
 tracker.observe(signal([]),300);
 assert.equal(tracker.snapshot().segments.length,1);
 tracker.observe(signal([0,4,7]),5000);
 assert.equal(tracker.snapshot().segments.length,1);
 tracker.observe(signal([0,4,7]),5100);
 assert.equal(tracker.snapshot().segments.length,1);
 tracker.observe(signal([0,4,7]),5200);
 assert.equal(tracker.snapshot().segments.length,2,'long disconnect must create a new segment');
});

test('invalid audio is ignored and cannot poison the timeline',()=>{
 const tracker=createHarmonicFunctionTracker();
 tracker.pin(major);
 tracker.observe([NaN,...new Array(11).fill(0)],1000);
 assert.equal(tracker.snapshot().segments.length,0);
 assert.equal(tracker.snapshot().current,null);
});

test('packaged site includes Scale Finder and its harmonic function dependency',()=>{
 assert(packagedRoutes.has('/local/scale-finder-ui.mjs'));
 assert(packagedRoutes.has('/local/harmonic-function.mjs'),
  'direct ES module import must be copied into offline browser package');
});
