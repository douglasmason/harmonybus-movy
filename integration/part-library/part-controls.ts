import { portFor } from '../track/registry.js';
import { seqCmd,seqCmdFlush } from './engine.js';
import { recordParamOp } from '../undo/record.js';
import { beginGesture } from '../undo/edit.js';
import { undoableEdit } from '../undo/edit.js';
import { partNames } from './part-library.js';
export interface PartChoice {style:number; user:number;}
export const partChoice:PartChoice={style:0,user:0};
const nativeKeys:{[key:string]:string}={cp_velocity:'render_velocity_percent',cp_form_live:'chord_form',cp_voicing_live:'chord_voicing',cp_mapping:'travel_map'};
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
        return [{...parameter,key,name:({cp_velocity:'Velocity',cp_form_live:'Chord Form',cp_voicing_live:'Voicing',cp_mapping:'Mapping'} as any)[key],...(key==='cp_mapping'?{options:['Relative','Closest Split'],default:'Relative'}:{})}];
    });
    return [...aliases,{key:'cp_style',name:'Comp Style',type:'enum',options:partNames,options_as_string:true,default:partNames[0]},
        {key:'cp_gate',name:'Note Length %',type:'int',min:10,max:200,step:5,default:100},
        {key:'cp_register',name:'Register',type:'int',min:-24,max:24,step:1,default:0},
        {key:'cp_user',name:'User Slot',type:'int',min:1,max:8,step:1,default:1},
        ...['load','save'].map(action=>({key:'cp_'+action,name:action==='load'?'Load Style':'Save User',type:'string',readOnly:true}))];
}
export function partRead(key:string,track:number):string|null {
    if(key==='cp_style')return partNames[partChoice.style];
    if(key==='cp_user')return String(partChoice.user+1);
    if(key==='cp_load')return 'LOAD';if(key==='cp_save')return 'SAVE';
    if(nativeKeys[key])return portFor(track).getParam('midi_fx1:'+nativeKeys[key]);
    if(key==='cp_gate'||key==='cp_register'){
        const info=partInfo(track);
        return info.length===4?info[key==='cp_gate'?2:1]:key==='cp_gate'?'100':'0';
    }
    return null;
}
export function partWrite(key:string,value:string,track:number):boolean|null {
    if(key==='cp_style'){const choice=partNames.indexOf(value);if(choice<0)return false;partChoice.style=choice;return true;}
    if(key==='cp_user'){const choice=Number(value);if(!Number.isInteger(choice)||choice<1||choice>8)return false;partChoice.user=choice-1;return true;}
    if(nativeKeys[key]){
        const port=portFor(track),target='midi_fx1:'+nativeKeys[key],old=port.getParam(target);if(old===null)return false;
        beginGesture('comp:'+track+':'+key,'COMP PARAM','T'+(track+1),true);
        const result=port.setParam(target,value);if(result)recordParamOp(track,target,old,value);return result;
    }
    if(key==='cp_gate'||key==='cp_register'){
        const info=partInfo(track,true);
        if(info.length!==4||!info[3])return false;infoCache.at=0;
        undoableEdit('COMP '+(key==='cp_gate'?'LENGTH':'REGISTER'),'T'+(track+1),()=>seqCmd(`pshape ${track} ${info[0]} ${key==='cp_gate'?'gate':'register'} ${value}`));seqCmdFlush();return true;
    }
    return null;
}
