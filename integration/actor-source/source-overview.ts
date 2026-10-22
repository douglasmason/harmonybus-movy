/** Read-only views of production state. No timers, writes or musical inference. */
import { portFor } from '../track/registry.js';
const roles=['Root','Bass','Comp','Melody'];
const conductorFields=['authority','harmony','next','key','root','bass','candidates','pending'];
const previewFields=['state','pitch','rhythm','expression','instrument','hb_render','gates','notes'];
const conductorNames=['Harmony Authority','Actor Harmony','Conductor Next','Sounding Key','Effective Root','Effective Bass','Override Candidates','Pending Overrides'];
const previewNames=['Playback','Pitch Clip / Phase','Rhythm Clip / Phase','Expression Clip / Phase','Instrument Clip / Phase','HB Render Clip / Phase','Held Gates','Sequencer Notes'];
// Schwung treats string values as paths and hides everything before a slash.
// Use colon for chord inversions and spaces in diagnostics to preserve identity.
const readOnly=(key:string,name:string,shortName:string)=>({key,name,short_name:shortName,type:'string',readOnly:true,access:'read'});
const conductorShort=['Source','Harmony','Next','Key','Root','Bass','Owners','Pending'];
const previewShort=['State','Pitch','Rhythm','Expr','Instr','HB','Gates','Notes'];
export const overviewParameters=[
    ...roles.map((_,role)=>readOnly('joint_preview_'+role+'_gestures','Gesture Clip / Phase','Gesture')),
    ...roles.map((_,role)=>readOnly('joint_preview_'+role+'_grid_holds','Grid Holds Clip / Phase','Holds')),
    ...roles.map((_,role)=>readOnly('joint_preview_'+role+'_note_ops','Note Ops Clip / Phase','Ops')),
    ...conductorFields.map((field,index)=>readOnly('joint_overview_'+field,conductorNames[index],conductorShort[index])),
    ...roles.flatMap((_,role)=>previewFields.map((field,index)=>readOnly('joint_preview_'+role+'_'+field,previewNames[index],previewShort[index]))),
];
export function overviewHierarchy(hierarchy:any):any {
    const add=(level:string,name:string,keys:string[])=>{hierarchy.levels[level]={name,knobs:keys,params:keys.map(key=>({key}))};};
    add('joint_overview','Conductor Overview',conductorFields.map(field=>'joint_overview_'+field));
    hierarchy.levels.root.params.splice(0,0,{level:'joint_overview'});
    roles.forEach((name,role)=>{
        const level='joint_preview_'+role;
        add(level,name+' Source Preview',previewFields.map(field=>level+'_'+field));
        const operationKey='joint_preview_'+role+'_note_ops';
        hierarchy.levels['joint_source_operations_'+role].knobs.push(operationKey);
        hierarchy.levels['joint_source_operations_'+role].params.push({key:operationKey});
        const gestureKey='joint_preview_'+role+'_gestures';
        hierarchy.levels['joint_source_gestures_'+role].knobs.push(gestureKey);
        hierarchy.levels['joint_source_gestures_'+role].params.push({key:gestureKey});
        const holdKey='joint_preview_'+role+'_grid_holds';
        hierarchy.levels['joint_source_operations_'+role].knobs.push(holdKey);
        hierarchy.levels['joint_source_operations_'+role].params.push({key:holdKey});
        hierarchy.levels.root.params.push({level});
        hierarchy.levels['joint_actor_'+role].params.push({level});
        hierarchy.levels['joint_sources_'+role].params.push({level});
    });
    return hierarchy;
}
// Share one bounded read across the eight displayed fields in a refresh burst.
// Expiry is checked only on demand; this never adds an app/audio tick callback.
const snapshots=new Map<string,{at:number;value:any}>();
function snapshot(identity:string,read:()=>string|null):any {
    const now=Date.now(),cached=snapshots.get(identity);
    if(cached&&now>=cached.at&&now-cached.at<100)return cached.value;
    let value:any=null;try{value=JSON.parse(read()??'null');}catch(_){}
    snapshots.set(identity,{at:now,value});return value;
}
export function resetOverview():void {snapshots.clear();}
export function overviewKey(key:string):boolean {return /^joint_(overview_|preview_)/.test(key);}
const pitchClass=(pitch:unknown):string=>typeof pitch==='number'&&Number.isInteger(pitch)&&pitch>=0&&pitch<12?['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'][pitch]:'--';
export function overviewGet(base:number,key:string):string|null {
    if(!overviewKey(key))return null;
    if(key.startsWith('joint_overview_')){
        // The melody actor is the Joint panel's existing context. Authority
        // tracks intentionally bypass their own override in HB's resolver.
        const port=portFor(base+3),field=key.slice(15);
        const direct:Record<string,string>={harmony:'final_harmony',next:'next_harmony',key:'sounding_key'};
        if(direct[field])return (port.getParam('midi_fx1:'+direct[field])||'--').replace(/\//g,':');
        const state=snapshot('harmony-'+base,()=>port.getParam('midi_fx1:harmony_source_snapshot'));
        if(state?.schema!==1)return 'Unavailable';
        if(field==='authority')return state.source==='override'?(Number.isInteger(state.track)&&state.track>=0?'T'+(state.track+1):'Override')+' '+state.scope:'Conductor bus';
        if(field==='root'||field==='bass')return pitchClass(state[field]);
        if(field==='candidates'||field==='pending')return Number.isInteger(state[field])?String(state[field]):'--';
        return '--';
    }
    const match=/^joint_preview_([0-3])_(.+)$/.exec(key);if(!match)return '--';
    const actor=base+Number(match[1]),field=match[2];
    const state=snapshot('source-'+actor,()=>typeof host_module_get_param==='function'?host_module_get_param('source_preview_'+actor):null);
    if(state?.schema!==1||state.actor!==actor)return 'Unavailable';
    if(field==='state')return !state.playing?'Stopped':state.muted?'Muted':state.recording?'Recording own':state.enabled?(state.timeline?'Weave Time':'Weave Seq'):'Own playback';
    if(field==='gates')return Number.isInteger(state.gates)?String(state.gates):'--';
    if(field==='notes'){
        if(!Array.isArray(state.notes))return '--';
        const notes=state.notes.filter((pitch:unknown)=>typeof pitch==='number'&&Number.isInteger(pitch)&&pitch>=0&&pitch<=127);
        return notes.length?notes.slice(0,4).map((pitch:number)=>pitchClass(pitch%12)+(Math.floor(pitch/12)-1)).join(' ')+(notes.length>4?' +'+(notes.length-4):''):'--';
    }
    const dimension=['pitch','rhythm','expression','instrument','hb_render','note_ops','grid_holds','gestures'].indexOf(field);
    const source=state.sources?.[dimension];
    if(!source)return 'No playing clip';
    if(!Number.isInteger(source.track)||!Number.isInteger(source.slot))return 'Unavailable';
    const label='T'+(source.track+1)+'C'+(source.slot+1);
    if(!source.active)return label+' inactive';
    if(!Number.isFinite(source.phase_ticks)||!Number.isFinite(source.length_ticks)||source.length_ticks<=0)return label+' --';
    return label+' '+Math.round(100*source.phase_ticks/source.length_ticks)+'%';
}
