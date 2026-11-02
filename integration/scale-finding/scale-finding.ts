/** Scale Finding: track-neutral, silent modal key choice.
 * Family selection and piano/inline pitch-class evidence share the same key apply.
 * The persistent white reference-tonic COLUMN is independent of any track;
 * the chosen pad stays play-green and takes precedence over white.
 */
import { appState } from '../app/state.js';
import { seqState } from './state.js';
import { keyboardState } from '../keyboard/state.js';
import { SCALES, FOLLOWER_SCALE_NAMES } from '../scale-catalog.js';
import { portFor } from '../track/registry.js';
import { returnPreviousInputView } from './router-buttons.js';
import { sendPadLedFrame, cachedSetAnimLED, invalidateInputModeLeds } from './led-cache.js';
import { drawHeader } from '../renderer/header.js';
import { fontPrint, fontWidth } from '../font/index.js';
import { setPadPosition } from './pad-position.js';
import { seqToast } from './render.js';

export const SCALE_FINDING_WHITE = 120;
export const SCALE_FINDING_GREEN = 11; // Move's play-green family
const NOTE_NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'] as const;
const ROW_COLORS = [81,77,97,65] as const;
const ORIGINAL_FAMILIES = ['Major','Minor','Mel Min','Harm Min'] as const;
type ScaleDefinition = {name:string;degrees:number[]};
type Selection = {pad:number;tonic:number;scale:string;display:string;supported:boolean};
export type FinderLayout='family'|'piano'|'inline';
export type ScaleCandidate={tonic:number;name:string;scale:string;notes:number[];conflicts:number;missing:number;score:number;compatible:boolean};
const FINDER_LAYOUTS:FinderLayout[]=['family','piano','inline'];
const NATIVE_SCALES=new Set<string>(FOLLOWER_SCALE_NAMES);
const EVIDENCE_PALETTE=[89,91,93,15,11] as const;
// White notes on the lower row, black keys on the row above. The last
// white C repeats as an octave marker. These two rows are duplicated:
// bottom pair = momentary evidence; upper pair = persistent toggles.
const PIANO_WHITE=[0,2,4,5,7,9,11,0];
const PIANO_BLACK=[1,3,-1,6,8,10,-1,-1];
const sevenNoteScales:ScaleDefinition[] = SCALES.filter(
    (scale:ScaleDefinition)=>scale.degrees.length===7);
const sameDegrees=(first:readonly number[],second:readonly number[]):boolean =>
    first.length===second.length&&first.every((offset,index)=>offset===second[index]);
const nativeScaleNames:Readonly<Record<string,string>> = {
    Minor:'Natural Minor','Mel Min':'Melodic Minor','Harm Min':'Harmonic Minor',
    'Lydian Aug':'Lydian Augmented','Lydian Dom':'Lydian Dominant',
    'Locrian #2':'Locrian #2'
};
const firstMatch=(degrees:readonly number[]):ScaleDefinition|undefined =>
    sevenNoteScales.find(candidate=>sameDegrees(candidate.degrees,degrees));
const clampMod=(value:number,period:number):number=>((value%period)+period)%period;

let enabled=false;
let referenceTonic=0;
let rowFamilies:string[]=[...ORIGINAL_FAMILIES];
let selectedPad=-1;
let committedPad=-1;
let armed=false;
let lastError='';
let finderLayout:FinderLayout='family';
let latchedNotes=0;
let heldNotes=0;
let selectedCandidate=0;
let microphoneListening=false;
let microphoneAvailable=false;
let evidenceWindowMs=1800;
let microphoneChroma:number[]=Array(12).fill(0);
let lastEvidenceAt=0;
const livePads=new Set<number>();
/** Return a pitch class for the two playing rows and two latching rows. */
export function finderPadPitch(pad:number,layout:FinderLayout=finderLayout):number|null{
    if(!Number.isInteger(pad)||pad<0||pad>=32||layout==='family')return null;
    const row=Math.floor(pad/8),column=pad%8;
    const base=layout==='piano'?
        (row%2===0?PIANO_WHITE[column]:PIANO_BLACK[column]):
        ((row%2)*8+column<12?(row%2)*8+column:-1);
    return base<0?null:clampMod(base,12);
}
export function finderLayoutName():FinderLayout{return finderLayout;}
export function setFinderLayout(layout:FinderLayout):boolean{
    if(!FINDER_LAYOUTS.includes(layout)||!scaleFindingActive())return false;
    if(finderLayout===layout)return true;
    finderLayout=layout;livePads.clear();heldNotes=0;armed=false;selectedCandidate=0;
    sentColors.fill(-1);invalidateInputModeLeds();appState.dirty=true;
    return true;
}
export function setFinderTonic(tonic:number):boolean{
    if(!scaleFindingActive()||!Number.isInteger(tonic))return false;
    referenceTonic=clampMod(tonic,12);selectedCandidate=0;appState.dirty=true;return true;
}
/** Browser/host audio input submits normalized, bounded chroma; no audio
 * sampling is performed in Move's sequencer/audio callback. */
export function scaleMicrophoneAvailable():boolean{return microphoneAvailable;}
export function setScaleMicrophoneAvailable(available:boolean):void{
    microphoneAvailable=available;
    if(!available)microphoneListening=false;
    appState.dirty=true;
}
export function scaleMicrophoneListening():boolean{return microphoneListening&&scaleFindingActive();}
export function scaleMicrophoneIntent():boolean{return microphoneListening;}
export function setScaleMicrophoneListening(next:boolean):boolean{
    if(!scaleFindingActive()&&next)return false;
    if(next&&!microphoneAvailable){seqToast('Microphone unavailable');return false;}
    if(microphoneListening!==!!next){
        microphoneListening=!!next;lastEvidenceAt=0;appState.dirty=true;
    }
    return true;
}
export function scaleEvidenceWindowMs():number{return evidenceWindowMs;}
export function setScaleEvidenceWindowMs(value:number):boolean{
    if(!scaleFindingActive()||!Number.isFinite(value))return false;
    evidenceWindowMs=Math.max(120,Math.min(16000,Math.round(value)));
    appState.dirty=true;return true;
}
/** Bounded time-dependent EMA; microphone acquisition belongs to browser host,
 * not the Move audio callback. Only ingest while listening. */
export function ingestScaleChroma(values:readonly number[],now=Date.now()):boolean{
    if(!scaleMicrophoneListening()||values.length!==12||
       !Number.isFinite(now)||values.some(value=>!Number.isFinite(value)||value<0||value>1))return false;
    const delta=lastEvidenceAt===0?evidenceWindowMs:Math.max(1,Math.min(500,now-lastEvidenceAt));
    lastEvidenceAt=now;
    const weight=1-Math.exp(-delta/evidenceWindowMs);
    for(let index=0;index<12;index++){
        microphoneChroma[index]=Math.max(0,Math.min(1,
            microphoneChroma[index]*(1-weight)+values[index]*weight));
    }
    selectedCandidate=0;appState.dirty=true;return true;
}
export function clearScaleEvidence():void{
    latchedNotes=0;heldNotes=0;livePads.clear();microphoneChroma.fill(0);lastEvidenceAt=0;
    selectedCandidate=0;appState.dirty=true;
}
function evidenceWeight(note:number):number{
    const manual=((latchedNotes|heldNotes)&(1<<note))!==0?1:0;
    return Math.max(manual,microphoneChroma[note]>=0.2?microphoneChroma[note]:0);
}
/** Rank existing catalog definitions. Never invent a mode or apply it
 * automatically. Exact compatible matches sort ahead of approximate matches. */
export function scaleFindingCandidates():ScaleCandidate[]{
    const evidence=Array.from({length:12},(_,note)=>evidenceWeight(note));
    const total=evidence.reduce((sum,value)=>sum+value,0);
    return SCALES.filter((entry:ScaleDefinition)=>entry.degrees.length>=5&&entry.degrees.length<=8&&
        NATIVE_SCALES.has(nativeScaleNames[entry.name]??entry.name))
        .map((entry:ScaleDefinition)=>{
            const notes=entry.degrees.map(degree=>clampMod(referenceTonic+degree,12));
            const inSet=new Set(notes);
            let conflicts=0,covered=0;
            for(let note=0;note<12;note++)if(evidence[note]>0){
                if(inSet.has(note))covered+=evidence[note];
                else conflicts+=evidence[note];
            }
            const missing=notes.filter(note=>evidence[note]===0).length;
            // Manual selections are hard musical constraints. FFT peaks are
            // softer ranking evidence: room noise and harmonics must not make
            // every candidate impossible to apply.
            const manualNotes=latchedNotes|heldNotes;
            const compatible=Array.from({length:12},(_,note)=>note)
                .every(note=>!(manualNotes&(1<<note))||inSet.has(note));
            const tonicEvidence=evidence[referenceTonic]||0;
            const score=Math.round(100*(covered-4*conflicts+tonicEvidence*.04
                -(total>0?missing*.025:0)))/100;
            return {tonic:referenceTonic,name:entry.name,
                scale:nativeScaleNames[entry.name]??entry.name,notes,
                conflicts:Math.round(conflicts*100)/100,missing,score,compatible};
        }).sort((left,right)=>Number(right.compatible)-Number(left.compatible)
            ||right.score-left.score||left.missing-right.missing||left.name.localeCompare(right.name));
}
export function selectScaleCandidate(index:number):boolean{
    const candidates=scaleFindingCandidates();
    if(!scaleFindingActive()||finderLayout==='family'||!Number.isInteger(index)||
       index<0||index>=candidates.length)return false;
    selectedCandidate=index;appState.dirty=true;return true;
}
export function scaleFindingEvidenceSnapshot(){
    return {layout:finderLayout,latchedNotes,heldNotes,tonic:referenceTonic,
        listening:microphoneListening,available:microphoneAvailable,
        windowMs:evidenceWindowMs,chroma:[...microphoneChroma],
        candidateIndex:selectedCandidate,candidates:scaleFindingCandidates()};
}
const sentColors:number[]=Array(32).fill(-1);

export function scaleFindingEnabled():boolean{return enabled;}
export function scaleFindingActive():boolean{return enabled&&!seqState.sessionMode;}
export function setScaleFindingEnabled(next:boolean):void{
    if(enabled===next)return;
    enabled=next;
    armed=false;livePads.clear();heldNotes=0;
    microphoneChroma.fill(0);microphoneListening=false;microphoneAvailable=false;lastEvidenceAt=0;
    sentColors.fill(-1);
    invalidateInputModeLeds();
    appState.dirty=true;
}
/** Physical pad shift is an input reference, not a key modulation. */
export function scaleTonicColumn():number{
    return keyboardState.columnOffset>=0&&keyboardState.columnOffset<=7?
        keyboardState.columnOffset:clampMod(keyboardState.columnOffset,7);
}
/** Pad notes ascend as seven scalar degrees plus an octave repeat.
 * Rows on the Move run bottom -> top, so the Major family is at the top. */
export function scalePadSelection(pad:number):Selection|null{
    if(!Number.isInteger(pad)||pad<0||pad>=32)return null;
    const familyIndex=3-Math.floor(pad/8);
    const family=sevenNoteScales.find(item=>item.name===rowFamilies[familyIndex]);
    if(!family)return null;
    const column=pad%8;
    const degree=clampMod(column-keyboardState.columnOffset,7);
    const relativeRoot=family.degrees[degree];
    const degrees=family.degrees.map(note=>clampMod(note-relativeRoot,12)).sort((left,right)=>left-right);
    const matched=firstMatch(degrees);
    const tonic=clampMod(referenceTonic+relativeRoot,12);
    return {
        pad,tonic,scale:matched?nativeScaleNames[matched.name]??matched.name:'',
        display:NOTE_NAMES[tonic]+' '+(matched?.name??'mode '+String(degree+1)),
        supported:!!matched
    };
}
/** Drop only the auditioned scale and armed gesture; do not change the parent key. */
export function clearScaleFindingPreview():boolean {
    if(!scaleFindingActive())return false;
    const changed=selectedPad>=0||armed||lastError!==''||
        latchedNotes!==0||heldNotes!==0||microphoneChroma.some(value=>value>0);
    selectedPad=-1;armed=false;lastError='';clearScaleEvidence();
    appState.dirty=true;
    return changed;
}
/** Ready to materialize the displayed key through the existing HB Apply path. */
export function scaleFindingCanApply():boolean {
    if(!scaleFindingActive())return false;
    if(finderLayout==='family')return !!scalePadSelection(selectedPad)?.supported;
    const candidate=scaleFindingCandidates()[selectedCandidate];
    return !!candidate?.compatible&&(latchedNotes!==0||heldNotes!==0||
        microphoneChroma.some(value=>value>0));
}
export function scaleFindingCanClear():boolean {
    return scaleFindingActive()&&(selectedPad>=0||armed||lastError!==''||
        latchedNotes!==0||heldNotes!==0||microphoneChroma.some(value=>value>0));
}
/** Copy applies exactly the preview the user selected; no recorded MIDI. */
export function commitScaleFindingPreview():boolean {
    if(!scaleFindingActive())return false;
    if(finderLayout!=='family'){
        const candidate=scaleFindingCandidates()[selectedCandidate];
        if(!candidate||!candidate.compatible||!scaleFindingCanApply()){
            seqToast('No compatible scale');return false;
        }
        return applyScaleFindingKey(candidate.tonic,candidate.scale,candidate.name);
    }
    const choice=scalePadSelection(selectedPad);
    if(!choice){seqToast('Choose a scale');return false;}
    if(!choice.supported){seqToast('Scale not supported');return false;}
    return applyScaleFindingKey(choice.tonic,choice.scale,choice.display,selectedPad);
}

/** Shared conductor-only Set Live Key operation for every Finder layout. */
function applyScaleFindingKey(tonic:number,scale:string,display:string,pad=-1):boolean{
    const port=portFor(0);
    const tonicWritten=port.setParam('midi_fx1:key_center_tonic',NOTE_NAMES[tonic]);
    const scaleWritten=tonicWritten!==false&&port.setParam('midi_fx1:key_center_explicit_scale',scale);
    const applied=scaleWritten!==false&&port.setParam('midi_fx1:key_center_apply','Apply');
    if(tonicWritten===false||scaleWritten===false||applied===false){
        lastError='Key apply failed';seqToast(lastError);return false;
    }
    committedPad=pad;armed=false;lastError='';seqToast(display);appState.dirty=true;
    return true;
}
function updateHeldNotes():void{
    heldNotes=0;
    for(const pad of livePads){
        const note=finderPadPitch(pad);
        if(note!==null)heldNotes|=1<<note;
    }
}
/** Piano/Inline: momentary lower rows, latched upper rows.
 * K7 arms the next pitch-class pad as reference tonic. */
function pianoPad(pad:number,down:boolean):boolean{
    const note=finderPadPitch(pad);
    if(note===null)return true; // Empty black-key positions are inert.
    if(!down){livePads.delete(pad);updateHeldNotes();appState.dirty=true;return true;}
    if(armed){
        setFinderTonic(note);armed=false;seqToast('Tonic '+NOTE_NAMES[note]);return true;
    }
    if(pad>=16){latchedNotes^=1<<note;selectedCandidate=0;}
    else {livePads.add(pad);updateHeldNotes();selectedCandidate=0;}
    appState.dirty=true;
    return true;
}
export function selectScaleFindingPad(pad:number):boolean{
    if(!scaleFindingActive())return false;
    if(finderLayout!=='family')return pianoPad(pad,true);
    const chosen=scalePadSelection(pad);
    if(!chosen)return false;
    selectedPad=pad;lastError='';
    if(armed){
        if(!chosen.supported){
            lastError='Unmapped mode';
            seqToast('Scale not in HB catalog');
        }else{
            applyScaleFindingKey(chosen.tonic,chosen.scale,chosen.display,pad);
        }
    }
    appState.dirty=true;
    return true;
}
/** No track-colored feedback: the reference tonic is always white. */
export function scaleFindingColors():number[]{
    if(finderLayout!=='family')return Array.from({length:32},(_,pad)=>{
        const pitch=finderPadPitch(pad);
        if(pitch===null)return 0;
        if(pitch===referenceTonic)return SCALE_FINDING_WHITE;
        if((latchedNotes|heldNotes)&(1<<pitch))return SCALE_FINDING_GREEN;
        // Audio evidence is advisory; use existing palette instead of per-frame
        // high-frequency custom RGB packets and preserve the tonic priority.
        const level=microphoneChroma[pitch];
        if(level>=0.07)return EVIDENCE_PALETTE[Math.min(4,Math.floor(level*5))];
        return pad>=16?65:79;
    });
    const tonic=scaleTonicColumn();
    return Array.from({length:32},(_,pad)=>{
        if(pad===selectedPad)return SCALE_FINDING_GREEN;
        if(pad%8===tonic)return SCALE_FINDING_WHITE;
        const pitch=scalePadSelection(pad)?.tonic;
        if(pitch!==undefined&&microphoneChroma[pitch]>=0.07){
            return EVIDENCE_PALETTE[Math.min(4,Math.floor(microphoneChroma[pitch]*5))];
        }
        return ROW_COLORS[3-Math.floor(pad/8)];
    });
}
/** Acknowledged 32-pad frame, preserving rejects for retry. */
export function paintScaleFinding(force=false):boolean{
    if(!scaleFindingActive())return false;
    if(force)sentColors.fill(-1);
    const desired=scaleFindingColors();
    const changes=desired.flatMap((color,index)=>
        sentColors[index]===color?[]:[{note:68+index,color}]);
    for(const delivered of sendPadLedFrame(changes))sentColors[delivered.note-68]=delivered.color;
    return desired.every((color,index)=>sentColors[index]===color);
}
export function paintScaleFindingSteps():boolean{
    if(!scaleFindingActive())return false;
    // The reserved 5/6 controls are dark; K7 is arm green, K8 tonic white.
    for(let knob=0;knob<8;knob++){
        const color=finderLayout!=='family'?
            (knob===4?SCALE_FINDING_GREEN:knob===5?123:knob===6?(armed?SCALE_FINDING_GREEN:123):knob===7?SCALE_FINDING_WHITE:0):
            knob<4?ROW_COLORS[knob]:knob===4?SCALE_FINDING_GREEN:knob===5?123:
            knob===6?(armed?SCALE_FINDING_GREEN:123):knob===7?SCALE_FINDING_WHITE:0;
        cachedSetAnimLED(knob,color,color,0);
        cachedSetAnimLED(71+knob,color,color,0,true);
    }
    return true;
}
const shorten=(value:string):string=>{
    let text=value;
    while(text&&fontWidth(text)>126)text=text.slice(0,-1);
    return text;
};
export function renderScaleFinding():void{
    if(!scaleFindingActive())return;
    clear_screen();
    drawHeader('Scale Finding',NOTE_NAMES[referenceTonic]);
    if(finderLayout!=='family'){
        const candidates=scaleFindingCandidates();
        const selected=candidates[selectedCandidate];
        fontPrint(2,12,shorten(finderLayout.toUpperCase()+' tonic '+NOTE_NAMES[referenceTonic]),1);
        const evidence=Array.from({length:12},(_,note)=>evidenceWeight(note)>0?NOTE_NAMES[note]:'')
            .filter(Boolean).join(' ');
        fontPrint(2,22,shorten('Notes: '+(evidence||'none')),1);
        for(let index=0;index<2;index++){
            const option=candidates[selectedCandidate+index];
            if(option)fontPrint(2,33+index*10,
                shorten((index===0?'> ':'  ')+NOTE_NAMES[option.tonic]+' '+
                    option.name+(option.compatible?'':' !')),1);
        }
        fontPrint(2,55,shorten(lastError||(armed?'K7: choose tonic':
            'K6: '+(evidenceWindowMs/1000).toFixed(1)+'s K7: select')),1);
        return;
    }
    for(let index=0;index<4;index++){
        const rowColorLabel=String(index+1)+' '+rowFamilies[index];
        fontPrint(2,12+index*10,shorten(rowColorLabel),1);
    }
    const current=scalePadSelection(selectedPad);
    const footer=lastError||(
        current?(armed?'ARM '+current.display:current.display+(selectedPad===committedPad?' SET':'')):
            armed?'ARM: press pad':'K7: arm, K8: tonic');
    fontPrint(2,55,shorten(footer),1);
}
export function scaleFindingMidi(data:number[]):boolean{
    if(!scaleFindingActive())return false;
    const [status,key,value]=data,type=status&240;
    if((type===144||type===128||type===160)&&key>=68&&key<100){
        if(type===160)return true;
        if(finderLayout!=='family')pianoPad(key-68,type===144&&value>0);
        else if(type===144&&value>0)selectScaleFindingPad(key-68);
        return true; // No instrument MIDI or clip edits in any layout.
    }
    if((type===144||type===128)&&key<8){
        if(type===144&&value>0&&key===6){armed=!armed;lastError='';appState.dirty=true;}
        return true;
    }
    if(type!==176)return false;
    if(key===75){
        const direction=value<64?value:value-128;
        if(direction)setFinderLayout(FINDER_LAYOUTS[clampMod(FINDER_LAYOUTS.indexOf(finderLayout)+Math.sign(direction),FINDER_LAYOUTS.length)]);
        return true;
    }
    if(key===76){
        const direction=value<64?value:value-128;
        if(direction){
            setScaleEvidenceWindowMs(evidenceWindowMs*
                (direction>0?Math.pow(1.25,Math.abs(direction)):Math.pow(0.8,Math.abs(direction))));
            seqToast('Window '+(evidenceWindowMs/1000).toFixed(1)+'s');
        }
        return true;
    }
    if(key===77&&finderLayout!=='family'){
        const direction=value<64?value:value-128;
        if(direction){
            const count=scaleFindingCandidates().length;
            if(count)selectScaleCandidate(clampMod(selectedCandidate+Math.sign(direction),count));
        }
        return true;
    }
    if(key>=71&&key<=74){
        if(finderLayout!=='family')return true;
        const row=key-71,direction=value<64?value:value-128;
        if(direction){
            const current=sevenNoteScales.findIndex(scale=>scale.name===rowFamilies[row]);
            rowFamilies[row]=sevenNoteScales[clampMod(current+direction,sevenNoteScales.length)].name;
            selectedPad=-1;committedPad=-1;appState.dirty=true;
        }
        return true;
    }
    if(key===78){
        const direction=value<64?value:value-128;
        setFinderTonic(referenceTonic+direction);
        selectedPad=-1;committedPad=-1;appState.dirty=true;
        return true;
    }
    if(key===77||key===75||key===76||key===14)return true;
    if(key===62||key===63){
        if(value)setPadPosition(keyboardState.columnOffset+(key===63?1:-1));
        return true;
    }
    if(key===51){
        if(value)returnPreviousInputView();
        return true;
    }
    return false;
}
export function scaleFindingSnapshot(){
    return {active:scaleFindingActive(),referenceTonic,rowFamilies:[...rowFamilies],
        tonicColumn:scaleTonicColumn(),selectedPad,committedPad,armed,error:lastError,
        ...scaleFindingEvidenceSnapshot()};
}
