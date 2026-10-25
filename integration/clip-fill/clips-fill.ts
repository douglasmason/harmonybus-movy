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
import fields from './part-settings.json';
let active=false,choices=[1,0,2,0,1,0],keep=false;
let preview='',request='',generation=0,set:string|null=null,peekUntil=0,message='';
export function fillActive():boolean{return active&&seqState.sessionMode&&clipsPage===0;}
const get=(key:string):string=>String(host_module_get_param(key)??'');
export function setFillActive(enabled:boolean):void {
    active=enabled;message='';if(enabled){setClipsPage(0);refresh();}appState.dirty=true;
}
function refresh():void {
    request=choices.join('_');generation=engineGeneration();set=currentSetUuid();
    preview=engineReady()?get('fill_preview_'+request):'error:Engine unavailable';
    peekUntil=Date.now()+1800;message='';appState.dirty=true;
}
export function fillTick():void{
    if(active&&(!seqState.sessionMode||set!==currentSetUuid()||generation!==engineGeneration())){active=false;appState.dirty=true;}
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
    if(knob<6){const bounds=[15,7,15,7,16,1];choices[knob]=Math.max(knob===4?1:0,Math.min(bounds[knob],choices[knob]+direction));refresh();}
    else if(knob===6){keep=direction>0;appState.dirty=true;}
    else setFillActive(false);
    return true;
}
export function fillCell(track:number,slot:number):boolean {
    if(!fillActive())return false;
    if(seqState.recording||seqState.countingIn){seqToast('Finish recording first');return true;}
    if(!engineReady()||generation!==engineGeneration()||set!==currentSetUuid()){setFillActive(false);return true;}
    if(!/^[0-9a-f]+\|/.test(preview)){seqToast(preview.replace(/^error:/,''));return true;}
    const port=portFor(track);
    if(port.getParam('midi_fx1_module')!=='harmonybus'){seqToast('Destination needs HarmonyBus');return true;}
    const values=port.getMany(fields.map(field=>'midi_fx1:'+field.key),true);
    const settings=fields.map((field,index)=>{const options=field.options as string[]|undefined;return options?options.indexOf(values[index]??''):Number(values[index]??NaN);});
    if(!settings.every((value,index)=>Number.isInteger(value)&&value>=fields[index].min&&value<=fields[index].max)){seqToast('Destination settings unavailable');return true;}
    const signature=get(`fill_target_${track}_${slot}`);if(!/^[0-9a-f]+$/.test(signature)){seqToast('Destination unavailable');return true;}
    undoableEdit('FILL CLIP',`T${track+1} Clip ${slot+1}`,()=>{
        seqCmd(`clipfill ${track} ${slot} ${signature} ${request} ${preview.split('|')[0]} ${settings.join(',')} ${keep?'keep':'own'}`);seqCmdFlush();
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
    line(1,'FILL - pads REPLACE');
    line(12,`1/2 Pitch T${choices[0]+1} C${choices[1]+1}`);
    line(22,`3/4 Rhythm T${choices[2]+1} C${choices[3]+1}`);
    line(32,`5 ${choices[4]} bars  6 ${choices[5]?'Fit pitch':'Sequence'}`);
    if(peekUntil&&preview&&!preview.startsWith('error:')){
        const [signature,duration,count,encoded]=preview.split('|');
        const notes=(encoded??'').split(';').filter(Boolean).map(note=>note.split(',').map(Number));
        const low=Math.min(...notes.map(note=>note[2])),span=Math.max(1,Math.max(...notes.map(note=>note[2]))-low);
        for(const [tick,gate,pitch] of notes){const left=Math.floor(tick*126/Number(duration));fill_rect(left,49-Math.round(9*(pitch-low)/span),Math.max(1,Math.min(127-left,Math.floor(gate*126/Number(duration)))),2,1);}
        line(57,`${count} notes | 8 Exit`);
    }else{
        line(43,`7 ${keep?'Keep weaving':'Own content'} / 8 Exit`);
        line(54,message|| (preview.startsWith('error:')?preview.slice(6):'Touch knob: preview'));
    }
    return true;
}
