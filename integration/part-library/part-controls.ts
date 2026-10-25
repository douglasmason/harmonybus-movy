import { portFor } from '../track/registry.js';
import { seqCmd,seqCmdFlush } from './engine.js';
import { recordParamOp } from '../undo/record.js';
import { beginGesture } from '../undo/edit.js';
import { undoableEdit } from '../undo/edit.js';
import { partNamesFor } from './part-library.js';
import type { PartKind } from './part-storage.js';
export interface PartChoice {style:number; user:number;}
export const partChoice:PartChoice={style:0,user:0};
const bassChoice:PartChoice={style:0,user:0};
export const partKind=(key:string):PartKind=>key.startsWith('bp_')?'bass':'comp';
export const partChoiceFor=(kind:PartKind):PartChoice=>kind==='bass'?bassChoice:partChoice;
const nativeKeys:{[key:string]:string}={cp_velocity:'render_velocity_percent',cp_form_live:'chord_form',cp_voicing_live:'chord_voicing',cp_mapping:'travel_map',bp_velocity:'render_velocity_percent',bp_mapping:'travel_map'};
export const partNativeKey=(key:string):string|null=>nativeKeys[key]??null;
let infoCache={track:-1,at:0,fields:[] as string[]};
function partInfo(track:number,fresh=false):string[]{
    const now=Date.now();
    if(fresh||infoCache.track!==track||now-infoCache.at>=50)infoCache={track,at:now,fields:String(typeof host_module_get_param==='function'?host_module_get_param('part_info_'+track)??'':'').split('|')};
    return infoCache.fields;
}
export function partParameters(native:any[]):any[]{
    const aliases=Object.entries(nativeKeys).flatMap(([key,target])=>{
        const parameter=native.find(entry=>entry.key===target);if(!parameter)return [];
        return [{...parameter,key,name:({render_velocity_percent:'Velocity',chord_form:'Chord Form',chord_voicing:'Voicing',travel_map:'Mapping'} as any)[target],...(target==='travel_map'?{options:['Relative','Closest Split'],default:'Relative'}:{})}];
    });
    return [...aliases,...(['comp','bass'] as const).flatMap(kind=>{
        const prefix=kind==='bass'?'bp_':'cp_',names=partNamesFor(kind);
        return [{key:prefix+'style',name:kind==='bass'?'Bass Style':'Comp Style',type:'enum',options:names,options_as_string:true,default:names[0]},
            {key:prefix+'gate',name:'Note Length %',type:'int',min:10,max:200,step:5,default:100},
            {key:prefix+'register',name:'Register',type:'int',min:-24,max:24,step:1,default:0},
            {key:prefix+'user',name:'User Slot',type:'int',min:1,max:8,step:1,default:1},
            ...['load','save'].map(action=>({key:prefix+action,name:action==='load'?'Load Style':'Save User',type:'string',readOnly:true}))];
    })];
}
export function partRead(key:string,track:number):string|null {
    if(!/^(cp|bp)_/.test(key))return null;
    const kind=partKind(key),choice=partChoiceFor(kind),control=key.slice(3);
    if(control==='style')return partNamesFor(kind)[choice.style];
    if(control==='user')return String(choice.user+1);
    if(control==='load')return 'LOAD';if(control==='save')return 'SAVE';
    if(nativeKeys[key])return portFor(track).getParam('midi_fx1:'+nativeKeys[key]);
    if(control==='gate'||control==='register'){
        const info=partInfo(track);
        return info.length===4?info[control==='gate'?2:1]:control==='gate'?'100':'0';
    }
    return null;
}
export function partWrite(key:string,value:string,track:number):boolean|null {
    if(!/^(cp|bp)_/.test(key))return null;
    const kind=partKind(key),selected=partChoiceFor(kind),control=key.slice(3);
    if(control==='style'){const choice=partNamesFor(kind).indexOf(value);if(choice<0)return false;selected.style=choice;return true;}
    if(control==='user'){const choice=Number(value);if(!Number.isInteger(choice)||choice<1||choice>8)return false;selected.user=choice-1;return true;}
    if(nativeKeys[key]){
        const port=portFor(track),target='midi_fx1:'+nativeKeys[key],old=port.getParam(target);if(old===null)return false;
        beginGesture(kind+':'+track+':'+key,kind.toUpperCase()+' PARAM','T'+(track+1),true);
        const result=port.setParam(target,value);if(result)recordParamOp(track,target,old,value);return result;
    }
    if(control==='gate'||control==='register'){
        const info=partInfo(track,true);
        if(info.length!==4||!info[3])return false;infoCache.at=0;
        undoableEdit(kind.toUpperCase()+' '+(control==='gate'?'LENGTH':'REGISTER'),'T'+(track+1),()=>seqCmd(`pshape ${track} ${info[0]} ${control==='gate'?'gate':'register'} ${value}`));seqCmdFlush();return true;
    }
    return null;
}
