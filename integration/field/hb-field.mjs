import assert from 'node:assert/strict';
import { installEnv } from './env.mjs';
installEnv();
await import('../dist/esm/app/globals.js');
const field=await import('../dist/esm/seq/field-play.js');
const {appState}=await import('../dist/esm/app/state.js');
const {seqState}=await import('../dist/esm/seq/state.js');
const {portFor}=await import('../dist/esm/track/registry.js');
const {installMockEngine}=await import('./mock-engine.mjs');
const {seqEngineTick}=await import('../dist/esm/seq/engine.js');
const {padsPlayNotes}=await import('../dist/esm/seq/router-pads.js');
installMockEngine();seqEngineTick();seqState.sessionMode=false;
const writes=[];portFor(appState.activeTrack.index).setParam=(key,value)=>{writes.push([key,value]);return true;};
field.setFieldEnabled(true);assert.equal(padsPlayNotes(),false);
assert(field.fieldMidi([144,71,100]));assert.deepEqual(writes.at(-1),['midi_fx1:field_gesture','0,25']);
field.fieldPad('launchpad',63,true,8,8);assert.deepEqual(writes.at(-1),['midi_fx1:field_gesture','400,400']);
field.fieldPad('remote',4,true,8,4);assert.deepEqual(writes.at(-1),['midi_fx1:field_gesture','100,25']);
field.releaseFieldSource('remote');assert.deepEqual(writes.at(-1),['midi_fx1:field_gesture','400,400']);
field.releaseFieldSource('launchpad');assert.deepEqual(writes.at(-1),['midi_fx1:field_gesture','0,25']);
field.fieldMidi([128,71,0]);assert.deepEqual(writes.at(-1),['midi_fx1:field_release','1']);
assert.equal(field.fieldPad('remote',NaN,true),false);assert.equal(field.fieldColors('move').length,32);assert.equal(field.fieldColors('launchpad',8,8).length,64);
const before=writes.length;field.fieldSnapshot();assert.equal(writes.length,before);
field.setFieldEnabled(false);assert.equal(padsPlayNotes(),true);
console.log('Field Play: native/Launchpad/remote gesture parity, source releases, no notes, geometry and read-only snapshot pass');
const strips=await import('../dist/esm/seq/field-outputs.js');
const snapshot=(vertical=0)=>'fo1,1,'+vertical+',0,'+Array.from({length:16},()=>[5000,3500,1]).flat().join(',');
assert(strips.outputSnapshot(snapshot()));
const frame=()=>strips.outputFrame().split(',').slice(1).map(Number);
strips.outputPad('move',3,true,4);strips.outputPad('launchpad',15,true,8);
assert.equal(frame()[0],4286);assert.equal(frame()[1],10000);
strips.outputPressure('move',3,60);assert.equal(frame()[0],4286,'first pressure anchors without jumping');
strips.outputPressure('move',3,127);assert(frame()[0]>4286&&frame()[0]<5001);
const beforeTouch=frame()[0];strips.outputKnob(0,true);assert.equal(frame()[0],beforeTouch,"knob touch must not double pressure offset");
strips.outputKnob(0,true,10);const tuned=frame()[0];assert(tuned>4286);
strips.outputPressure('move',3,60);assert(frame()[0]<tuned,'pressure remains an offset with knob active');
strips.releaseOutputs('launchpad');assert.equal(frame()[1],-1);assert(frame()[0]>=0);
strips.releaseOutputs();assert(frame().every(value=>value===-1));
const pixels=strips.outputPixels(4);assert(Math.abs(pixels[2][1]-.55)<1e-10);assert(Math.abs(pixels[3][1]-.45)<1e-10);
assert.equal(strips.outputColors('launchpad',8).length,64);
assert(strips.outputColors('move',4).every(value=>value>=0&&value<128));
strips.outputSnapshot(snapshot(1));strips.outputPad('move',24,true,4);assert.equal(frame()[0],10000,'vertical increases upward');
strips.outputPad('move',0,true,4);assert.equal(frame()[0],0);strips.outputPad('move',0,false,4);assert.equal(frame()[0],10000,'release restores other held pad');
strips.outputSnapshot(snapshot());assert(frame().every(value=>value===-1),'layout change releases holds');
console.log('Output strips: independent holds, pressure anchor, knob offset, release restoration, orientation and brightness interpolation pass');

strips.outputSnapshot('fo2,1,0,0,'+Array.from({length:16},()=>[5000,3500,1]).flat().join(',')+',1,3,0,0');
assert(strips.latchMode&&strips.outputs[0].latched&&strips.outputs[1].latched);
strips.outputPad('move',3,true,4);strips.outputPressure('move',3,40);strips.outputPressure('move',3,120);
const requested=frame()[0];const finish=strips.outputPad('move',3,false,4);assert.deepEqual(finish,{lane:0,value:requested});
strips.outputPad('move',3,true,4);strips.releaseOutputs();assert.equal(strips.outputPad('move',3,false,4),undefined,'cancel does not commit on stale note-off');
strips.outputPad('move',3,true,4);strips.outputSnapshot('fo2,1,0,0,'+Array.from({length:16},()=>[5000,3500,1]).flat().join(',')+',1,2,1,0');
assert.equal(frame()[0],-1);assert(strips.outputs[1].latched,'clearing one preserves another latch');
console.log('Latch UI: requested pressure target, latch feedback, source cancellation and remote clear acknowledgment pass');

field.setFieldEnabled(true);field.tickField(Date.now());
strips.outputSnapshot('fo2,1,0,0,'+Array.from({length:16},()=>[5000,3500,1]).flat().join(',')+',1,0,0,0');
let failFinish=true;portFor(appState.activeTrack.index).setParam=(key,value)=>{if(key==='midi_fx1:field_output_finish'&&failFinish){failFinish=false;return false;}writes.push([key,value]);return true;};
field.fieldPad('move',3,true);const releaseStart=writes.length;field.fieldPad('move',3,false);
assert(!writes.slice(releaseStart).some(([key])=>key==='midi_fx1:field_outputs'),'busy finish must not be overtaken by release frame');
field.tickField(Date.now()+50);assert(writes.slice(releaseStart).some(([key,value])=>key==='midi_fx1:field_output_finish'&&value==='0,0,4286'));
field.setFieldEnabled(false);
console.log('Latch delivery: busy writes retry finish before clearing its source lease');

assert(strips.outputLabels('fl1;Vel10%|Velocity amount 10%'+(';--|Unmapped').repeat(15)));assert.equal(strips.outputs[0].label,'Vel10%');assert.equal(strips.outputs[0].description,'Velocity amount 10%');assert.equal(strips.outputLabels('fl1;broken'),false);


const xyMode=await import('../dist/esm/seq/mode-buttons.js');
strips.outputSnapshot('fo2,1,0,0,'+Array.from({length:16},()=>[5000,3500,1]).flat().join(',')+',0,0,0,0');
field.setFieldEnabled(true);
assert(field.fieldXYAvailable(),'the existing Field Outputs view is the only XY layout owner');
assert(!field.fieldXYActive(),'legacy Field output strips remain the default');
assert(xyMode.modeButtonMidi(xyMode.CC_MODE_LOOP,127,false),'Loop toggles the field pad layout only in Outputs');
assert(field.fieldXYActive());
assert.equal(xyMode.modeButtonColor(xyMode.CC_MODE_LOOP,0),119,'XY Loop is bright when selected');
xyMode.modeButtonMidi(xyMode.CC_MODE_LOOP,0,false);
const xyDescriptor=xyMode.modeActionDescriptors().find(item=>item.cc===xyMode.CC_MODE_LOOP);
assert.match(xyDescriptor?.label??'',/XY/);
assert.deepEqual(field.fieldSnapshot().xyChannels,[1,2]);
assert.equal(field.fieldColors('move').length,32);
assert.equal(field.fieldColors('launchpad',8,8).length,64);
// Move's first held pad owns X/Y; a second pad only selects Y.
// The existing outputFrame, Field DSP lease and gate system are unchanged.
field.fieldPad('move',10,true);
assert.deepEqual(frame().slice(0,2),[2857,10000]);
field.fieldPad('move',23,true);
assert.deepEqual(frame().slice(0,2),[2857,3333]);
const yHeld=frame()[1];
field.fieldPressure('move',23,40);
assert.equal(frame()[1],yHeld,'pressure anchors without jumping');
field.fieldPressure('move',23,120);
assert(frame()[1]>yHeld,'Y pressure adds fine control within half a pad row');
field.fieldPad('move',23,false);
assert.deepEqual(frame().slice(0,2),[2857,10000],'lifting second finger restores the first finger Y');
const finishesAt=writes.filter(([key])=>key==='midi_fx1:field_output_finish').length;
field.fieldPad('move',10,false);
assert(frame().slice(0,2).every(value=>value===-1));
assert.equal(writes.filter(([key])=>key==='midi_fx1:field_output_finish').length,finishesAt+2,'the last release forwards both existing DSP latches');
assert(!strips.outputXYActive('move'));
const afterRelease=writes.length;
field.fieldPad('move',10,false);
field.fieldPressure('move',10,127);
assert.equal(writes.length,afterRelease,'stale note-off and aftertouch cannot rearm');

// Launchpad's 8x8 cells use the same two channels with finer vertical travel.
field.fieldPad('launchpad',0,true,8,8);
field.fieldPad('launchpad',63,true,8,8);
assert.deepEqual(frame().slice(0,2),[0,0]);
assert(strips.outputXYActive('launchpad'));
field.releaseFieldSource('launchpad');
assert(frame().slice(0,2).every(value=>value===-1));
assert(!strips.outputXYActive('launchpad'));
field.fieldPad('launchpad',63,false,8,8);
assert(frame().slice(0,2).every(value=>value===-1),'late Launchpad release after disconnect cannot relatch');

// The same two-pad bank follows the existing Jog bank; a global clear must
// never erase the unrelated Field channels.
strips.outputSnapshot('fo2,1,0,1,'+Array.from({length:16},()=>[5000,3500,1]).flat().join(',')+',0,0,0,0');
assert.deepEqual(field.fieldSnapshot().xyChannels,[5,6]);
field.fieldPad('move',3,true);
assert.equal(frame()[4],4286);assert.equal(frame()[5],10000);
assert.equal(frame()[0],-1);
const clearStart=writes.length;
field.fieldPad('move',6,true,8,4,true);
assert(writes.slice(clearStart).some(([key,value])=>key==='midi_fx1:field_output_clear'&&value==='4'));
assert(writes.slice(clearStart).some(([key,value])=>key==='midi_fx1:field_output_clear'&&value==='5'));
assert(!writes.slice(clearStart).some(([key,value])=>key==='midi_fx1:field_output_clear'&&value==='16'));
field.fieldPad('move',3,false);
assert(frame().every(value=>value===-1),'cleared XY touch cannot relatch');
assert(!strips.outputXYActive('move'));

// Mode switch is cancellation, not a latch. Existing strips and their
// pressure/knob behavior are restored immediately on the next pad press.
strips.outputSnapshot('fo2,1,0,0,'+Array.from({length:16},()=>[5000,3500,1]).flat().join(',')+',0,0,0,0');
field.fieldPad('move',14,true);
assert(strips.outputXYActive('move'));
const switchStart=writes.length;
assert(xyMode.modeButtonMidi(xyMode.CC_MODE_LOOP,127,false));
assert(!field.fieldXYActive());
assert(!strips.outputXYActive('move'));
assert(!writes.slice(switchStart).some(([key])=>key==='midi_fx1:field_output_finish'));
xyMode.modeButtonMidi(xyMode.CC_MODE_LOOP,0,false);
field.fieldPad('move',3,true);assert.equal(frame()[0],4286,'legacy strip layout restored');
field.releaseFieldSource('move');
field.setFieldEnabled(false);
console.log('Physical MIDI XY: Move 8x4 and Launchpad 8x8 first/second touch, Z fine Y, bank navigation, Loop LED/help, source cancel, pair clear and legacy strips pass');
