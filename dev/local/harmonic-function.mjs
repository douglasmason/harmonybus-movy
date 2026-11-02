/** Advisory harmonic-function tracker for Scale Finder's browser microphone.
 * No chords or keys are committed to HarmonyBus. The user pins an explicit
 * seven-note tonal hypothesis; silence and incomplete chords remain Unknown.
 */
export const FUNCTION_LABELS=Object.freeze({T:'Tonic',PD:'Predominant',D:'Dominant','?':'Unknown'});
const FUNCTIONS=['T','PD','D'];
const MODULO=(value,modulus)=>((value%modulus)+modulus)%modulus;

/** Build diatonic triad templates from an explicitly pinned scale. */
export function functionalTemplates(hypothesis={}){
 if(!hypothesis||typeof hypothesis!=='object'||Array.isArray(hypothesis))return [];
 const {tonic,notes}=hypothesis;
 if(!Number.isInteger(tonic)||tonic<0||tonic>11||!Array.isArray(notes)||notes.length!==7||
    notes.some(note=>!Number.isInteger(note)||note<0||note>11)||new Set(notes).size!==7||notes[0]!==tonic)return [];
 const tonicThird=MODULO(notes[2]-tonic,12);
 if(![3,4].includes(tonicThird))return [];
 const minor=tonicThird===3;
 const definitions=[['T',0],['PD',1],['PD',3],['D',4],['D',6]];
 // VI is only a tonic substitute in major; in minor VI is commonly predominant.
 if(!minor)definitions.push(['T',5]);
 return definitions.map(([functionName,degree])=>({
  functionName,degree:degree+1,
  chord:[notes[degree],notes[(degree+2)%7],notes[(degree+4)%7]]
 }));
}

/** One frame of advisory function evidence. "strength" is not a probability. */
export function analyzeHarmonicFunction(chroma,hypothesis){
 const unknown={functionName:'?',strength:0,chromatic:false,reason:'insufficient evidence'};
 if(!Array.isArray(chroma)||chroma.length!==12||chroma.some(value=>!Number.isFinite(value)||value<0||value>1))
  return {...unknown,reason:'invalid audio evidence'};
 const templates=functionalTemplates(hypothesis);
 if(!templates.length)return {...unknown,reason:'pin a major/minor seven-note scale'};
 const scaleSet=new Set(hypothesis.notes);
 const maximum=Math.max(...chroma);
 if(maximum<0.15)return {...unknown,reason:'silence'};
 const observed=chroma.map(value=>value/maximum);
 const outside=observed.some((strength,pitch)=>!scaleSet.has(pitch)&&strength>=0.32);
 // Require independently supported three-note harmony: do not invent chords
 // from a dyad, melody, bass fundamental, or arbitrary passing-note movement.
 const scored=templates.map(template=>{
  const chordSet=new Set(template.chord);
  const present=template.chord.filter(note=>observed[note]>=0.32).length;
  const internal=template.chord.reduce((sum,note)=>sum+observed[note],0);
  const external=observed.reduce((sum,value,pitch)=>sum+(chordSet.has(pitch)?0:value),0);
  const purity=internal/(internal+1.5*external+1e-9);
  const completeness=internal/3;
  return {...template,present,score:purity*0.65+completeness*0.35};
 }).filter(row=>row.present===3).sort((first,second)=>second.score-first.score);
 const best=scored[0];
 if(!best||best.score<0.68)return {...unknown,chromatic:outside,reason:'incomplete or mixed harmony'};
 // Where two different functions explain similar pitch evidence, abstain.
 const rival=scored.find(row=>row.functionName!==best.functionName);
 if(rival&&best.score-rival.score<0.12)return {...unknown,chromatic:outside,reason:'ambiguous function'};
 if(!FUNCTIONS.includes(best.functionName))return unknown;
 return {functionName:best.functionName,strength:Math.round(best.score*100)/100,
  chromatic:outside,reason:'advisory chroma fit'};
}

/** Time-bounded state machine. Require >350 ms of matching harmonic evidence
 * before committing a segment, and never auto-force a functional cadence. */
export function createHarmonicFunctionTracker({minimumDwellMs=350,maxSegments=24}={}){
 let hypothesis=null;
 let candidate=null;
 let pendingSince=0;
 let lastTimestamp=-1;
 let current=null;
 let segments=[];
 let active=false;
 const reset=()=>{candidate=null;pendingSince=0;lastTimestamp=-1;current=null;segments=[];active=false;};
 const pin=value=>{
  const templates=functionalTemplates(value);
  if(!templates.length)return false;
  hypothesis={tonic:value.tonic,notes:[...value.notes],name:String(value.name??'Scale')};
  reset();return true;
 };
 const unpin=()=>{hypothesis=null;reset();};
 const observe=(chroma,nowMs)=>{
  if(!hypothesis||!Number.isFinite(nowMs)||nowMs<0)return snapshot();
  if(lastTimestamp>=0&&(nowMs<=lastTimestamp||nowMs-lastTimestamp>2500)){
   candidate=null;pendingSince=0;
   // A disconnected/stalled source must not bridge two chord events.
   current=null;
  }
  lastTimestamp=nowMs;
  const result=analyzeHarmonicFunction(chroma,hypothesis);
  active=result.reason!=='silence'&&result.reason!=='invalid audio evidence';
  if(!active){candidate=null;return snapshot();}
  // Chromatic evidence is an orthogonal flag, not a separate function.
  const key=result.functionName+':'+(result.chromatic?1:0);
  if(candidate!==key){candidate=key;pendingSince=nowMs;return snapshot();}
  if(nowMs-pendingSince<minimumDwellMs)return snapshot();
  const tail=segments[segments.length-1];
  if(tail&&pendingSince-tail.endMs<=2500&&
     tail.functionName===result.functionName&&tail.chromatic===result.chromatic){
   tail.endMs=nowMs;tail.strength=result.strength;
  }else{
   if(tail)tail.endMs=Math.max(tail.endMs,pendingSince);
   segments.push({functionName:result.functionName,chromatic:result.chromatic,
    startMs:pendingSince,endMs:nowMs,strength:result.strength});
   if(segments.length>maxSegments)segments.shift();
  }
  current=result;
  return snapshot();
 };
 const snapshot=()=>({pinned:hypothesis?{...hypothesis,notes:[...hypothesis.notes]}:null,
  current:current?{...current}:null,active,segments:segments.map(x=>({...x}))});
 return {pin,unpin,reset,observe,snapshot};
}
