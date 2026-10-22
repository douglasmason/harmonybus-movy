import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Lighting,parseField,harmonicColor,gaussianWeights,voicePosition,hsvRgb,mixHue,hueDelta} from './lighting.mjs';
import {lightingProfile,loadLightingProfile,saveLightingProfile,lightingStorageKey} from './lighting-profile.mjs';
import {observation,eventObservation} from './observations.mjs';
const terrain=value=>'nf1,1,1,'+Array(64).fill(value).join(',');
const shared=(scale='Major',key='C')=>`dp1|${key}|C|--|--|--|0|${scale}|Live / clips`;
const harmony=chord=>`hp1|--|${chord}|${chord}|${chord}`;
const event=(sequence,status,pitch=60,velocity=100)=>({sequence,packet:[9,status,pitch,velocity]});
const ingest=(model,now,events=[],status='play=0 tick=0',value=64)=>model.ingest({field:terrain(value),shared:shared(),harmony:harmony('C'),status,events},now);

test('strict field decoding and independent lane indexing',()=>{
 assert.equal(parseField('nf1,1,1,NaN'),null);assert.equal(parseField(terrain(64)).length,64);
 const lanes='fo2,0,0,0,'+Array.from({length:16},(_,index)=>`5000,${index*600},0`).join(',')+',0,0,0,0';
 assert.equal(parseField(lanes,'lanes')[12],.72);assert.equal(parseField(lanes.slice(0,-2),'lanes'),null);
});
test('hue has a continuous 360 seam and exact black / saturation behavior',()=>{
 assert.deepEqual(hsvRgb(360,1,1),hsvRgb(0,1,1));assert.deepEqual(hsvRgb(230,.7,0),[0,0,0]);
 assert.deepEqual(hsvRgb(100,0,1),[255,255,255]);assert.equal(mixHue(359,1,.5),0);
 assert.equal(hueDelta(359,1),2);
});
test('palette is modal and chord-sensitive, invariant to key spelling',()=>{
 assert.equal(harmonicColor(shared('Major','Ab'),harmony('Ab')).warmth,harmonicColor(shared(),harmony('C')).warmth);
 assert(harmonicColor(shared('Lydian'),harmony('--'),'scale').warmth>harmonicColor(shared(),harmony('--'),'scale').warmth);
 assert(harmonicColor(shared('Locrian'),harmony('Bdim')).warmth<-.9);
 assert(harmonicColor(shared(),harmony('Cm'),'chord').warmth<0);
 assert.equal(harmonicColor(shared(),harmony('Cmaj7'),'chord').warmth,.75);
 assert.equal(harmonicColor(null,null).known,false);
});
test('Gaussian position weights normalize; width controls spread; voices and degrees differ',()=>{
 const narrow=gaussianWeights([-1,-1],.25),wide=gaussianWeights([-1,-1],2);
 assert(Math.abs(wide.reduce((sum,value)=>sum+value,0)-1)<1e-12);assert(narrow[0]>.99);assert(wide[0]<.4);
 assert.notDeepEqual(voicePosition(0,60,shared()),voicePosition(1,60,shared()));
 assert.notDeepEqual(voicePosition(0,60,shared()),voicePosition(0,62,shared()));
 assert.notDeepEqual(voicePosition(0,60,shared()),voicePosition(0,72,shared()));
 // Transposition carries the degree position; register intentionally changes only vertical position.
 assert.equal(voicePosition(0,60,shared())[0],voicePosition(0,61,shared('Major','Db'))[0]);
 for(let pitch=0;pitch<128;pitch++)assert(voicePosition(2,pitch,shared()).every(Number.isFinite));
});
test('live notes react while stopped, sustain, pressure and decay without event-history retrigger',()=>{
 const model=new Lighting();ingest(model,0);model.render(0);
 for(let now=40;now<=600;now+=40){ingest(model,now);model.render(now);}
 const ambient=model.render(600).fixtures.map(fixture=>fixture.level);
 const onset=[event(1,0x90,60,127)];ingest(model,640,onset);const attacked=model.render(680);
 assert.equal(attacked.playing,false);assert.equal(attacked.held,1);
 assert(attacked.fixtures.some((fixture,index)=>fixture.level>ambient[index]+.02));
 const note=model.notes.get(60);ingest(model,720,onset);assert.equal(note.started,640);
 ingest(model,760,[...onset,event(2,0xa0,60,110)]);assert.equal(note.pressure,110/127);
 ingest(model,800,[...onset,event(2,0xa0,60,110),event(3,0x80,60,0)]);assert.equal(model.notes.size,0);
 for(let now=840;now<2200;now+=40){ingest(model,now);model.render(now);}
 assert.equal(model.envelopes.size,0);
 assert(model.frame.every((fixture,index)=>Math.abs(fixture.level-ambient[index])<.02));
});
test('MIDI gap, stale telemetry, blackout and suspension cannot leave a light latched',()=>{
 const model=new Lighting();ingest(model,0);ingest(model,40,[event(1,0x93,72)]);model.render(40);
 ingest(model,80,[event(300,0x93,74)]);assert.equal(model.notes.size,1);
 model.settings.blackout=true;assert(model.render(100).fixtures.every(fixture=>fixture.level===0));
 model.settings.blackout=false;model.render(1000);assert.equal(model.notes.size,0);
 model.suspend();assert(model.render(1040).fixtures.every(fixture=>fixture.level===0));
});
test('all-notes-off clears only its voice; output on unrelated channels is ignored',()=>{
 const model=new Lighting();ingest(model,0);ingest(model,40,[event(1,0x90),event(2,0x91),event(3,0x9f)]);
 assert.equal(model.notes.size,2);ingest(model,80,[event(4,0xb0,123,0)]);assert.equal(model.notes.size,1);
 assert.equal([...model.notes.values()][0].channel,1);
});
test('downbeat cursor reverses and rejoins field; transport uses tick not wall-clock beat',()=>{
 const model=new Lighting();for(let now=0;now<=1000;now+=40)ingest(model,now,[],'play=0 tick=0',Math.floor(now/10));
 model.settings.vinyl=1;ingest(model,1040,[],'play=1 tick=384');
 assert.equal(model.lastCue,'downbeat');const first=model.render(1040).sampleTime,rewound=model.render(1120).sampleTime;
 assert(rewound<first);assert.equal(model.render(1400).sampleTime,1400);
 model.settings.phraseBars=4;ingest(model,1440,[],'play=1 tick=1536');assert.equal(model.lastCue,'phrase');
 const count=model.phraseCount;ingest(model,1480,[],'play=1 tick=1537');assert.equal(model.phraseCount,count);
 ingest(model,1520,[],'play=0 tick=1537');assert.equal(model.gesture,null);
 for(let now=1600;now<20000;now+=40)ingest(model,now);
 assert(model.history.length<=96);assert(model.history.at(-1).time-model.history[0].time<=2000);
});

const observed=(model,{now=0,epoch=1,sequence=1,sampleFrame=0,status='play=0 tick=0',events=[],field=terrain(64),meter=[4,4]}={})=>{
 const view=observation({status},{epoch,sequence,sampleFrame});view.clock.meter=meter;
 model.ingest({field,status,events,observation:view},now);
};
const timedEvent=(sequence,sampleFrame,epoch=1,status=0x93)=>eventObservation([9,status,72,100],{epoch,sequence,sampleFrame,operation:'midi'});

test('host epochs and clock rollback resync without replaying attacks or structural cues',()=>{
 const model=new Lighting();observed(model);
 observed(model,{now:40,sequence:2,sampleFrame:1764,events:[timedEvent(1,1764)]});assert.equal(model.notes.size,1);
 observed(model,{now:80,epoch:2,sequence:1,status:'play=1 tick=800',events:[timedEvent(1,0,2)]});
 assert.equal(model.notes.size,0);assert.equal(model.gesture,null);assert.equal(model.history.length,1);
 observed(model,{now:120,epoch:2,sequence:2,sampleFrame:1764,events:[timedEvent(1,0,2),timedEvent(2,1764,2),timedEvent(99,1764,1)]});
 assert.equal(model.notes.size,1);assert.equal(model.lastSequence,2);
 observed(model,{now:160,epoch:2,sequence:3,sampleFrame:0,events:[timedEvent(3,0,2)]});assert.equal(model.notes.size,0);
});
test('host sample time ages delayed attacks and drives field history while transport is stopped',()=>{
 const model=new Lighting();observed(model);
 observed(model,{now:1000,sequence:2,sampleFrame:44100,events:[timedEvent(1,0)]});assert.equal(model.notes.size,0);
 observed(model,{now:1040,sequence:3,sampleFrame:45864,events:[timedEvent(2,41454)]});
 assert.equal([...model.notes.values()][0].started,940,'100ms delivery delay is preserved');
 assert.equal(model.history.at(-1).time,1040);assert.equal(model.render(1040).playing,false);
 model.cue('downbeat',1040);assert(model.render(1120).sampleTime<1040);
 observed(model,{now:2000,sequence:3,sampleFrame:88200});assert.equal(model.updated,1040,'duplicate snapshot cannot refresh field');
 model.ingest({field:terrain(64),events:[event(100,0x93)]},2040);assert.equal(model.updated,1040,'negotiated host ignores unversioned snapshots');
 assert.equal(model.render(2040).fresh,false);assert.equal(model.notes.size,0);
});
test('meter-aware boundaries and seeks within a bar do not replay a gesture',()=>{
 const model=new Lighting();observed(model,{status:'play=1 tick=0',meter:[3,4]});
 observed(model,{sequence:2,sampleFrame:1000,status:'play=1 tick=287',meter:[3,4]});assert.equal(model.gesture,null);
 observed(model,{sequence:3,sampleFrame:2000,status:'play=1 tick=288',meter:[3,4]});assert.equal(model.lastCue,'downbeat');assert.equal(model.transport.bar,1);
 observed(model,{sequence:4,sampleFrame:3000,status:'play=1 tick=300',meter:[3,4],events:[timedEvent(1,3000)]});assert.equal(model.notes.size,1);
 observed(model,{sequence:5,sampleFrame:4000,status:'play=1 tick=290',meter:[3,4],events:[timedEvent(1,3000)]});assert.equal(model.gesture,null);assert.equal(model.notes.size,0);
});
test('a gap inside retained history clears holds and channel panic clears release tails',()=>{
 const model=new Lighting();ingest(model,0);ingest(model,40,[event(1,0x90),event(2,0x91)]);
 ingest(model,80,[event(1,0x90),event(2,0x91),event(4,0x92)]);assert.equal(model.notes.size,1);
 ingest(model,120,[event(5,0x82)]);assert.equal(model.envelopes.size,1);
 ingest(model,160,[event(6,0xb2,120,0)]);assert.equal(model.envelopes.size,0);
});
test('lighting profiles roundtrip independently and reject corrupt mappings atomically',()=>{
 const model=new Lighting();model.samples[2][1]=63;model.settings.position='voice';model.settings.blackout=true;
 const profile=lightingProfile({schema:1,settings:model.settings,samples:model.samples});
 let stored=null;const storage={getItem:key=>{assert.equal(key,lightingStorageKey);return stored;},setItem:(key,value)=>{assert.equal(key,lightingStorageKey);stored=value;}};
 assert.equal(loadLightingProfile(storage).profile,null);saveLightingProfile(storage,profile);
 assert.deepEqual(loadLightingProfile(storage).profile,profile);
 profile.samples[2][1]=0;assert.equal(model.samples[2][1],63,'saved profile cannot mutate active model');
 assert.equal(lightingProfile({...profile,schema:9}),null);
 assert.equal(lightingProfile({...profile,settings:{level:NaN}}),null);
 assert.equal(lightingProfile({...profile,samples:[[0,1,2]]}),null);
 assert.equal(lightingProfile({...profile,settings:{source:'invented'}}),null);
 stored='{broken';assert.equal(loadLightingProfile(storage).profile,null);
 assert.match(saveLightingProfile(undefined,profile),/unavailable/);
});
