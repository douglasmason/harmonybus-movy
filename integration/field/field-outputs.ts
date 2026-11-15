/** Normalized lane outputs. UI holds are transient; DSP owns glide and expiry. */
import { PAD_PALETTE } from '../keyboard/pad-palette.js';
export type Output = {raw:number;value:number;target:number;latched:boolean;label?:string;description?:string};
type Hold = {lane:number;base:number;offset:number;anchor:number|null;spacing:number};
const holds=new Map<string,Hold>();

/** A pad-plane is merely another pair of owners in the existing Field lane map.
 * Its contacts are physical note IDs, not new MIDI voices or synth events.
 * Insertion order is authoritative: first finger X/Y, second Y only.
 */
type XYContact={x:number;y:number;anchor:number|null;pressureOffset:number};
type XYPoint={x:number;y:number;at:number};
const xyContacts=new Map<string,Map<number,XYContact>>();
const xyOwners=new Map<string,readonly [number,number]>();
const xyTrails=new Map<string,XYPoint[]>();
const xyKey=(source:string,axis:'x'|'y')=>source+':xy:'+axis;
const clamp01=(value:number)=>Math.max(0,Math.min(1,value));
function cancelXYSource(source:string,trail=true):void {
    xyContacts.delete(source);xyOwners.delete(source);
    holds.delete(xyKey(source,'x'));holds.delete(xyKey(source,'y'));
    if(trail)xyTrails.delete(source);
    changed=true;
}
function updateXYSource(source:string,height:number):void{
    const contacts=xyContacts.get(source),pair=xyOwners.get(source);
    if(!contacts?.size||!pair)return;
    const values=[...contacts.values()],primary=values[0],vertical=values[1]??primary;
    const x=primary.x,y=clamp01(vertical.y+vertical.pressureOffset);
    // Maintain the same two physical Field leases, independent of web touches.
    for(const [axis,lane,base] of [['x',pair[0],x],['y',pair[1],y]] as const){
        const key=xyKey(source,axis);
        holds.set(key,{lane,base,offset:0,anchor:null,spacing:1/Math.max(1,height-1)});
    }
    const history=xyTrails.get(source)??[],prior=history[history.length-1];
    if(!prior||Math.abs(prior.x-x)+Math.abs(prior.y-y)>.005){
        history.push({x,y,at:Date.now()});if(history.length>24)history.shift();
        xyTrails.set(source,history);
    }
    changed=true;
}
/** A bounded 8x4 Move or 8x8 Launchpad X multi-touch Field XY surface.
 * Return the existing per-lane latch requests only on the last normal release.
 * Release/cancel at any other boundary never makes a new DSP latch.
 */
export function outputXYPad(source:string,index:number,down:boolean,height:number):OutputFinish[]{
    if(!['move','launchpad','remote'].includes(source)||!Number.isInteger(index)||
        index<0||index>=height*8||![4,8].includes(height))return [];
    let contacts=xyContacts.get(source);
    if(down){
        if(!contacts){contacts=new Map();xyContacts.set(source,contacts);
            xyOwners.set(source,[outputLane(0),outputLane(1)]);
        }
        if(contacts.has(index)||contacts.size>=2)return [];
        contacts.set(index,{x:index%8/7,y:1-Math.floor(index/8)/(height-1),
            anchor:null,pressureOffset:0});
        updateXYSource(source,height);
        return [];
    }
    if(!contacts?.delete(index))return [];
    if(contacts.size){updateXYSource(source,height);return [];}
    xyContacts.delete(source);xyOwners.delete(source);
    const finished=[finishHold(xyKey(source,'x')),finishHold(xyKey(source,'y'))];
    return finished.filter((value):value is OutputFinish=>value!==undefined);
}
/** First aftertouch anchors, subsequent pressure fine-tunes the currently
 * vertical finger within half a pad row (Y). The DSP still owns smoothing.
 */
export function outputXYPressure(source:string,index:number,pressure:number,height:number):void{
    const contacts=xyContacts.get(source),contact=contacts?.get(index);
    if(!contact||!Number.isFinite(pressure)||![4,8].includes(height))return;
    const value=Math.max(0,Math.min(127,pressure));
    if(contact.anchor===null)contact.anchor=value;
    contact.pressureOffset=(value-contact.anchor)/127/(height-1)*.5;
    if([...(contacts?.keys()??[])].at(-1)===index || contacts?.size===1)updateXYSource(source,height);
}
/** Exact physical grid contact data for the shared redrawn pad frame. */
export function outputXYActive(source:string):boolean{return (xyContacts.get(source)?.size??0)>0;}
export function outputXYColors(source:string,height:number):number[]{
    const [laneX,laneY]=[outputLane(0),outputLane(1)];
    const x=clamp01(effectiveHeld(laneX)??outputs[laneX].value),
        y=clamp01(effectiveHeld(laneY)??outputs[laneY].value);
    const column=Math.round(x*7),row=Math.round((1-y)*(height-1));
    const touches=xyContacts.get(source),trail=xyTrails.get(source)??[],now=Date.now();
    return Array.from({length:8*height},(_,index)=>{
        const c=index%8,r=Math.floor(index/8);
        const contact=touches?.has(index)??false;
        const cursor=c===column&&r===row;
        const cross=c===column||r===row;
        const blue=trail.reduce((level,point)=>{
            if(now-point.at>1600)return level;
            const tc=Math.round(point.x*7),tr=Math.round((1-point.y)*(height-1));
            return tc===c&&tr===r?Math.max(level,Math.round((1-(now-point.at)/1600)*60)):level;
        },0);
        if(source==='launchpad'){
            const green=contact?127:cursor?80:cross?18:0;
            return 0x200000|(green<<7)|(contact?0:cursor?110:blue);
        }
        // Move's available hardware palette is quantized green/neutral.
        return contact?119:cursor?118:cross?32:blue>10?11:0;
    });
}

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
    // Clearing either axis invalidates the whole 2D capture. A held finger
    // cannot silently re-arm the other axis after a remote lane clear.
    for(const [source,pair] of xyOwners)if(pair.includes(lane))cancelXYSource(source);
    for(const [key,hold] of holds)if(hold.lane===lane)holds.delete(key);
    changed=true;
}
export function releaseOutputs(source?:string):void{
    for(const key of [...xyContacts.keys()])if(!source||key===source)cancelXYSource(key);
    for(const key of holds.keys())if(!source||key.startsWith(source+':'))holds.delete(key);
    if(!source)xyTrails.clear();
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
