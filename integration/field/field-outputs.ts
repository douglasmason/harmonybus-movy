/** Normalized lane outputs. UI holds are transient; DSP owns glide and expiry. */
import { PAD_PALETTE } from '../keyboard/pad-palette.js';
export type Output = {raw:number;value:number;target:number;latched:boolean;label?:string;description?:string};
type Hold = {lane:number;base:number;offset:number;anchor:number|null;spacing:number};
const holds=new Map<string,Hold>();
export const outputs:Output[]=Array.from({length:16},()=>({raw:.5,value:.5,target:0,latched:false}));
export let outputView=false, vertical=false, outputBank=0, latchMode=false;
export type OutputFinish={lane:number;value:number};
let changed=false;
const bound=(value:number)=>Math.max(0,Math.min(1,value));
/** Labels are formatted by DSP so all surfaces use the same units. */
export function outputLabels(text:string):boolean{
    const rows=text.split(';');if(rows[0]!=='fl1'||rows.length!==17)return false;
    const labels=rows.slice(1).map(row=>row.split('|'));
    if(labels.some(row=>row.length!==2))return false;
    outputs.forEach((output,index)=>{[output.label,output.description]=labels[index];});return true;
}
export function outputSnapshot(text:string):boolean{
    if(!text.startsWith('fo1,')&&!text.startsWith('fo2,'))return false;
    const values=text.slice(4).split(',').map(Number);
    if(![51,55].includes(values.length)||!values.every(Number.isFinite))return false;
    const nextView=values[0]===1,nextVertical=values[1]===1,nextBank=values[2];
    if(outputView!==nextView||vertical!==nextVertical||outputBank!==nextBank)releaseOutputs();
    latchMode=values.length===55&&values[51]===1;
    const latched=values[52]??0,blocked=values[53]??0;
    for(let lane=0;lane<16;lane++)if(blocked&(1<<lane))cancelOutputLane(lane);
    outputView=nextView;vertical=nextVertical;outputBank=nextBank;
    outputs.forEach((output,index)=>Object.assign(output,{raw:values[3+index*3]/10000,value:values[4+index*3]/10000,target:values[5+index*3],latched:!!(latched&(1<<index))}));
    return true;
}
export function outputLane(strip:number):number{return (outputBank*4+strip)%16;}
export function outputPad(source:string,index:number,down:boolean,height:number):OutputFinish|undefined{
    const key=source+':'+index;
    if(!down)return finishHold(key);
    const strip=vertical?index%8:Math.floor(index/8),position=vertical?Math.floor(index/8):index%8;
    const spacing=1/((vertical?height:8)-1);
    const lane=outputLane(strip),knob=holds.get('knob:'+strip);if(knob)knob.base=position*spacing;
    holds.delete(key);holds.set(key,{lane,base:position*spacing,offset:0,anchor:null,spacing});changed=true;
}
export function outputPressure(source:string,index:number,pressure:number):void{
    const hold=holds.get(source+':'+index);if(!hold||!Number.isFinite(pressure))return;
    const bounded=Math.max(0,Math.min(127,pressure));
    if(hold.anchor===null)hold.anchor=bounded;
    // Anchor on first aftertouch, not note velocity; do not snap on contact.
    hold.offset=(bounded-hold.anchor)/127*hold.spacing*.5;changed=true;
}
export function outputKnob(index:number,down:boolean,delta=0):OutputFinish|undefined{
    const key='knob:'+index,lane=outputLane(index);
    if(!down)return finishHold(key);
    let hold=holds.get(key);
    if(!hold){
        let base=outputs[lane].value;for(const existing of holds.values())if(existing.lane===lane)base=existing.base;
        hold={lane,base,offset:0,anchor:null,spacing:1/7};holds.set(key,hold);
    }
    if(delta){
        hold.base=bound(hold.base+delta/1000);
        // Pad pressure is an offset around the knob-adjusted base.
        for(const [otherKey,other] of holds)if(other.lane===lane&&otherKey!==key)other.base=hold.base;
    }
    changed=true;
}
function effectiveHeld(lane:number):number|undefined{
    let value:number|undefined;
    for(const hold of holds.values())if(hold.lane===lane)value=bound(hold.base+hold.offset);
    // Pressure remains a small offset when the knob is the last control.
    if(holds.has('knob:'+((lane-outputBank*4+16)%16))){
        const knob=holds.get('knob:'+((lane-outputBank*4+16)%16))!;
        let offset=0;for(const [key,hold] of holds)if(hold.lane===lane&&!key.startsWith('knob:'))offset=hold.offset;
        value=bound(knob.base+offset);
    }return value;
}
function finishHold(key:string):OutputFinish|undefined{
    const hold=holds.get(key);if(!hold)return;
    const value=effectiveHeld(hold.lane);holds.delete(key);changed=true;
    if(value!==undefined&&effectiveHeld(hold.lane)===undefined)return {lane:hold.lane,value:Math.round(value*10000)};
}
/** Cancellation never commits a latch. */
export function cancelOutputLane(lane:number):void{
    for(const [key,hold] of holds)if(hold.lane===lane)holds.delete(key);
    changed=true;
}
export function releaseOutputs(source?:string):void{
    for(const key of holds.keys())if(!source||key.startsWith(source+':'))holds.delete(key);
    changed=true;
}
export function outputFrame():string{return 'fo1,'+outputs.map((_,lane)=>{const value=effectiveHeld(lane);return value===undefined?-1:Math.round(value*10000);}).join(',');}
export function outputHeld():boolean{return holds.size>0;}
export function outputDirty():boolean{return changed;}
export function outputSent():void{changed=false;}
/** Linear perceptual coverage; adapter quantizes brightness, never output values. */
export function outputPixels(height:number):number[][]{
    return Array.from({length:8*height},(_,index)=>{
        const strip=vertical?index%8:Math.floor(index/8),position=vertical?Math.floor(index/8):index%8;
        const steps=(vertical?height:8)-1,output=outputs[outputLane(strip)];
        const coverage=Math.max(0,1-Math.abs(output.value*steps-position));
        const ghost=Math.abs(output.raw-output.value)>.005?Math.max(0,1-Math.abs(output.raw*steps-position))*.12:0;
        return [ghost,Math.max(ghost,coverage),ghost];
    });
}
export function outputColors(source:string,height:number):number[]{
    return outputPixels(height).map(([red,green,blue])=>{
        // Gamma approximation; physical calibration remains a device check.
        const rgb=[red,green,blue].map(value=>Math.round(Math.pow(value,2.2)*127));
        if(source==='launchpad')return 0x200000|(rgb[0]<<14)|(rgb[1]<<7)|rgb[2];
        const palette=[0,86,85,32,11,126,124,119,118];let best=0,distance=Infinity;
        for(const candidate of palette){const error=PAD_PALETTE[candidate].reduce((sum,value,channel)=>sum+(value-rgb[channel]*255/127)**2,0);if(error<distance){distance=error;best=candidate;}}
        return best;
    });
}
