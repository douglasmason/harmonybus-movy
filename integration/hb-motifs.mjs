import assert from 'node:assert/strict';
import { installEnv } from './env.mjs';
installEnv();
const {setFlag}=await import('../dist/esm/seq/flags.js');
setFlag('hbsteprow',1);
const { seqState }=await import('../dist/esm/seq/state.js');
const { appState }=await import('../dist/esm/app/state.js');
const { setEditGuard }=await import('../dist/esm/seq/engine.js');
const recorder=await import('../dist/esm/seq/step-rec.js');
const motifs=await import('../dist/esm/renderer/hb-motif.js');
const feedback=await import('../dist/esm/renderer/motif-feedback.js');
const { ledFrameReset, ledBudgetTake }=await import('../dist/esm/seq/led-cache.js');
let row=[-1,0,0,-1,0,-1,...Array(32).fill(0),0,60,0];
const writes=[],songEdits=[];let refuseSave=false;
setEditGuard(command=>songEdits.push(command));
const port={performanceTrack:appState.activeTrack.index,ctl:{page:{keys:['motif_slot']}},
 performanceGet(key){return key==='motif_lane'?'1':key==='motif_row'?row.join(','):key==='motif_slot'?'1':'REC 1 Step 1';},
 performanceSet(key,value){writes.push([key,value]);if(key==='motif_record')row[0]=row[0]<0?0:refuseSave?row[0]:-1;if(key==='motif_cancel')row[0]=-1;if(key==='motif_copy')row[0]=0;if(key==='motif_step')row[2]=Number(value)-1;if(key==='motif_arrow')row[2]+=Number(value);}
};
const originalLength=seqState.lenSteps;
assert(!motifs.motifStep([0x90,16,100],port));
assert(motifs.motifAction(port,'motif_edit'));assert(!recorder.stepRecActive(),'Opening editor does not start recording');
assert(motifs.motifEditorFor(appState.activeTrack.index));
assert(motifs.motifRecordButton(true));assert(motifs.motifRecordButton(false));assert(recorder.stepRecActive());
recorder.stepRecPad(80,60,100);recorder.stepRecPad(81,64,100);recorder.stepRecPadRelease(80);recorder.stepRecPadRelease(81);
recorder.stepRecArrow(1);assert.deepEqual(writes.at(-1),['motif_arrow','1']);
recorder.stepRecStepTap(3);assert.deepEqual(writes.at(-1),['motif_step','4']);
assert.equal(recorder.stepRecHead(),3);assert.equal(seqState.lenSteps,originalLength);
assert.deepEqual(songEdits,[],'Motif entry must never enqueue clip del/addp/clen/hold');
let sends=0;globalThis.move_midi_internal_send=()=>sends++;
ledFrameReset();motifs.paintMotif(port);assert(sends<=16);
ledFrameReset();assert(ledBudgetTake(40));const before=sends;motifs.paintMotif(port);assert.equal(sends,before,'No writes beyond shared LED budget');
assert(recorder.stepRecDownAt(0),'Record ends latched motif capture');assert(!recorder.stepRecActive());
assert(!recorder.stepRecUpAt(10),'Release cannot toggle song recording');
// A failed save on track switch retains the backend draft without hijacking
// the new track's normal step recorder, then resumes without overwriting it.
motifs.motifAction(port,'motif_record');refuseSave=true;
const originalTrack=appState.activeTrack.index;appState.activeTrack.index=originalTrack+1;
motifs.paintMotif(port);assert(!motifs.motifEditing());assert.equal(row[0],0);
appState.activeTrack.index=originalTrack;
const writesBeforeResume=writes.length;motifs.motifAction(port,'motif_record');
assert(motifs.motifEditing());assert.equal(writes.length,writesBeforeResume);
refuseSave=false;motifs.motifFinish();assert.equal(row[0],-1);
const beforeCopy=writes.length;
assert(motifs.motifAction(port,'motif_copy'));assert(motifs.motifEditing());
assert.deepEqual(writes.slice(beforeCopy),[['motif_copy','Copy to Slot']],'Copy adopts backend draft without toggling it closed');
motifs.motifFinish();
motifs.motifAction(port,'motif_edit');
const packets=[];globalThis.move_midi_internal_send=packet=>packets.push(packet);
for(let frame=0;frame<3;frame++){ledFrameReset();motifs.paintMotif(port);motifs.motifRecordLight();motifs.motifKnobLight(port,0);}
for(const [kind,note] of [[0x90,16],[0x90,0],[0xb0,71]])assert(packets.some(packet=>packet[1]===kind&&packet[2]===note&&packet[3]===37),'Selected motif controls use solid amber');
assert(packets.some(packet=>packet[1]===0xba&&packet[2]===86),'Record button retains its recording pulse');
assert(packets.filter(packet=>packet[1]===0x9a).every(packet=>packet[3]!==127),'RGB feedback never uses the red palette entry as white brightness');
const quiet=packets.length;ledFrameReset();motifs.paintMotif(port);motifs.motifRecordLight();motifs.motifKnobLight(port,0);assert.equal(packets.length,quiet,'Steady selections and record pulse require no repeated MIDI writes');
motifs.motifAction(port,'motif_close');assert(!motifs.motifRecordLight());assert(!motifs.motifKnobLight(port,0));
row[0]=-2;row[2]=1;row[5]=2;row[6]=row[7]=row[8]=2;
ledFrameReset();motifs.paintMotif(port);assert(!recorder.stepRecActive(),'Tap guidance must not take the song editing destination');
assert.deepEqual(songEdits,[]);row[0]=-1;
feedback.motifSplash(0,60,4,1000);
assert.equal(feedback.motifFeedbackColor(118,1,60,'pitch',1100),118,'Feedback belongs to its track');
assert.equal(feedback.motifFeedbackColor(118,0,60,'pitch',1500),118,'Feedback restores base color');
assert.equal(feedback.motifFeedbackColor(118,0,80,'pitch',1100),118,'Wave stays within six semitones');
assert.equal(feedback.motifFeedbackColor(118,0,61,'pitch',1101),feedback.motifFeedbackColor(118,0,61,'pitch',1149),'Animation updates at most 20 fps');
motifs.resetMotif();setEditGuard(null);
console.log('Motifs: latched native entry routing, no song edits, release ownership, LED budget and finite pitch feedback pass');
