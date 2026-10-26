/** Per-actor settings use the native sequencer's save and Undo path. */
import { engineReady, seqCmdFlush } from './engine.js';
import { beginEdit, CLOSE } from '../undo/group.js';
import { seqEdit } from '../undo/record.js';
const fields=['amount','gate','velocity','omit','reroll','gate_lock','velocity_lock','omit_lock'];
const names=['Amount %','Gate Depth %','Velocity Depth %','Omit Depth %','Reroll / Seed','Gate','Dynamics','Omissions'];
const percentages=Array.from({length:101},(_,index)=>String(index));
const lockChoices=['Vary','Lock'];
const choices=[percentages,percentages,percentages,percentages,Array.from({length:256},(_,index)=>String(index+1)),lockChoices,lockChoices,lockChoices];
export const variationKeys=(role:number):string[]=>fields.map(field=>'joint_variation_'+role+'_'+field);
export const variationParameters=[1,2,3].flatMap(role=>variationKeys(role).map((key,index)=>({
    key,name:names[index],short_name:names[index],type:'enum',options:choices[index],options_as_string:true,
    default:['0','50','30','0','1','Vary','Vary','Vary'][index],
})));
function identity(base:number,key:string):{actor:number;field:number}|null {
    const match=/^joint_variation_([1-3])_(.+)$/.exec(key);
    if(!match)return null;
    const field=fields.indexOf(match[2]);return field<0?null:{actor:base+Number(match[1]),field};
}
function read(actor:number):number[] {
    const value=typeof host_module_get_param==='function'?host_module_get_param('variation_'+actor):null;
    const values=String(value??'').trim().split(/\s+/).map(Number);
    if(values.length===6&&values.every(Number.isFinite))return [...values,0]; // Legacy session.
    return values.length===7&&values.every(Number.isFinite)?values:[actor,0,50,30,0,1,0];
}
export function variationPanelGet(base:number,key:string):string|null {
    const target=identity(base,key);if(!target)return null;
    const values=read(target.actor);
    if(target.field>=5)return (values[6] & (1<<(target.field-5)))!==0?'Lock':'Vary';
    return String(values[target.field+1]);
}
export function variationPanelSet(base:number,key:string,value:string):boolean {
    const target=identity(base,key);if(!target)return false;
    const selected=choices[target.field].indexOf(value);if(selected<0||!engineReady())return true;
    const values=read(target.actor);
    if(target.field===4)values[5]=selected+1;
    else if(target.field>=5){
        const bit=1<<(target.field-5);
        values[6]=selected?values[6]|bit:values[6]&~bit;
    } else values[target.field+1]=selected;
    beginEdit({key:'variation-'+target.actor+'-'+target.field,verb:'Clip Variation',target:'Track '+(target.actor+1),close:CLOSE.IDLE,seq:true});
    seqEdit('variation '+values.join(' '));seqCmdFlush();return true;
}
