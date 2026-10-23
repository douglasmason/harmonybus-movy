import test from 'node:test';
import assert from 'node:assert/strict';
import {performanceFeedback,selectedClip} from './performance-ui.mjs';
test('recording feedback distinguishes count-in, captured notes, song playback and disabled audio',()=>{
 const clips=Array.from({length:4},(_,track)=>selectedClip(`0,abc,16,0,${track},1`,track));
 const waiting=performanceFeedback({play:'1',rec:'0',cin:'1',tick:'96'},clips,{mask:15,overwrite:5});
 assert.match(waiting.headline,/3 beats — wait/);assert.match(waiting.hint,/not captured/);assert.match(waiting.hint,/Enable audio/);
 assert.match(waiting.target,/Root T1\/C1 replace/);assert.match(waiting.target,/Bass T2\/C1 layer/);
 const recording=performanceFeedback({play:'1',rec:'1',cin:'0',tick:'384'},clips,{mask:15,audioEnabled:true});
 assert.match(recording.headline,/Recording/);assert.equal(recording.position,'Bar 2 · Beat 1');
 const stopped=performanceFeedback({play:'0',rec:'0',cin:'0',song:'0:1'},clips,{mask:15,audioEnabled:true});
 assert.equal(stopped.notes,6);assert.match(stopped.hint,/first scene/);assert.equal(stopped.position,'');
 assert.equal(selectedClip(null,0),null);
 assert.equal(performanceFeedback({},[null,null,null,null]).known,false);
});
