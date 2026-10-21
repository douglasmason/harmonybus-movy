/** Native sequencer state is authoritative; use the existing Joint panel UI. */
import { seqCmdFlush, engineReady } from './engine.js';
import { beginEdit, CLOSE } from '../undo/group.js';
import { seqEdit } from '../undo/record.js';
const fields=['enabled','pitch_track','pitch_slot','rhythm_track','rhythm_slot','alignment'];
const names=['Source Weaving','Pitch Source','Pitch Clip','Rhythm Source','Rhythm Clip','Alignment'];
const choices=[['Off','On'],['Own',...Array.from({length:16},(_,index)=>String(index+1))],
    Array.from({length:8},(_,index)=>String(index+1)),
    ['Own',...Array.from({length:16},(_,index)=>String(index+1))],
    Array.from({length:8},(_,index)=>String(index+1)),['Sequential','Timeline']];
export const sourceKeys=(role:number):string[]=>fields.map(field=>'joint_source_'+role+'_'+field);
export const sourceParameters=[0,1,2,3].flatMap(role=>sourceKeys(role).map((key,index)=>({key,name:names[index],short_name:names[index],type:'enum',options:choices[index],options_as_string:true,default:choices[index][0]})));
function identity(base:number,key:string):{actor:number;field:number}|null {
    const match=/^joint_source_([0-3])_(.+)$/.exec(key);
    if(!match)return null;
    const field=fields.indexOf(match[2]);return field<0?null:{actor:base+Number(match[1]),field};
}
function read(actor:number):number[] {
    const value=typeof host_module_get_param==='function'?host_module_get_param('source_route_'+actor):null;
    const values=String(value??'').trim().split(/\s+/).map(Number);
    return values.length===7&&values.every(Number.isFinite)?values:[actor,0,-1,-1,-1,-1,0];
}
export function sourcePanelGet(base:number,key:string):string|null {
    const target=identity(base,key);if(!target)return null;
    const values=read(target.actor);const field=target.field;
    const raw=values[field+1];
    const index=field===1||field===3?raw+1:field===2||field===4?Math.max(0,raw):raw;
    return choices[field][index]??choices[field][0];
}
export function sourcePanelSet(base:number,key:string,value:string):boolean {
    const target=identity(base,key);if(!target)return false;
    const selected=choices[target.field].indexOf(value);if(selected<0)return true;
    if(!engineReady())return true;
    const values=read(target.actor);const field=target.field;
    if(field===1||field===3){values[field+1]=selected-1;values[field+2]=selected===0?-1:Math.max(0,values[field+2]);}
    else if(field===2||field===4){if(values[field]===-1)return true;values[field+1]=selected;}
    else values[field+1]=selected;
    beginEdit({key:'source-'+target.actor+'-'+field,verb:'Source Weaving',target:'Track '+(target.actor+1),close:CLOSE.IDLE,seq:true});
    seqEdit('source '+values.join(' '));seqCmdFlush();return true;
}
