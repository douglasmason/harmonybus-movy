import { sharedPanel } from './shared-panel.js';
const followPanel=sharedPanel();
/** Joint parameters are metadata and track I/O; Schwung owns all panel behavior. */
import { createSchwungPage, type SchwungPage } from '../renderer/schwung-page.js';
import { releasePerformanceTouch } from '../renderer/performance-touch.js';
import { portFor } from '../track/registry.js';
import type { TrackPort } from '../track/port.js';
import { appState } from '../app/state.js';
import { jointPanelGet, jointPanelSet, jointPadRoles } from './joint-play.js';

const shortNames:Record<string,string>={joint_blank:'',joint_steps:'Steps',joint_unit:'Unit',joint_bass:'Bass',joint_comp:'Comp',joint_lower:'Lower',joint_upper:'Upper',joint_chromatic_below:'Below',joint_record_root:'Root',joint_record_bass:'Bass',joint_record_comp:'Comp',joint_record_melody:'Melody'};
const enumeration=(key:string,name:string,options:string[])=>({key,name,short_name:shortNames[key],type:'enum',options,options_as_string:true,default:options[0]});
const setup=[
    enumeration('joint_unit','Track Unit',['1-4','5-8','9-12','13-16']),
    enumeration('joint_blank','',['']),
    enumeration('joint_bass','Bass Source',['Follow','Clip','Pads']),
    enumeration('joint_comp','Comp Source',['Follow','Clip','Pads','Clip + Guide']),
    enumeration('joint_lower','Lower Layout',['2 Octaves','Piano','Chrom Row']),
    enumeration('joint_upper','Upper Layout',['2 Octaves','Piano','Approach']),
    enumeration('joint_chromatic_below','Chrom Below',['Off','Hold','Latch']),
    enumeration('joint_steps','Step Buttons',['Steps','Operators','Motifs']),
];
const recording=[
    enumeration('joint_record_root','Root Record',['Replace']),
    enumeration('joint_record_bass','Bass Record',['Overdub','Replace']),
    enumeration('joint_record_comp','Comp Record',['Overdub','Replace']),
    enumeration('joint_record_melody','Melody Record',['Overdub','Replace']),
];
const participation=[0,1,2,3].map(role=>enumeration('joint_pads_'+role,['Root Pads','Bass Pads','Comp Pads','Melody Pads'][role],['Off','On']));
const display=[enumeration('joint_overlay','Playback Overlay',['Zone','Linked Pair','All Four']),enumeration('joint_secondary','Secondary Play',['Red','Orange','Yellow','Green','Cyan','Blue','Purple','Pink'])];
export const jointParameters=[...setup,...recording,...participation,...display];
const actorNames=['Root','Bass','Comp','Melody'];
const actorFields=['travel_map','chord_mode','chord_inversion','arp_playback','arp_rate','play_range','content_map','rhythm_gen_pattern','rhythm_gen_mode','rhythm_gen_span','rhythm_gen_source','motion_lane','motion_operation','motion_amount','motion_enabled','motion_cycle','motion_every','motion_from','motion_through'];
const actorKey=(role:number,key:string)=>'joint_actor_'+role+'_'+key;
function actorAlias(key:string):{role:number;key:string}|null{
    const match=/joint_actor_([0-3])_([^:]+)(.*)$/.exec(key);
    return match?{role:Number(match[1]),key:key.slice(0,match.index)+match[2]+match[3]}:null;
}
function actorParameters(parameters:any[]):any[]{return actorNames.flatMap((name,role)=>actorFields.flatMap(key=>{
    const meta=parameters.find(parameter=>parameter.key===key);
    return meta?[{...meta,key:actorKey(role,key),name:meta.name,short_name:meta.short_name??meta.name}]:[];
}));}
export function jointHierarchy(hierarchy:any):any {
    const root=hierarchy.levels.root;
    const links=(root.params??[]).filter((parameter:any)=>/^approach_bank_|^harm_play_/.test(parameter.level??''));
    root.name='Joint Setup';root.knobs=setup.map(parameter=>parameter.key);
    root.params=[...setup,{level:'joint_pads'},...actorNames.map((_,role)=>({level:'joint_actor_'+role})),{level:'joint_record'},{level:'rhythm_edit'},...links];
    hierarchy.levels.joint_pads={name:'Joint Pads / Display',knobs:[...participation,...display].map(p=>p.key),params:[...participation,...display]};
    actorNames.forEach((name,role)=>{
        const keys=['joint_pads_'+role,role===1?'joint_bass':role===2?'joint_comp':actorKey(role,'content_map'),...actorFields.slice(0,6).map(key=>actorKey(role,key))];
        hierarchy.levels['joint_actor_'+role]={name:name+' Track',knobs:keys,params:keys.map(key=>({key}))};
        root.params.push({level:'joint_rhythm_'+role});
        const rhythmKeys=['rhythm_gen_pattern','rhythm_gen_mode','rhythm_gen_span','rhythm_gen_source'].map(key=>actorKey(role,key));
        hierarchy.levels['joint_rhythm_'+role]={name:name+' Rhythm',knobs:rhythmKeys,params:rhythmKeys.map(key=>({key}))};
    });
    // A direct view of the comp track's existing editor; no reserved lane,
    // mirrored assignments, or implicit replacement of a user's operation.
    const weaveKeys=['motion_lane','motion_operation','motion_amount','motion_enabled','motion_cycle','motion_every','motion_from','motion_through'].map(key=>actorKey(2,key));
    hierarchy.levels.joint_comp_weave={name:'Comp Weave / Operations',knobs:weaveKeys,params:weaveKeys.map(key=>({key}))};
    hierarchy.levels.joint_actor_2.params.push({level:'joint_comp_weave'});
    hierarchy.levels.joint_rhythm_2.params.push({level:'joint_comp_weave'});
    root.params.push({level:'joint_comp_weave'});
    hierarchy.levels.joint_record={name:'Joint Recording',knobs:recording.map(parameter=>parameter.key),params:recording};
    return hierarchy;
}
const pages=new Map<number,SchwungPage>();
const touches=new Map<number,SchwungPage>();
function panelPort(track:number):TrackPort {
    const native=portFor(track),base=track&~3;
    const recipients=new Map<string,number[]>();
    const getParam=(key:string):string|null=>{
        const alias=actorAlias(key);if(alias)return portFor(base+alias.role).getParam(alias.key);
        const bare=key.replace(/:(base|modulated)$/,'').split(':').pop()??'';
        const meta=jointParameters.find(parameter=>parameter.key===bare);
        if(meta)return key.endsWith(':modulated')?'0':meta.options[jointPanelGet(base,bare)]??meta.options[0];
        const value=native.getParam(key);
        if(key.endsWith(':chain_params')&&value){try{return JSON.stringify([...JSON.parse(value),...jointParameters,...actorParameters(JSON.parse(value))]);}catch(_){}}
        return value;
    };
    const setParam=(key:string,value:string):boolean=>{
        const alias=actorAlias(key);if(alias)return portFor(base+alias.role).setParam(alias.key,value);
        const bare=key.split(':').pop()??'';
        const meta=jointParameters.find(parameter=>parameter.key===bare);
        if(meta){jointPanelSet(base,bare,bare==='joint_chromatic_below'?value:String(meta.options.indexOf(value)));return true;}
        // Assignments and global settings are written once. Performance intents
        // arm only zones with pads; follow-derived bass must not be modified twice.
        if(jointScoped(bare)){
            const down=/^(Down|Touch|Knob)/.test(value)||(bare==='approach_mode_active'&&value==='1');
            const up=/^(Up|Cancel)/.test(value)||(bare==='approach_mode_active'&&value==='0');
            if(down)recipients.set(bare,jointPadRoles(base));
            const roles=recipients.get(bare)??jointPadRoles(base);
            const mask=roles.reduce((bits,role)=>bits|(1<<(base+role)),0);
            const result=roles.map(role=>portFor(base+role).setParam('midi_fx1:joint_pad_'+bare,mask+'|'+value)).every(Boolean);
            if(up)recipients.delete(bare);
            return result;
        }
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
            const scoped=pairs.filter(([key])=>jointScoped(key.split(':').pop()??''));
            const remote=pairs.filter(([key])=>!key.includes(':joint_')&&!jointScoped(key.split(':').pop()??''));
            return [...local,...scoped].every(([key,value])=>setParam(key,value))&&(!remote.length||native.setMany(remote));
        },
        setParamTimeout:(key,value,timeout)=>(key.includes(':joint_')||jointScoped(key.split(':').pop()??''))?setParam(key,value):native.setParamTimeout(key,value,timeout),
        sendMidi:(status,note,velocity)=>native.sendMidi(status,note,velocity)};
}
export function jointPage():SchwungPage {
    const track=appState.focusGroup*4+3;
    let page=pages.get(track);
    if(!page){page=createSchwungPage(panelPort(track),'midi_fx1',{harmonyMode:2,hierarchy:jointHierarchy});pages.set(track,page);}
    return followPanel(page);
}
export function jointPanelTouch(slot:number,down:boolean):boolean {
    if(!down){const owner=touches.get(slot);if(!owner)return false;owner.knobTouch(slot,false);touches.delete(slot);return true;}
    const page=jointPage();touches.set(slot,page);page.knobTouch(slot,true);return true;
}
export function releaseJointPanelTouches():void {
    for(const [slot,page] of touches){if(!releasePerformanceTouch(slot,true))page.knobTouch(slot,false);}
    touches.clear();
}
export function resetJointPanels():void {releaseJointPanelTouches();pages.clear();stepPorts.clear();}

// Existing handlers retain physical release ownership through this group port.
// No performanceTrack: Joint step modifiers never inject a clip-lane action.
const stepPorts=new Map<number,{performanceGet:(key:string)=>string;performanceSet:(key:string,value:string)=>void}>();
export function jointPerformancePort(){
    const base=appState.focusGroup*4;
    let owner=stepPorts.get(base);
    if(!owner){const port=panelPort(base+3);owner={performanceGet:key=>String(port.getParam('midi_fx1:'+key)??''),performanceSet:(key,value)=>{port.setParam('midi_fx1:'+key,value);}};stepPorts.set(base,owner);}
    return owner;
}
function jointScoped(key:string):boolean {
    return /^(approach_(step_touch_|touch_|control_|mode_active$|motif_latch$)|motion_(gesture_|hold_|release$)|key_center$|dominant_color$|dominant_color_family$|harm_play_release|harm_play_advance$|target_scale_|motif_placement$)/.test(key);
}
