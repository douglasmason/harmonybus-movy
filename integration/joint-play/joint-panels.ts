/** Joint parameters are metadata and track I/O; Schwung owns all panel behavior. */
import { createSchwungPage, type SchwungPage } from '../renderer/schwung-page.js';
import { releasePerformanceTouch } from '../renderer/performance-touch.js';
import { portFor } from '../track/registry.js';
import type { TrackPort } from '../track/port.js';
import { appState } from '../app/state.js';
import { jointPanelGet, jointPanelSet } from './joint-play.js';

const shortNames:Record<string,string>={joint_unit:'Unit',joint_actor:'Actor',joint_bass:'Bass',joint_comp:'Comp',joint_lower:'Lower',joint_upper:'Upper',joint_chromatic_below:'Below',joint_record_root:'Root',joint_record_bass:'Bass',joint_record_comp:'Comp',joint_record_melody:'Melody'};
const enumeration=(key:string,name:string,options:string[])=>({key,name,short_name:shortNames[key],type:'enum',options,options_as_string:true,default:options[0]});
const setup=[
    enumeration('joint_unit','Track Unit',['1-4','5-8','9-12','13-16']),
    enumeration('joint_actor','Edit Actor',['Root','Bass','Comp','Melody']),
    enumeration('joint_bass','Bass Source',['Follow','Clip','Pads']),
    enumeration('joint_comp','Comp Source',['Follow','Clip','Pads','Clip + Guide']),
    enumeration('joint_lower','Lower Layout',['2 Octaves','Piano','Chrom Row']),
    enumeration('joint_upper','Upper Layout',['2 Octaves','Piano','Approach']),
    enumeration('joint_chromatic_below','Chrom Below',['Off','Hold','Latch']),
];
const recording=[
    enumeration('joint_record_root','Root Record',['Replace']),
    enumeration('joint_record_bass','Bass Record',['Overdub','Replace']),
    enumeration('joint_record_comp','Comp Record',['Overdub','Replace']),
    enumeration('joint_record_melody','Melody Record',['Overdub','Replace']),
];
export const jointParameters=[...setup,...recording];
export function jointHierarchy(hierarchy:any):any {
    const root=hierarchy.levels.root;
    const links=(root.params??[]).filter((parameter:any)=>parameter.level);
    root.name='Joint Setup';root.knobs=[...setup.map(parameter=>parameter.key),null];
    root.params=[...setup,{level:'joint_record'},...links];
    hierarchy.levels.joint_record={name:'Joint Recording',knobs:recording.map(parameter=>parameter.key),params:recording};
    return hierarchy;
}
let role=3;
const pages=new Map<number,SchwungPage>();
const touches=new Map<number,SchwungPage>();
export function jointEditRole():number{return role;}
export function setJointEditRole(value:number):void{role=Math.max(0,Math.min(3,value));}
function panelPort(track:number):TrackPort {
    const native=portFor(track),base=track&~3;
    const getParam=(key:string):string|null=>{
        const bare=key.replace(/:(base|modulated)$/,'').split(':').pop()??'';
        const meta=jointParameters.find(parameter=>parameter.key===bare);
        if(meta)return key.endsWith(':modulated')?'0':meta.options[jointPanelGet(base,bare)]??meta.options[0];
        const value=native.getParam(key);
        if(key.endsWith(':chain_params')&&value){try{return JSON.stringify([...JSON.parse(value),...jointParameters]);}catch(_){}}
        return value;
    };
    const setParam=(key:string,value:string):boolean=>{
        const bare=key.split(':').pop()??'';
        const meta=jointParameters.find(parameter=>parameter.key===bare);
        if(meta){jointPanelSet(base,bare,bare==='joint_chromatic_below'?value:String(meta.options.indexOf(value)));return true;}
        return native.setParam(key,value);
    };
    return {track:native.track,bulkReads:native.bulkReads,getParam,setParam,
        getMany:keys=>{
            const remoteKeys=keys.filter(key=>!key.includes(':joint_'));
            const values=native.getMany(remoteKeys);let index=0;
            return keys.map(key=>key.includes(':joint_')?getParam(key):values[index++]??null);
        },
        setMany:pairs=>{
            const local=pairs.filter(([key])=>key.includes(':joint_'));
            const remote=pairs.filter(([key])=>!key.includes(':joint_'));
            return local.every(([key,value])=>setParam(key,value))&&(!remote.length||native.setMany(remote));
        },
        setParamTimeout:(key,value,timeout)=>key.includes(':joint_')?setParam(key,value):native.setParamTimeout(key,value,timeout),
        sendMidi:(status,note,velocity)=>native.sendMidi(status,note,velocity)};
}
export function jointPage():SchwungPage {
    const track=appState.focusGroup*4+role;
    let page=pages.get(track);
    if(!page){page=createSchwungPage(panelPort(track),'midi_fx1',{harmonyMode:2,hierarchy:jointHierarchy});pages.set(track,page);}
    return page;
}
export function jointPanelTouch(slot:number,down:boolean):boolean {
    if(!down){const owner=touches.get(slot);if(!owner)return false;owner.knobTouch(slot,false);touches.delete(slot);return true;}
    const page=jointPage();touches.set(slot,page);page.knobTouch(slot,true);return true;
}
export function releaseJointPanelTouches():void {
    for(const [slot,page] of touches){if(!releasePerformanceTouch(slot,true))page.knobTouch(slot,false);}
    touches.clear();
}
export function resetJointPanels():void {releaseJointPanelTouches();pages.clear();role=3;}
