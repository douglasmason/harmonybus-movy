/** Existing clips are sources; only explicit edits query/compose native contents. */
import {appState} from '../app/state.js';
import {seqState} from './state.js';
import {engineReady,engineGeneration,seqCmd,seqCmdFlush,requestLabelSync} from './engine.js';
import {currentSetUuid} from './set-session.js';
import {portFor} from '../track/registry.js';
import {undoableEdit} from '../undo/edit.js';
import {seqToast} from './render.js';
import {fontPrint} from '../font/index.js';
import {fitHeaderText} from '../renderer/header.js';
import {clipsPage,setClipsPage} from './clips-layout.js';
import {drumFillTrack} from './clip-page.js';
import fields from './part-settings.json';
let active=false,choices=[1,0,2,0,1,0],keep=false;
let pitchRotation=0,rhythmRotation=0;
let preview='',request='',generation=0,set:string|null=null,peekUntil=0,message='',refreshAt=0;
let lanePage=0;
type FillSnapshot={
    choices:number[]; keep:boolean; pitchRotation:number; rhythmRotation:number;
    request:string; preview:string; generation:number; set:string|null;
};
// The two memories belong to the current Fill session only. Neither stores a
// rendered clip nor creates a second note scheduler or Undo history.
let memories:[FillSnapshot|null,FillSnapshot|null]=[null,null];
const sourceIsDrum=():boolean=>drumFillTrack(choices[0]);
const validPreview=():boolean=>!refreshAt&&/^[0-9a-f]+\|/.test(preview)&&
    generation===engineGeneration()&&set===currentSetUuid();
function fillMemory(slot:number,save:boolean):void{
    const name=slot===0?'A':'B';
    if(save){
        if(!validPreview()||!engineReady()){seqToast('Finish preview before saving '+name);return;}
        memories[slot]={
            choices:[...choices],keep,pitchRotation,rhythmRotation,
            request,preview,generation,set,
        };
        message='Saved '+name;seqToast('Fill '+name+' saved');
    }else{
        const saved=memories[slot];
        if(!saved){seqToast('Fill '+name+' empty');return;}
        if(!engineReady()||saved.set!==currentSetUuid()||saved.generation!==engineGeneration()){
            seqToast('Fill '+name+' belongs to another set');return;
        }
        // Recompute once on an explicit recall. A stale donor must never be
        // silently substituted for the exact material the user bookmarked.
        const current=get('fill_preview_'+saved.request);
        if(current!==saved.preview){seqToast('Fill '+name+' source changed');return;}
        choices=[...saved.choices];keep=saved.keep;
        pitchRotation=saved.pitchRotation;rhythmRotation=saved.rhythmRotation;
        request=saved.request;preview=current;
        generation=engineGeneration();set=currentSetUuid();refreshAt=0;
        lanePage=0;peekUntil=Date.now()+1800;
        message='Recalled '+name;seqToast('Fill '+name+' recalled');
    }
    appState.dirty=true;
}
const previewLanes=():number[]=>preview.startsWith('error:')?[]:(preview.split('|')[5]??'').split(',').filter(Boolean).map(Number);
export function fillActive():boolean{return active&&seqState.sessionMode&&clipsPage===0;}
const get=(key:string):string=>String(host_module_get_param(key)??'');
export function setFillActive(enabled:boolean):void {
    active=enabled;message='';refreshAt=0;
    if(enabled){pitchRotation=0;rhythmRotation=0;memories=[null,null];setClipsPage(0);refresh();}
    appState.dirty=true;
}
function refresh():void {
    refreshAt=0;
    const original=sourceIsDrum()||choices[5]===2;
    const values=[...choices.slice(0,5),original?2:choices[5]];
    // Keep default six-field requests byte-for-byte compatible.
    request=(original||(!pitchRotation&&!rhythmRotation)?values:[...values,pitchRotation,rhythmRotation]).join('_');
    generation=engineGeneration();set=currentSetUuid();
    preview=engineReady()?get('fill_preview_'+request):'error:Engine unavailable';
    lanePage=Math.min(lanePage,Math.max(0,Math.ceil(previewLanes().length/4)-1));
    peekUntil=Date.now()+1800;message='';appState.dirty=true;
}
export function fillTick():void{
    if(active&&(!seqState.sessionMode||set!==currentSetUuid()||generation!==engineGeneration())){active=false;appState.dirty=true;}
    if(fillActive()&&refreshAt&&Date.now()>=refreshAt)refresh();
    if(peekUntil&&Date.now()>=peekUntil){peekUntil=0;appState.dirty=true;}
}
export function fillMidi(data:number[]):boolean {
    if(!fillActive())return false;
    const status=data[0]&240,key=data[1],value=data[2];
    if((status===144||status===128)&&key<8){if(status===144&&value){if(key===7)setFillActive(false);else refresh();}return true;}
    if(status!==176)return false;
    if(key===51||key===14||key===MoveMainButton){if(value)setFillActive(false);return true;}
    if(key<71||key>78)return false;
    if(!value)return true;const knob=key-71,direction=value<64?1:-1;
    if(appState.shiftHeld&&knob>=4){
        if(knob===4)fillMemory(0,true);     // Shift+5: store A.
        else if(knob===5)fillMemory(1,true);// Shift+6: store B.
        else if(knob===6)fillMemory(0,false);// Shift+7: recall A.
        else fillMemory(1,false);          // Shift+8: recall B.
        return true;
    }
    if(sourceIsDrum()&&(knob===2||knob===3))return true;
    if(sourceIsDrum()&&knob===5){lanePage=Math.max(0,Math.min(Math.ceil(previewLanes().length/4)-1,lanePage+direction));peekUntil=Date.now()+1800;appState.dirty=true;return true;}
    if(knob<2)lanePage=0;
    if(appState.shiftHeld&&(knob===0||knob===2)){
        if(sourceIsDrum()||choices[5]===2){seqToast('Rotate: choose Sequence or Fit');return true;}
        if(knob===0)pitchRotation=(pitchRotation+direction+16)%16;
        else rhythmRotation=(rhythmRotation+direction+16)%16;
        refreshAt=Date.now()+70;preview='error:Preparing preview';message='';appState.dirty=true;
        return true;
    }
    if(knob<6){const bounds=[15,7,15,7,16,2];choices[knob]=Math.max(knob===4?1:0,Math.min(bounds[knob],choices[knob]+direction));refreshAt=Date.now()+70;preview='error:Preparing preview';message='';appState.dirty=true;}
    else if(knob===6){keep=direction>0;appState.dirty=true;}
    else setFillActive(false);
    return true;
}
export function fillCell(track:number,slot:number):boolean {
    if(!fillActive())return false;
    if(seqState.recording||seqState.countingIn){seqToast('Finish recording first');return true;}
    if(!engineReady()||generation!==engineGeneration()||set!==currentSetUuid()){setFillActive(false);return true;}
    if(!/^[0-9a-f]+\|/.test(preview)){seqToast(preview.replace(/^error:/,''));return true;}
    const drum=preview.split('|')[4]==='drums';
    if(drum!==drumFillTrack(track)){seqToast(drum?'Choose a drum destination':'Choose a melodic destination');return true;}
    let settingsWire='drums';
    if(!drum){
        const port=portFor(track);
        if(port.getParam('midi_fx1_module')!=='harmonybus'){seqToast('Destination needs HarmonyBus');return true;}
        const values=port.getMany(fields.map(field=>'midi_fx1:'+field.key),true);
        const settings=fields.map((field,index)=>{const options=field.options as string[]|undefined;return options?options.indexOf(values[index]??''):Number(values[index]??NaN);});
        if(!settings.every((value,index)=>Number.isInteger(value)&&value>=fields[index].min&&value<=fields[index].max)){seqToast('Destination settings unavailable');return true;}
        settingsWire=settings.join(',');
    }
    const signature=get(`fill_target_${track}_${slot}`);if(!/^[0-9a-f]+$/.test(signature)){seqToast('Destination unavailable');return true;}
    undoableEdit('FILL CLIP',`T${track+1} Clip ${slot+1}`,()=>{
        seqCmd(`clipfill ${track} ${slot} ${signature} ${request} ${preview.split('|')[0]} ${settingsWire} ${keep?'keep':'own'}`);seqCmdFlush();
        const result=get('part_result');
        if(result.startsWith('Filled')){message=`Filled T${track+1} Clip ${slot+1}`;seqState.session[track].exist|=1<<slot;requestLabelSync();}
        else message=result.replace(/^error:/,'');
        peekUntil=0;seqToast(message);
    });
    seqCmdFlush();appState.dirty=true;return true;
}
export function renderFill():boolean {
    if(!fillActive())return false;
    clear_screen();const line=(y:number,text:string)=>fontPrint(1,y,fitHeaderText(text,126),1);
    const drum=sourceIsDrum();
    if(drum&&peekUntil&&preview&&!preview.startsWith('error:')){
        const [,duration,count,encoded]=preview.split('|'),lanes=previewLanes();
        const notes=(encoded??'').split(';').filter(Boolean).map(note=>note.split(',').map(Number));
        const visibleLanes=lanes.slice(lanePage*4,lanePage*4+4);
        line(1,`DRUM T${choices[0]+1} C${choices[1]+1} / ${choices[4]} bars`);
        for(const [row,pitch] of visibleLanes.entries()){
            const top=12+row*10;fontPrint(1,top,String(pitch),1);
            for(const [tick,gate,note,velocity] of notes){if(note!==pitch)continue;
                const left=21+Math.floor(tick*105/Number(duration));
                fill_rect(left,top+2,Math.max(1,Math.min(127-left,Math.floor(gate*105/Number(duration)))),velocity>=96?4:2,1);
            }
        }
        line(55,`${notes.filter(note=>visibleLanes.includes(note[2])).length}/${count} hits 6:${lanePage+1}/${Math.max(1,Math.ceil(lanes.length/4))}`);
        return true;
    }
    const memoryLabel=(slot:number):string=>{
        const saved=memories[slot];
        if(!saved)return '-';
        return saved.keep===keep&&saved.pitchRotation===pitchRotation&&
            saved.rhythmRotation===rhythmRotation&&
            saved.choices.every((value,index)=>choices[index]===value)?'*':'+';
    };
    const memoryLabels=` A${memoryLabel(0)} B${memoryLabel(1)}`;
    line(1,drum?'FILL DRUM'+memoryLabels:`FILL P${pitchRotation} R${rhythmRotation}`+memoryLabels);
    line(12,`1/2 ${drum?'Drums':'Pitch'} T${choices[0]+1} C${choices[1]+1}`);
    line(22,drum||choices[5]===2?'3/4 Rhythm: original':`3/4 Rhythm T${choices[2]+1} C${choices[3]+1}`);
    line(32,drum?`5 ${choices[4]} bars 6 Lane view`:`5 ${choices[4]} bars  6 ${['Sequence','Fit pitch','Original'][choices[5]]}`);
    if(peekUntil&&preview&&!preview.startsWith('error:')){
        const [signature,duration,count,encoded]=preview.split('|');
        const notes=(encoded??'').split(';').filter(Boolean).map(note=>note.split(',').map(Number));
        const low=Math.min(...notes.map(note=>note[2])),span=Math.max(1,Math.max(...notes.map(note=>note[2]))-low);
        for(const [tick,gate,pitch] of notes){const left=Math.floor(tick*126/Number(duration));fill_rect(left,49-Math.round(9*(pitch-low)/span),Math.max(1,Math.min(127-left,Math.floor(gate*126/Number(duration)))),2,1);}
        line(57,`${count} notes | Sh 5/6 Save 7/8 Load`);
    }else{
        line(43,`7 ${keep?'Keep weaving':'Own content'} / 8 Exit`);
        line(54,message|| (preview.startsWith('error:')?preview.slice(6):'Sh 5/6 Save 7/8 Recall'));
    }
    return true;
}
