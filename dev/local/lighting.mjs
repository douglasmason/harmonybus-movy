/** Lighting is a read-only projection of HB field snapshots and rendered MIDI. */
import {SectionLighting} from './lighting-sections.mjs';
export const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,value));
export const wrapHue=value=>((value%360)+360)%360;
export const hueDelta=(first,second)=>((second-first+540)%360)-180;
export const mixHue=(first,second,amount)=>wrapHue(first+hueDelta(first,second)*amount);
const mix=(first,second,amount)=>first+(second-first)*amount;
const mapScaleToWarmth=new Map(Object.entries({
 'Lydian':1,'Lydian Augmented':1,'Major':.75,'Harmonic Major':.35,
 'Mixolydian':.35,'Lydian Dominant':.6,'Mixolydian b6':-.1,'Dorian':-.15,
 'Melodic Minor':-.25,'Harmonic Minor':-.4,'Natural Minor':-.55,
 'Dorian b2':-.6,'Phrygian':-.8,'Locrian #2':-.8,'Locrian':-1,
 'Altered':-.75,'Whole Tone':.2,'Augmented':.2,'Blues':0
}));
export const fixturePositions=[[-1,-1],[1,-1],[1,1],[-1,1]];
const mapScaleToIntervals=new Map(Object.entries({
 'Major':[0,2,4,5,7,9,11], 'Lydian':[0,2,4,6,7,9,11], 'Mixolydian':[0,2,4,5,7,9,10],
 'Dorian':[0,2,3,5,7,9,10], 'Natural Minor':[0,2,3,5,7,8,10],
 'Phrygian':[0,1,3,5,7,8,10], 'Locrian':[0,1,3,5,6,8,10],
 'Harmonic Minor':[0,2,3,5,7,8,11], 'Melodic Minor':[0,2,3,5,7,9,11],
 'Dorian b2':[0,1,3,5,7,9,10], 'Lydian Augmented':[0,2,4,6,8,9,11],
 'Lydian Dominant':[0,2,4,6,7,9,10], 'Mixolydian b6':[0,2,4,5,7,8,10],
 'Locrian #2':[0,2,3,5,6,8,10], 'Altered':[0,1,3,4,6,8,10],
 'Whole Tone':[0,2,4,6,8,10], 'Augmented':[0,3,4,7,8,11],
 'Blues':[0,3,5,6,7,10], 'Harmonic Major':[0,2,4,5,7,8,11]
}));
const mapNoteToPitchClass=new Map([['C',0],['D',2],['E',4],['F',5],['G',7],['A',9],['B',11]]);
/** Position uses HB's named effective scale; chromatic notes interpolate degrees. */
export function voicePosition(channel,pitch,shared,mode='degree',homeIndex=channel) {
 const context=String(shared??'').split('|'),match=/^([A-G])([#b♯♭]?)/.exec(context[1]??'');
 const tonic=match?(mapNoteToPitchClass.get(match[1])+(['#','♯'].includes(match[2])?1:['b','♭'].includes(match[2])?-1:0)+12)%12:0;
 const intervals=context[0]==='dp1'?mapScaleToIntervals.get(context[7]):null;
 const relative=((pitch-tonic)%12+12)%12;
 let degree=relative/12;
 if(intervals){const extended=[...intervals,12];const index=extended.findIndex((value,index)=>index<extended.length-1&&relative>=value&&relative<extended[index+1]);degree=(index+(relative-extended[index])/(extended[index+1]-extended[index]))/intervals.length;}
 const home=fixturePositions[homeIndex];
 if(mode==='voice')return home.map(value=>value*.7);
 if(mode==='pitch')return [clamp((pitch-60)/18,-1.2,1.2),home[1]*.65];
 const angle=degree*Math.PI*2-Math.PI/2;
 return [home[0]*.55+.65*Math.cos(angle),home[1]*.55+.65*Math.sin(angle)+clamp((pitch-60)/36,-.4,.4)];
}
/** Unit-sum weights avoid making center positions louder than corner positions. */
export function gaussianWeights(position,width) {
 const variance=clamp(width,.25,2)**2;
 const distances=fixturePositions.map(point=>(point[0]-position[0])**2+(point[1]-position[1])**2);
 const closest=Math.min(...distances);
 const weights=distances.map(distance=>Math.exp(-(distance-closest)/(2*variance))),total=weights.reduce((sum,value)=>sum+value,0);
 return weights.map(value=>value/total);
}
export const defaultSamples=[[9,18,10],[14,21,13],[54,45,53],[49,42,50]];
export const defaultSettings=Object.freeze({source:'terrain',palette:'blend',harmony:.75,level:.7,saturation:.85,reactivity:.65,vinyl:.45,hueTurns:2,phraseBars:0,blackout:false,position:'degree',spread:.85,sectionCue:'arrival',voiceGain0:1,voiceGain1:1,voiceGain2:1,voiceGain3:1,voiceHome0:0,voiceHome1:1,voiceHome2:2,voiceHome3:3});

/** Parse existing quantized terrain or lane telemetry; reject incomplete frames. */
export function parseField(text,source='terrain') {
 const fields=String(text??'').split(','),numbers=fields.slice(1).map(Number);
 if(!numbers.every(Number.isFinite))return null;
 if(source==='terrain')return fields[0]==='nf1'&&fields.length===67?
  numbers.slice(2).map(value=>clamp(value/127)):null;
 if(fields[0]!=='fo2'||fields.length!==56)return null;
 return Array.from({length:16},(_,index)=>clamp(numbers[4+index*3]/10000));
}

/** Artistic palette rule, invariant to transposition and enharmonic spelling. */
export function harmonicColor(shared,harmony,source='blend') {
 const context=String(shared??'').split('|'),chords=String(harmony??'').split('|');
 const scale=context[0]==='dp1'?context[7]:'',chord=chords[0]==='hp1'?chords[4]:'',key=context[0]==='dp1'?context[1]:'';
 const scaleWarmth=mapScaleToWarmth.get(scale);
 const quality=/^[A-G](?:#|b|♯|♭)?([^/]*)/.exec(chord)?.[1];
 const chordWarmth=quality===undefined||quality.includes('?')?undefined:
  /dim|°|ø|m7b5/.test(quality)?-1:/^(?:m(?!aj)|min)/.test(quality)?-.65:
  /sus|^5$/.test(quality)?0:/^(?:7|9|11|13)/.test(quality)?.25:.75;
 const warmth=source==='scale'?scaleWarmth:source==='chord'?chordWarmth:
  scaleWarmth===undefined?chordWarmth:chordWarmth===undefined?scaleWarmth:.65*scaleWarmth+.35*chordWarmth;
 return {known:warmth!==undefined,warmth:warmth??0,hue:wrapHue(225+170*((warmth??0)+1)/2),
  label:[key,scale,chord&&chord!=='--'?`chord ${chord}`:''].filter(Boolean).join(' · ')||'Waiting for harmony'};
}

/** HSV conversion preserves hue at the 0/360 seam and keeps brightness separate. */
export function hsvRgb(hue,saturation,level) {
 const sector=wrapHue(hue)/60,chroma=clamp(level)*clamp(saturation),second=chroma*(1-Math.abs(sector%2-1));
 const components=[[chroma,second,0],[second,chroma,0],[0,chroma,second],[0,second,chroma],[second,0,chroma],[chroma,0,second]][Math.floor(sector)];
 return components.map(value=>Math.round(255*(value+clamp(level)-chroma)));
}

export class Lighting {
 constructor(){
  this.settings={...defaultSettings};
  this.samples=defaultSamples.map(row=>row.slice());
  this.history=[];this.field=null;this.updated=-Infinity;this.lastFrame=null;this.lastSequence=null;
  this.notes=new Map();this.envelopes=new Map();this.attacks=[0,0,0,0];this.frame=Array.from({length:4},()=>({hue:225,saturation:.7,level:0,rgb:[0,0,0]}));
  this.transport={playing:false,bar:0,tick:0};this.gesture=null;this.lastCue='';this.phraseCount=0;
  this.shared='';this.harmony='';this.suspended=false;
  this.epoch=null;this.snapshotSequence=null;this.sampleClock=null;
  this.sections=new SectionLighting();
 }
 /** No MIDI or parameter writes: duplicated event-history snapshots are harmless. */
 ingest({field,shared,harmony,status,events=[],observation},now){
  if(this.epoch!==null&&!observation)return;
  let clock=null,resync=false;
  if(observation?.schema===1){
   const candidate=observation.clock;
   if(!Number.isSafeInteger(observation.sequence)||observation.sequence<0||
    !(typeof observation.epoch==='string'||Number.isSafeInteger(observation.epoch))||
    !Number.isFinite(candidate?.sampleFrame)||candidate.sampleFrame<0||
    !Number.isFinite(candidate?.sampleRate)||candidate.sampleRate<=0)return;
   if(this.epoch===observation.epoch&&this.snapshotSequence!==null&&observation.sequence<=this.snapshotSequence)return;
   clock=candidate;
   const sampleTime=clock.sampleFrame/clock.sampleRate*1000;
   resync=this.epoch!==observation.epoch||(this.sampleClock!==null&&sampleTime<this.sampleClock);
   if(resync){this.resetPerformance();this.resetSource();this.shared='';this.harmony='';this.phraseCount=0;}
   this.epoch=observation.epoch;this.snapshotSequence=observation.sequence;this.sampleClock=sampleTime;
  }
  const parsed=parseField(field,this.settings.source);
  if(parsed){
   this.field=parsed;this.updated=now;
   const time=this.sampleClock??now;
   if(this.history.at(-1)?.time===time)this.history[this.history.length-1]={time,values:parsed};
   else this.history.push({time,values:parsed});
   while(this.history.length>96||this.history[0]?.time<time-2000)this.history.shift();
  }
  if(shared!==undefined)this.shared=shared;if(harmony!==undefined)this.harmony=harmony;
  const fields=Object.fromEntries(String(status??'').split(' ').map(part=>part.split('=')));
  const tick=Number(clock?.transportTick??fields.master_tick??fields.tick),playing=clock?clock.playing===true:fields.play==='1';
  const meter=clock?.meter,ppqn=clock?.ppqn;
  const barTicks=Number.isFinite(ppqn)&&ppqn>0&&Array.isArray(meter)&&meter.length===2&&meter.every(value=>Number.isFinite(value)&&value>0)?ppqn*meter[0]*4/meter[1]:384;
  const bar=Number.isFinite(tick)?Math.floor(tick/barTicks):this.transport.bar;
  if(playing&&this.transport.playing&&Number.isFinite(tick)&&tick<this.transport.tick){this.resetPerformance();this.history=[];resync=true;}
  const sectionCue=this.sections.observe(observation?.structure,now,{reset:resync||this.suspended||now-this.updated>=750||!playing,mode:this.settings.sectionCue,ppqn:ppqn??96});
  if(sectionCue)this.cue(sectionCue,now);
  else if(!resync&&playing&&Number.isFinite(tick)&&(!this.transport.playing||bar!==this.transport.bar)){
   // One cue at the observed boundary; never replay missed bars after a stalled tab.
   const phrase=this.settings.phraseBars>0&&bar>0&&bar%this.settings.phraseBars===0;
   this.cue(phrase?'phrase':'downbeat',now);
  }
  if(!playing&&this.transport.playing){this.notes.clear();this.envelopes.clear();this.attacks.fill(0);this.gesture=null;}
  this.transport={playing,bar,tick:Number.isFinite(tick)?tick:0};
  const ordered=events.filter(event=>Number.isSafeInteger(event.sequence)&&(!clock||event.epoch===this.epoch)).sort((first,second)=>first.sequence-second.sequence);
  if(this.lastSequence===null){this.lastSequence=ordered.at(-1)?.sequence??0;return;}
  if(ordered.length&&ordered[0].sequence>this.lastSequence+1){this.notes.clear();this.envelopes.clear();this.attacks.fill(0);}
  for(const event of ordered){
   if(event.sequence<=this.lastSequence)continue;
   if(event.sequence>this.lastSequence+1){this.notes.clear();this.envelopes.clear();this.attacks.fill(0);}
   this.lastSequence=event.sequence;
   const packet=event.packet;if(!Array.isArray(packet)||packet.length!==4||packet.some(value=>!Number.isInteger(value)||value<0||value>255))continue;
   const [,statusByte,pitch,value]=packet,kind=statusByte&240,channel=statusByte&15;
   if(channel>3||pitch>127||value>127)continue;
   const age=clock&&Number.isFinite(event.sampleFrame)&&event.sampleRate===clock.sampleRate?(clock.sampleFrame-event.sampleFrame)/clock.sampleRate*1000:0;
   // Old releases still clear ownership. Late attacks/pressure must not flash now.
   if((kind===144&&value||kind===160||kind===208)&&(age<0||age>750))continue;
   const occurredAt=now-Math.max(0,age);
   const noteKey=channel*128+pitch;
   if(kind===144&&value){const note={channel,pitch,velocity:value/127,pressure:0,started:occurredAt,released:null};this.notes.set(noteKey,note);this.envelopes.set(noteKey,note);this.attacks[channel]=Math.max(this.attacks[channel],value/127);}
   else if(kind===128||kind===144){const note=this.notes.get(noteKey);if(note)note.released=occurredAt;this.notes.delete(noteKey);}
   else if(kind===160&&this.notes.has(noteKey))this.notes.get(noteKey).pressure=value/127;
   else if(kind===208){for(const note of this.notes.values())if(note.channel===channel)note.pressure=pitch/127;}
   else if(kind===176&&(pitch===120||pitch===123)){for(const [key,note] of this.envelopes)if(note.channel===channel){this.notes.delete(key);this.envelopes.delete(key);}this.attacks[channel]=0;}
  }
 }
 /** Manual auditions and observed section arrivals share the same visual gesture. */
 cue(kind,now){
  if(!['downbeat','phrase','break','arrival'].includes(kind))return;
  this.lastCue=kind;
  if(kind==='phrase')this.phraseCount++;
  this.gesture={kind,start:now,duration:kind==='downbeat'?340:900};
 }
 resetPerformance(){this.notes.clear();this.envelopes.clear();this.attacks.fill(0);this.gesture=null;this.lastSequence=null;}
 suspend(){this.suspended=true;this.resetPerformance();this.history=[];this.sections.reset();}
 resume(){this.suspended=false;this.lastFrame=null;this.lastSequence=null;this.updated=-Infinity;this.epoch=null;this.snapshotSequence=null;this.sampleClock=null;}
 resetSource(){this.history=[];this.field=null;this.updated=-Infinity;this.gesture=null;}
 /** Piecewise-linear history lookup is bounded and has no field-clock ownership. */
 historyAt(time){
  const history=this.history;if(!history.length)return this.field;
  if(time<=history[0].time)return history[0].values;
  for(let index=1;index<history.length;index++)if(history[index].time>=time){
   const before=history[index-1],after=history[index],amount=(time-before.time)/(after.time-before.time||1);
   return before.values.map((value,lane)=>mix(value,after.values[lane],amount));
  }
  return history.at(-1).values;
 }
 render(now){
  const elapsed=this.lastFrame===null?40:clamp(now-this.lastFrame,0,100);this.lastFrame=now;
  const fresh=now-this.updated<750&&!this.suspended;
  if(!fresh){this.notes.clear();this.envelopes.clear();this.attacks.fill(0);this.gesture=null;this.sections.reset();}
  const liveTime=this.sampleClock??now;
  let values=this.field,sampleTime=liveTime,cueAmount=0;
  if(this.gesture&&fresh){
   const phase=(now-this.gesture.start)/this.gesture.duration;
   if(phase>=1)this.gesture=null;
   else {
    cueAmount=Math.sin(Math.PI*clamp(phase));
    // Cursor starts at live time, moves backward, then catches up continuously.
    sampleTime=liveTime-this.settings.vinyl*450*cueAmount;
    values=this.historyAt(sampleTime);
   }
  }
  const palette=harmonicColor(this.shared,this.harmony,this.settings.palette);
  const rotation=this.phraseCount%4;
  const voices=Array.from({length:4},()=>({levels:[0,0,0,0],position:null,energy:0}));
  for(const [key,note] of this.envelopes){
   if(note.released!==null&&now-note.released>1200){this.envelopes.delete(key);continue;}
   const held=note.released===null,sustain=held?.4:.4*Math.exp(-(now-note.released)/200);
   const envelope=this.settings[`voiceGain${note.channel}`]*Math.max(sustain*note.velocity,note.velocity*Math.exp(-(now-note.started)/130),held?note.pressure*.7:0);
   const position=voicePosition(note.channel,note.pitch,this.shared,this.settings.position,this.settings[`voiceHome${note.channel}`]),weights=gaussianWeights(position,this.settings.spread);
   const voice=voices[note.channel];
   for(let fixture=0;fixture<4;fixture++)voice.levels[fixture]=Math.max(voice.levels[fixture],weights[fixture]*envelope);
   if(envelope>voice.energy){voice.position=position;voice.energy=envelope;}
  }
  for(let fixture=0;fixture<4;fixture++){
   const rotated=(fixture+rotation)%4;
   const route=this.settings.source==='lanes'?[rotated,rotated+4,rotated+8]:this.samples[rotated];
   const [hueSample,levelSample,saturationSample]=route.map(index=>values?.[index]??.5);
   const rawHue=wrapHue(hueSample*360*this.settings.hueTurns);
   // A circular vector bias, followed by shortest-arc smoothing, avoids 359→0 jumps.
   const amount=palette.known?this.settings.harmony:0;
   const radians=Math.PI/180;
   const vectorX=(1-amount)*Math.cos(rawHue*radians)+amount*Math.cos(palette.hue*radians);
   const vectorY=(1-amount)*Math.sin(rawHue*radians)+amount*Math.sin(palette.hue*radians);
   let hue=Math.hypot(vectorX,vectorY)<1e-6?this.frame[fixture].hue:wrapHue(Math.atan2(vectorY,vectorX)/radians);
   const energy=voices.reduce((sum,voice)=>sum+voice.levels[fixture],0);
   const expression=(1-Math.exp(-energy*2))*this.settings.reactivity;
   const voiceTint=voices.reduce((sum,voice,index)=>sum+voice.levels[fixture]*[-24,-8,8,24][index],0)/(energy||1);
   hue=wrapHue(hue+voiceTint*expression);
   let level=clamp(this.settings.level*(.18+.66*levelSample)+expression*.45);
   let saturation=clamp(this.settings.saturation*(.55+.45*saturationSample)-expression*.1);
   if(this.gesture?.kind==='break')level*=1-.65*cueAmount;
   if(this.gesture?.kind==='arrival'){level=clamp(level+.18*cueAmount);saturation*=1-.25*cueAmount;}
   const previous=this.frame[fixture],hueBlend=1-Math.exp(-elapsed/220),levelBlend=1-Math.exp(-elapsed/(level>previous.level?40:200));
   const next={hue:mixHue(previous.hue,hue,hueBlend),saturation:mix(previous.saturation,saturation,hueBlend),level:mix(previous.level,fresh?level:0,levelBlend)};
   if(this.settings.blackout||this.suspended)next.level=0;
   next.rgb=hsvRgb(next.hue,next.saturation,next.level);this.frame[fixture]=next;
   this.attacks[fixture]*=Math.exp(-elapsed/130);
  }
  return {fixtures:this.frame,palette,fresh,sampleTime,rewinding:sampleTime<liveTime-10,cue:this.gesture?.kind??'',bar:this.transport.bar+1,playing:this.transport.playing,held:this.notes.size,voices,sectionLabel:this.sections.label(now)};
 }
}
