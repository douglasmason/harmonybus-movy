/** Native sequencer state is authoritative; use the existing Joint panel UI. */
import { seqCmdFlush, engineReady } from './engine.js';
import { beginEdit, CLOSE } from '../undo/group.js';
import { seqEdit } from '../undo/record.js';
const fields=['enabled','pitch_track','pitch_slot','rhythm_track','rhythm_slot','alignment','expression_track','expression_slot','instrument_track','instrument_slot','hb_render_track','hb_render_slot','note_ops_track','note_ops_slot','grid_holds_track','grid_holds_slot','gesture_track','gesture_slot','expression_alignment','instrument_alignment','rhythm_pitch','rhythm_amount','instrument_read','hb_render_read'];
const names=['Source Weaving','Pitch Source','Pitch Clip','Rhythm Source','Rhythm Clip','Alignment','Expression Source','Expression Clip','Instrument Source','Instrument Clip','HB Render Source','HB Render Clip','Note Ops Source','Note Ops Clip','Grid Holds Source','Grid Holds Clip','Gesture Source','Gesture Clip','Expression Alignment','Instrument Alignment','Rhythm Lane','Follow Amount','Instrument Read','HB Render Read'];
// Common assignments first; the stored value is always the actual raw note.
// Every note remains selectable for custom kits, without another mode/knob.
const commonRhythmNotes=[36,38,42,46,39,49,51];
const rhythmNotes=[-1,...commonRhythmNotes,...Array.from({length:128},(_,pitch)=>pitch).filter(pitch=>!commonRhythmNotes.includes(pitch))];
const rhythmNames:Record<number,string>={36:'Kick 36',38:'Snare 38',42:'Closed Hat 42',46:'Open Hat 46',39:'Clap 39',49:'Crash 49',51:'Ride 51'};
const rhythmChoices=rhythmNotes.map(pitch=>pitch<0?'All':rhythmNames[pitch]??'Note '+pitch);
const choices=[['Off','On'],['Own',...Array.from({length:16},(_,index)=>String(index+1))],
    Array.from({length:8},(_,index)=>String(index+1)),
    ['Own',...Array.from({length:16},(_,index)=>String(index+1))],
    Array.from({length:8},(_,index)=>String(index+1)),['Sequential','Timeline','Fit to Window'],
    ['Own',...Array.from({length:16},(_,index)=>String(index+1))],
    Array.from({length:8},(_,index)=>String(index+1)),
    ['Own',...Array.from({length:16},(_,index)=>String(index+1))],
    Array.from({length:8},(_,index)=>String(index+1)),
    ['Own',...Array.from({length:16},(_,index)=>String(index+1))],
    Array.from({length:8},(_,index)=>String(index+1)),
    ['Own',...Array.from({length:16},(_,index)=>String(index+1))],
    Array.from({length:8},(_,index)=>String(index+1)),
    ['Own',...Array.from({length:16},(_,index)=>String(index+1))],
    Array.from({length:8},(_,index)=>String(index+1)),
    ['Own',...Array.from({length:16},(_,index)=>String(index+1))],
    Array.from({length:8},(_,index)=>String(index+1)),['Timeline','Fit to Window'],['Timeline','Fit to Window'],rhythmChoices,[],['Step','Linear'],['Step','Linear']];
export const sourceKeys=(role:number):string[]=>fields.map(field=>'joint_source_'+role+'_'+field);
export const sourceParameters=[0,1,2,3].flatMap(role=>sourceKeys(role).map((key,index)=>(index===21?{key,name:names[index],short_name:names[index],type:'int' as const,min:0,max:100,step:1,default:100}:{key,name:names[index],short_name:names[index],type:'enum' as const,options:choices[index],options_as_string:true,default:choices[index][0]})));
function identity(base:number,key:string):{actor:number;field:number}|null {
    const match=/^joint_source_([0-3])_(.+)$/.exec(key);
    if(!match)return null;
    const field=fields.indexOf(match[2]);return field<0?null:{actor:base+Number(match[1]),field};
}
function read(actor:number):number[] {
    const value=typeof host_module_get_param==='function'?host_module_get_param('source_route_'+actor):null;
    const values=String(value??'').trim().split(/\s+/).map(Number);
    if(values.length===7)values.push(-1,-1);
    if(values.length===9)values.push(-1,-1);
    if(values.length===11)values.push(-1,-1);
    if(values.length===13)values.push(-1,-1);
    if(values.length===15)values.push(-1,-1);
    if(values.length===17)values.push(-1,-1);
    if(values.length===19)values.push(0);
    if(values.length===20)values.push(0);
    if(values.length===21)values.push(-1);
    if(values.length===22)values.push(100);
    if(values.length===23)values.push(0);
    if(values.length===24)values.push(0);
    return values.length===25&&values.every(Number.isFinite)?values:[actor,0,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,0,-1,100,0,0];
}
export function sourcePanelGet(base:number,key:string):string|null {
    const target=identity(base,key);if(!target)return null;
    const values=read(target.actor);const field=target.field;
    const raw=values[field+1];
    if(field===21)return String(raw);
    const index=field===20?rhythmNotes.indexOf(raw):field===1||field===3||field===6||field===8||field===10||field===12||field===14||field===16?raw+1:field===2||field===4||field===7||field===9||field===11||field===13||field===15||field===17?Math.max(0,raw):raw;
    return choices[field][index]??choices[field][0];
}
export function sourcePanelSet(base:number,key:string,value:string):boolean {
    const target=identity(base,key);if(!target)return false;
    const field=target.field;
    const selected=field===21?Number(value):choices[field].indexOf(value);
    if(!Number.isInteger(selected)||selected<0||(field===21&&selected>100)||value.trim()==='')return true;
    if(!engineReady())return true;
    const values=read(target.actor);
    if(field===1||field===3||field===6||field===8||field===10||field===12||field===14||field===16){values[field+1]=selected-1;values[field+2]=selected===0?-1:Math.max(0,values[field+2]);}
    else if(field===2||field===4||field===7||field===9||field===11||field===13||field===15||field===17){if(values[field]===-1)return true;values[field+1]=selected;}
    else values[field+1]=field===20?rhythmNotes[selected]:selected;
    beginEdit({key:'source-'+target.actor+'-'+field,verb:'Source Weaving',target:'Track '+(target.actor+1),close:CLOSE.IDLE,seq:true});
    if(values[23]===0&&values[24]===0)values.length=23;
    seqEdit('source '+values.join(' '));seqCmdFlush();return true;
}
