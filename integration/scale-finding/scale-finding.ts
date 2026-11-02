/** Scale Finding: track-neutral, silent modal key choice.
 * This is a manual mode. Microphone chroma is a separate future source.
 * The persistent white reference-tonic COLUMN is independent of any track;
 * the chosen pad stays play-green and takes precedence over white.
 */
import { appState } from '../app/state.js';
import { seqState } from './state.js';
import { keyboardState } from '../keyboard/state.js';
import { SCALES } from '../scale-catalog.js';
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
const sentColors:number[]=Array(32).fill(-1);

export function scaleFindingEnabled():boolean{return enabled;}
export function scaleFindingActive():boolean{return enabled&&!seqState.sessionMode;}
export function setScaleFindingEnabled(next:boolean):void{
    if(enabled===next)return;
    enabled=next;
    armed=false;
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
    const changed=selectedPad>=0||armed||lastError!=='';
    selectedPad=-1;armed=false;lastError='';
    appState.dirty=true;
    return changed;
}
/** Ready to materialize the displayed key through the existing HB Apply path. */
export function scaleFindingCanApply():boolean {
    return scaleFindingActive()&&!!scalePadSelection(selectedPad)?.supported;
}
export function scaleFindingCanClear():boolean {
    return scaleFindingActive()&&(selectedPad>=0||armed||lastError!=='');
}
/** Copy applies exactly the preview the user selected; no recorded MIDI. */
export function commitScaleFindingPreview():boolean {
    if(!scaleFindingActive())return false;
    const choice=scalePadSelection(selectedPad);
    if(!choice){seqToast('Choose a scale');return false;}
    if(!choice.supported){seqToast('Scale not supported');return false;}
    // Reuse the same transactional three-parameter Apply as armed K7+pad.
    armed=true;
    selectScaleFindingPad(selectedPad);
    return !armed;
}

export function selectScaleFindingPad(pad:number):boolean{
    if(!scaleFindingActive())return false;
    const chosen=scalePadSelection(pad);
    if(!chosen)return false;
    selectedPad=pad;lastError='';
    if(armed){
        if(!chosen.supported){
            lastError='Unmapped mode';
            seqToast('Scale not in HB catalog');
        }else{
            // Stage both parameters, then commit with HB's existing silent Apply.
            // One conductor owns the shared parent key; no clip or MIDI note writes.
            const port=portFor(0);
            const tonicWritten=port.setParam('midi_fx1:key_center_tonic',NOTE_NAMES[chosen.tonic]);
            const scaleWritten=tonicWritten!==false&&port.setParam('midi_fx1:key_center_explicit_scale',chosen.scale);
            const applied=scaleWritten!==false&&port.setParam('midi_fx1:key_center_apply','Apply');
            if(tonicWritten===false||scaleWritten===false||applied===false){
                lastError='Key apply failed';seqToast(lastError);
            }else{
                committedPad=pad;armed=false;seqToast(chosen.display);
            }
        }
    }
    appState.dirty=true;
    return true;
}
/** No track-colored feedback: the reference tonic is always white. */
export function scaleFindingColors():number[]{
    const tonic=scaleTonicColumn();
    return Array.from({length:32},(_,pad)=>{
        if(pad===selectedPad)return SCALE_FINDING_GREEN;
        if(pad%8===tonic)return SCALE_FINDING_WHITE;
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
        const color=knob<4?ROW_COLORS[knob]:knob===6?(armed?SCALE_FINDING_GREEN:123):
            knob===7?SCALE_FINDING_WHITE:0;
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
        if(type===144&&value>0)selectScaleFindingPad(key-68);
        return true; // Consume releases; never send a note to the instrument.
    }
    if((type===144||type===128)&&key<8){
        if(type===144&&value>0&&key===6){armed=!armed;lastError='';appState.dirty=true;}
        return true;
    }
    if(type!==176)return false;
    if(key>=71&&key<=74){
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
        referenceTonic=clampMod(referenceTonic+direction,12);
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
        tonicColumn:scaleTonicColumn(),selectedPad,committedPad,armed,error:lastError};
}
