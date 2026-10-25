import { appState } from '../app/state.js';
import { portFor } from '../track/registry.js';
import { engineGeneration, engineReady, seqCmd, seqCmdFlush, requestLabelSync } from './engine.js';
import { currentSetUuid } from './set-session.js';
import { seqState } from './state.js';
import { seqToast } from './render.js';
import { undoableEdit } from '../undo/edit.js';
import { userParts, saveUserPart } from './part-storage.js';
import fields from './part-settings.json';
import { fontPrint } from '../font/index.js';

export const partNames=['Sustain','Quarters','Offbeats','Sparse Shells','3-3-2','Broken Chord','Registers',...Array.from({length:8},(_,index)=>'User '+(index+1))];
export interface PartContext {track:number; conductor:number; activate:()=>void;}
interface Review { context:PartContext; choice:number; slot:number; signature:string; baseline:string; generation:number; set:string|null; occupied:boolean; save:number|null; ready:boolean; }
let review:Review|null=null;
const held=new Set<number>();
const get=(key:string):string=>String(host_module_get_param(key)??'');
function baseline(track:number):string|null {
    const values=portFor(track).getMany(fields.map(field=>'midi_fx1:'+field.key),true);
    const numbers=fields.map((field,index)=>{
        const text=values[index],options=field.options as string[]|undefined;
        if(text===null||text===undefined||text==='--')return NaN;
        return options?options.indexOf(text):Number(text);
    });
    return numbers.every((value,index)=>Number.isInteger(value)&&value>=fields[index].min&&value<=fields[index].max)?numbers.join(','):null;
}
export function preparePart(context:PartContext,choice:number,save:number|null=null):void {
    review=null;
    if(!engineReady()||seqState.recording||seqState.countingIn){seqToast('Finish recording first');return;}
    if(portFor(context.track).getParam('midi_fx1_module')!=='harmonybus'){seqToast('Comp track needs HarmonyBus');return;}
    if(choice>=7&&save===null&&!userParts()[choice-7]){seqToast('Empty user preset');return;}
    const info=get('motif_clip_info_'+context.track).split(','),settings=baseline(context.track);
    if(info.length!==6||!/^[0-9a-f]+$/.test(info[1])||!settings){seqToast('Preset settings unavailable');return;}
    review={context,choice,slot:Number(info[0]),signature:info[1],baseline:settings,generation:engineGeneration(),set:currentSetUuid(),occupied:info[5]==='1',save,ready:false};
    appState.dirty=true;
}
function apply():void {
    const pending=review;review=null;if(!pending)return;
    const {context,slot,signature,choice}=pending;
    if(!engineReady()||pending.generation!==engineGeneration()||pending.set!==currentSetUuid()||seqState.recording||seqState.countingIn){seqToast('Selection changed - retry');return;}
    const info=get('motif_clip_info_'+context.track).split(',');
    if(info[0]!==String(slot)||info[1]!==signature){seqToast('Clip changed - retry');return;}
    if(pending.save!==null){
        const payload=get('part_export_'+context.track);
        if(payload.startsWith('error:')){seqToast(payload.slice(6));return;}
        if(!/^[0-9a-f]{2,36000}$/.test(payload)){seqToast('Preset export unavailable');return;}
        const synth=portFor(context.track).getParam('synth_module')??'';
        seqToast(saveUserPart(pending.save,{payload,synth})?'Saved User '+(pending.save+1):'Preset save failed');return;
    }
    const entry=choice>=7?userParts()[choice-7]:null;
    if(entry&&entry.synth!==(portFor(context.track).getParam('synth_module')??'')){seqToast('User preset needs its saved instrument');return;}
    const command=`pload ${context.track} ${slot} ${signature} ${entry?'user':'stock'} ${entry?entry.payload:choice} ${pending.baseline}`;
    undoableEdit('LOAD STYLE',`T${context.track+1} CLIP ${slot+1}`,()=>{
        seqCmd(command);seqCmdFlush();
        const result=get('part_result');
        if(result.startsWith('Loaded'))context.activate();
        seqToast(result.replace(/^error:/,''));
    });
    seqCmdFlush();requestLabelSync();appState.dirty=true;
}
export function partModalTouch(slot:number,down:boolean):boolean {
    if(!down&&held.delete(slot)){if(review)review.ready=true;return true;}
    if(!review)return false;
    if(down){held.add(slot);if(review.ready){if(slot===0)apply();else if(slot===1||slot===7)review=null;}}
    appState.dirty=true;return true;
}
export function partModalActive():boolean{return review!==null;}
export function cancelPartReview():void{review=null;}
export function drawPartReview():boolean {
    if(!review)return false;
    clear_screen();fontPrint(1,1,review.save===null?'LOAD COMP STYLE':'SAVE USER STYLE',1);
    fontPrint(1,13,partNames[review.choice],1);
    fontPrint(1,25,`Track ${review.context.track+1} / Clip ${review.slot+1}`,1);
    fontPrint(1,37,review.save!==null?'User '+(review.save+1)+(userParts()[review.save]?' - replace':' - empty'):review.occupied?'Replace clip + settings':'Write mapped clip',1);
    fontPrint(1,51,'1: Apply  2: Cancel',1);return true;
}
