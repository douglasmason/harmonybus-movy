import { appState } from '../app/state.js';
import { portFor } from '../track/registry.js';
import { engineGeneration, engineReady, seqCmd, seqCmdFlush, requestLabelSync } from './engine.js';
import { currentSetUuid } from './set-session.js';
import { seqState } from './state.js';
import { seqToast } from './render.js';
import { undoableEdit } from '../undo/edit.js';
import { userParts, saveUserPart, type PartKind } from './part-storage.js';
import fields from './part-settings.json';
import catalog from './part-catalog.json';
import { fontPrint } from '../font/index.js';

const namesFor=(kind:PartKind):string[]=>[...catalog[kind].map(entry=>entry.name),...Array.from({length:8},(_,index)=>'User '+(index+1))];
export const partNames=namesFor('comp');
const bassNames=namesFor('bass');
export const partNamesFor=(kind:PartKind):string[]=>kind==='bass'?bassNames:partNames;
export const partStockCount=(kind:PartKind):number=>partNamesFor(kind).length-8;
export interface PartContext {track:number; conductor:number; kind?:PartKind; activate:()=>void;}
interface Review { context:PartContext; choice:number; slot:number; signature:string; baseline:string; generation:number; set:string|null; occupied:boolean; save:number|null; ready:boolean; keepWeaving:boolean; sourceRoute:string; }
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
    const kind=context.kind??'comp',stockCount=partStockCount(kind);
    if(!Number.isInteger(choice)||choice<0||choice>=partNamesFor(kind).length||save!==null&&(!Number.isInteger(save)||save<0||save>=8)){seqToast('Invalid preset');return;}
    if(portFor(context.track).getParam('midi_fx1_module')!=='harmonybus'){seqToast((kind==='bass'?'Bass':'Comp')+' track needs HarmonyBus');return;}
    if(choice>=stockCount&&save===null&&!userParts(kind)[choice-stockCount]){seqToast('Empty user preset');return;}
    const info=get('motif_clip_info_'+context.track).split(','),settings=baseline(context.track);
    if(info.length!==6||!/^[0-9a-f]+$/.test(info[1])||!settings){seqToast('Preset settings unavailable');return;}
    review={context,choice,slot:Number(info[0]),signature:info[1],baseline:settings,generation:engineGeneration(),set:currentSetUuid(),occupied:info[5]==='1',save,ready:false,keepWeaving:false,sourceRoute:get('source_route_'+context.track)};
    appState.dirty=true;
}
function apply():void {
    const pending=review;review=null;if(!pending)return;
    const {context,slot,signature,choice}=pending;
    const kind=context.kind??'comp',stockCount=partStockCount(kind);
    if(!engineReady()||pending.generation!==engineGeneration()||pending.set!==currentSetUuid()||seqState.recording||seqState.countingIn){seqToast('Selection changed - retry');return;}
    const info=get('motif_clip_info_'+context.track).split(',');
    if(info[0]!==String(slot)||info[1]!==signature){seqToast('Clip changed - retry');return;}
    if(pending.save!==null){
        const payload=get('part_export_'+context.track);
        if(payload.startsWith('error:')){seqToast(payload.slice(6));return;}
        if(!/^[0-9a-f]{2,36000}$/.test(payload)){seqToast('Preset export unavailable');return;}
        const synth=portFor(context.track).getParam('synth_module')??'';
        seqToast(saveUserPart(pending.save,{payload,synth},kind)?'Saved '+kind+' User '+(pending.save+1):'Preset save failed');return;
    }
    const entry=choice>=stockCount?userParts(kind)[choice-stockCount]:null;
    if(pending.sourceRoute!==get('source_route_'+context.track)){seqToast('Sources changed - preview again');return;}
    if(entry&&entry.synth!==(portFor(context.track).getParam('synth_module')??'')){seqToast('User preset needs its saved instrument');return;}
    const command=`pload ${context.track} ${slot} ${signature} ${entry?'user':kind==='bass'?'bass':'stock'} ${entry?entry.payload:choice} ${pending.baseline} ${pending.keepWeaving?'keep':'own'}`;
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
    if(down){held.add(slot);if(review.ready){if(slot===0)apply();else if(slot===1||slot===7)review=null;else if(slot===2&&review.save===null)review.keepWeaving=!review.keepWeaving;}}
    appState.dirty=true;return true;
}
export function partModalActive():boolean{return review!==null;}
export function cancelPartReview():void{review=null;}
export function drawPartReview():boolean {
    if(!review)return false;
    const kind=review.context.kind??'comp';
    clear_screen();fontPrint(1,1,(review.save===null?'LOAD ':'SAVE ')+kind.toUpperCase()+' STYLE',1);
    fontPrint(1,13,review.save===null?partNamesFor(kind)[review.choice]:'Current selected clip',1);
    const pattern=review.save===null?catalog[kind][review.choice]:null;
    if(pattern){
        fontPrint(1,23,`T${review.context.track+1} Clip ${review.slot+1} - ${review.occupied?'replace':'write'}`,1);
        const pitches=pattern.notes.map(note=>note[2]),low=Math.min(...pitches),span=Math.max(1,Math.max(...pitches)-low);
        for(let step=0;step<=pattern.steps;step++)fill_rect(2+Math.floor(123*step/pattern.steps),40,1,step%4?1:2,1);
        for(const [step,gate,pitch,velocity] of pattern.notes){
            const left=2+Math.floor(123*step/pattern.steps),width=Math.min(126-left,Math.max(1,Math.round(123*gate/(pattern.steps*24))));
            fill_rect(left,36-Math.round(8*(pitch-low)/span),width,velocity>=100?3:2,1);
        }
        fontPrint(1,43,review.keepWeaving?'3: Keep weaving':'3: Own content',1);
        fontPrint(1,52,'1: Load  2: Cancel',1);return true;
    }
    fontPrint(1,25,`Track ${review.context.track+1} / Clip ${review.slot+1}`,1);
    fontPrint(1,37,review.save!==null?'User '+(review.save+1)+(userParts(kind)[review.save]?' - replace':' - empty'):review.keepWeaving?'3: Keep weaving':'3: Own content',1);
    fontPrint(1,51,'1: Apply  2: Cancel',1);return true;
}
