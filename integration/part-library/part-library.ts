import { appState } from '../app/state.js';
import { portFor } from '../track/registry.js';
import { engineGeneration, engineReady, seqCmd, seqCmdFlush, requestLabelSync } from './engine.js';
import { currentSetUuid } from './set-session.js';
import { seqState } from './state.js';
import { seqToast } from './render.js';
import { undoableEdit } from '../undo/edit.js';
import { userParts, saveUserPart, isGeneratorPart, userPartLabel, userPartDetails, cleanPartName, type PartKind, type PartMetadata, type UserPart } from './part-storage.js';
import {openTextEntry,closeTextEntry,handleTextEntryMidi,drawTextEntry,tickTextEntry} from '../vendor/schwung/shared/text_entry.mjs';
import fields from './part-settings.json';
import catalog from './part-catalog.json';
import generatorStyles from './generator-styles.json';
import {generatorAuditionUser} from './comp-generator.js';
import { fontPrint, fontWidth } from '../font/index.js';

export const partNamesFor=(kind:PartKind):string[]=>[...catalog[kind].map(entry=>entry.name),...Array.from({length:8},(_,index)=>userPartLabel(kind,index))];
export const partStockCount=(kind:PartKind):number=>catalog[kind].length;
export interface PartContext {track:number; conductor:number; kind?:PartKind; activate:()=>void;}
interface Review { context:PartContext; choice:number; slot:number; signature:string; baseline:string; generation:number; set:string|null; occupied:boolean; save:number|null; ready:boolean; keepWeaving:boolean; sourceRoute:string; metadata:PartMetadata; original:UserPart|null; metadataDirty:boolean; genreChoice:number; initialGenres:string[]; }
let review:Review|null=null;
let naming=false;
const held=new Set<number>();
const get=(key:string):string=>String(host_module_get_param(key)??'');
/** The engine owns clip parsing and control-curve evaluation; the catalog owns labels. */
function savedMetadata(track:number,kind:PartKind):PartMetadata {
    const fields=get('part_summary_'+track).split('|'),steps=Number(fields[1]),automation=Number(fields[3]);
    if(fields.length!==5||fields[0]!=='ps1'||!Number.isInteger(steps)||steps<1||steps>256||!Number.isInteger(automation)||automation<0||automation>7)return {};
    const indexes=fields[2]?fields[2].split(',').map(Number):[];
    if(indexes.some(index=>!Number.isInteger(index)||generatorStyles[index]?.actor.toLowerCase()!==kind))return {};
    const source=indexes.map(index=>generatorStyles[index]);
    const stock=catalog[kind].findIndex(entry=>entry.recipe===fields[4]);
    const related=source.length?source:generatorStyles.filter(style=>style.actor.toLowerCase()===kind&&style.catalog===stock);
    const name=source.length?source[0].name.replace(/ [24]b$/,'')+(source.length>1?' Mix':''):catalog[kind][stock]?.name??fields[4].replace(/-/g,' ');
    return {name:cleanPartName(name),genres:[...new Set(related.flatMap(style=>style.genres))],steps,...(source.length?{automation}:{})};
}
function metadataAvailable(pending:Review):boolean {return pending.save!==null||pending.original!==null;}
function genreChoices(pending:Review):string[]{return ['Original tags','Untagged',...new Set(generatorStyles.filter(style=>style.actor.toLowerCase()===(pending.context.kind??'comp')).flatMap(style=>style.genres))];}

function reviewValid(pending:Review):boolean {
    return engineReady()&&pending.generation===engineGeneration()&&pending.set===currentSetUuid()&&!seqState.recording&&!seqState.countingIn;
}
function saveMetadata(pending:Review):boolean {
    if(!pending.metadataDirty)return true;
    const kind=pending.context.kind??'comp',index=pending.choice-partStockCount(kind);
    if(!reviewValid(pending)||!pending.original||userParts(kind)[index]!==pending.original){seqToast('Selection changed - retry');return false;}
    if(!saveUserPart(index,{...pending.original,...pending.metadata},kind)){seqToast('Preset save failed');return false;}
    pending.original=userParts(kind)[index];pending.metadataDirty=false;return true;
}
function rename(pending:Review):void {
    naming=true;held.clear();
    openTextEntry({title:'Recipe name (32 max)',initialText:pending.metadata.name??'',padSelect:false,
        onConfirm:(name:string)=>{naming=false;if(review===pending){pending.metadata.name=cleanPartName(name);pending.metadataDirty=true;appState.dirty=true;}},
        onCancel:()=>{naming=false;appState.dirty=true;}});
    appState.dirty=true;
}
/** Metadata editing shares the existing review and Schwung's text keyboard. */
export function partReviewMidi(data:number[]):boolean {
    if(!review)return false;
    if(!reviewValid(review)){cancelPartReview();return false;}
    if(naming){handleTextEntryMidi(data);appState.dirty=true;return true;}
    if((data[0]&240)===176&&data[1]===74&&metadataAvailable(review)){
        const choices=genreChoices(review),delta=data[2]<64?data[2]:data[2]-128;
        review.genreChoice=Math.max(0,Math.min(choices.length-1,review.genreChoice+delta));
        review.metadata.genres=review.genreChoice===0?review.initialGenres:review.genreChoice===1?[]:[choices[review.genreChoice]];
        review.metadataDirty=true;appState.dirty=true;return true;
    }
    return false;
}
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
    cancelPartReview();
    if(!engineReady()||seqState.recording||seqState.countingIn){seqToast('Finish recording first');return;}
    const kind=context.kind??'comp',stockCount=partStockCount(kind);
    if(!Number.isInteger(choice)||choice<0||choice>=partNamesFor(kind).length||save!==null&&(!Number.isInteger(save)||save<0||save>=8)){seqToast('Invalid preset');return;}
    if(portFor(context.track).getParam('midi_fx1_module')!=='harmonybus'){seqToast((kind==='bass'?'Bass':'Comp')+' track needs HarmonyBus');return;}
    if(choice>=stockCount&&save===null&&!userParts(kind)[choice-stockCount]){seqToast('Empty user preset');return;}
    const info=get('motif_clip_info_'+context.track).split(','),settings=baseline(context.track);
    if(info.length!==6||!/^[0-9a-f]+$/.test(info[1])||!settings){seqToast('Preset settings unavailable');return;}
    const original=save===null&&choice>=stockCount?userParts(kind)[choice-stockCount]:null;
    const metadata=save!==null?savedMetadata(context.track,kind):{name:original?.name,genres:original?.genres,steps:original?.steps,automation:original?.automation};
    review={context,choice,slot:Number(info[0]),signature:info[1],baseline:settings,generation:engineGeneration(),set:currentSetUuid(),occupied:info[5]==='1',save,ready:false,keepWeaving:false,sourceRoute:get('source_route_'+context.track),metadata,original,metadataDirty:false,genreChoice:0,initialGenres:[...(metadata.genres??[])]};
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
        const generator=payload.startsWith('70617274320a')?generatorStyles[Number(get('generator_info_'+context.track).split('|')[2]?.split(' ')[0])]?.actor:undefined;
        if(generator&&generator.toLowerCase()!==kind){seqToast('Recipe belongs to the other actor');return;}
        const synth=portFor(context.track).getParam('synth_module')??'';
        seqToast(saveUserPart(pending.save,{payload,synth,...pending.metadata,...(generator?{generator:generator as 'Comp'|'Bass'}:{})},kind)?'Saved '+kind+' User '+(pending.save+1):'Preset save failed');return;
    }
    const entry=choice>=stockCount?userParts(kind)[choice-stockCount]:null;
    if(pending.sourceRoute!==get('source_route_'+context.track)){seqToast('Sources changed - preview again');return;}
    if(entry&&entry.synth!==(portFor(context.track).getParam('synth_module')??'')){seqToast('User preset needs its saved instrument');return;}
    if(!saveMetadata(pending))return;
    if(isGeneratorPart(entry)){generatorAuditionUser(context.track,kind,choice-stockCount);return;}
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
    if(naming)return true;
    if(down){held.add(slot);if(review.ready){
        if(slot===0)apply();else if(slot===1||slot===7)cancelPartReview();
        else if(slot===2&&metadataAvailable(review))rename(review);
        else if(slot===4&&review.save===null&&review.original){if(saveMetadata(review)){seqToast('Saved preset info');cancelPartReview();}}
        else if(slot===(review.original?5:2)&&review.save===null&&!isGeneratorPart(review.original))review.keepWeaving=!review.keepWeaving;
    }}
    appState.dirty=true;return true;
}
export function partModalActive():boolean{return review!==null;}
export function cancelPartReview():void{if(naming)closeTextEntry();naming=false;review=null;held.clear();}
export function drawPartReview():boolean {
    if(!review)return false;
    if(!reviewValid(review)){cancelPartReview();return false;}
    if(naming){tickTextEntry();drawTextEntry();return true;}
    const kind=review.context.kind??'comp';
    const generated=review.save===null&&review.choice>=partStockCount(kind)&&isGeneratorPart(userParts(kind)[review.choice-partStockCount(kind)]);
    clear_screen();fontPrint(1,1,(review.save===null?(generated?'Explore ':'Load '):'Save ')+(kind==='bass'?'Bass':'Comp')+' Style',1);
    const line=(y:number,text:string):void=>{if(fontWidth(text)>126){while(fontWidth(text+'~')>126)text=text.slice(0,-1);text+='~';}fontPrint(1,y,text,1);};
    line(13,review.metadata.name??(review.save===null?partNamesFor(kind)[review.choice]:'Current selected clip'));
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
    line(24,userPartDetails(review.metadata));
    line(34,'4 Genre: '+(review.metadata.genres?.join('/')||'Untagged'));
    line(44,review.save!==null?'3 Name / User '+(review.save+1)+(userParts(kind)[review.save]?' replace':' empty'):generated?'3 Name / 5 Save info':'3 Name / 5 Info / 6 '+(review.keepWeaving?'Weave':'Own'));
    line(54,generated?'1 Explore / 2 Cancel':'1 Apply / 2 Cancel');return true;
}
