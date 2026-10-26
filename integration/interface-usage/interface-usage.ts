import {appState} from './state.js';
import {seqState} from '../seq/state.js';
import {panelSpec,PANEL_LAYOUT_VERSION,normalizedMode} from '../renderer/panel-catalog.js';
import {InteractionLog,type UsageContext} from './interaction-log.js';
export const USAGE_SOFTWARE='0.34.1-hbclean.258';
export const USAGE_REPORT_PATH='/data/UserData/schwung/movy-interface-report.json';
export const USAGE_PATHS=['/data/UserData/schwung/movy-interface-usage-a.json','/data/UserData/schwung/movy-interface-usage-b.json'];
export const interactionLog=new InteractionLog();
const views=['Clips','Normal Play','Motif Play','Joint Play','Grid Sequencer','Field Play','Chord Play','HB Settings'];
let surface={view:'',panel:'surface',group:'Core',owner:'Track',keys:[] as string[]};
let initialized=false,dirty=false,exportPending=false,purgePending=false,lastInput=0,lastSave=0,retryAfter=0,generation=0,status='Local only';
const held=new Map<number,{context:UsageContext;control:string;at:number}>();
export function observeUsagePanel(mode:string,ctl:any):void{
    const spec=panelSpec(mode,ctl.page),nav=ctl.hbNavigation?.location();
    surface={view:normalizedMode(mode),panel:nav?.menu?'settings/'+nav.choice:spec.id,group:nav?.category??spec.group,owner:spec.owner,keys:ctl.page?.keys??[]};
    if(ctl.state.pickerOpen)surface.panel+='/picker';
    else if(ctl.state.menuEntered)surface.panel+='/menu';
}
export function usageContext(mode:number):UsageContext{
    const view=views[mode]??'Unknown',match=surface.view===view;
    return {view,panel:match?surface.panel:'surface',group:match?surface.group:'Core',owner:match?surface.owner:'Track',track:appState.activeTrack.index+1,playing:seqState.playing,recording:seqState.recording,shift:appState.shiftHeld};
}
/** Observe the UI dispatcher only. Pressure/clock and external musical MIDI are ignored. */
export function usageControl(key:number,context:UsageContext):string{return surface.view===context.view?(surface.keys[key]??'knob-'+key):'knob-'+key;}
export function recordUsageInput(data:number[],before:UsageContext,after:UsageContext,now=Date.now(),knobControl?:string):void{
    const type=data[0]&240,key=data[1],value=data[2];
    if(type!==144&&type!==128&&type!==176)return;
    lastInput=now;
    if(!interactionLog.enabled||knobControl?.startsWith('usage_'))return;
    if(type===144||type===128){
        const family=key<8?'knob':key>=16&&key<=31?'step':key>=68&&key<=99?'pad':'';
        if(!family)return;
        if(type===144&&value>0){if(!held.has(key))held.set(key,{context:before,control:family==='knob'?(knobControl??usageControl(key,before)):family+'-'+(key-(family==='step'?16:68)),at:now});}
        else {const touch=held.get(key);if(!touch)return;held.delete(key);interactionLog.record(touch.context,'gesture',touch.control,'observed',now,0,Math.max(0,now-touch.at));dirty=true;}
        return;
    }
    const delta=value<64?value:value-128;
    if(key>=71&&key<=78){if(delta){interactionLog.record(before,'turn',knobControl??usageControl(key-71,before),'observed',now,delta);dirty=true;}return;}
    if(!value)return;
    const names:Record<number,string>={14:'jog',3:'click',50:'view',51:'back',54:'minus',55:'plus',56:'undo',62:'left',63:'right',85:'play',86:'record',40:'track',41:'track',42:'track',43:'track'};
    const control=names[key];if(!control)return;
    const navigation=['jog','click','view','back','left','right','track'].includes(control);
    interactionLog.record(before,navigation?'navigate':'button',control,navigation?(before.view!==after.view||before.panel!==after.panel||before.track!==after.track?'moved':'unchanged'):'requested',now,0,0,after.view+'/'+after.panel);dirty=true;
}
/** Read once at UI startup; never poll host metadata to learn what was touched. */
export function initInterfaceUsage():void{
    if(initialized)return;initialized=true;
    const candidates:any[]=[];
    for(const path of USAGE_PATHS){try{const text=typeof host_read_file==='function'?host_read_file(path):null;if(text&&text.length<=2000000){const value=JSON.parse(text);if(value.schema===1&&value.layout===PANEL_LAYOUT_VERSION&&Number.isSafeInteger(value.generation)&&value.generation>=0)candidates.push(value);}}catch{}}
    candidates.sort((a,b)=>b.generation-a.generation);
    for(const value of candidates)if(interactionLog.restore(value.history)){generation=value.generation;break;}
    lastSave=Date.now();
}
export function usageValue(key:string):string|null{
    if(key==='usage_enabled')return interactionLog.enabled?'On':'Off';
    if(key==='usage_export'||key==='usage_clear')return 'Shift+Touch';
    if(key==='usage_status')return status;
    return null;
}
export function setUsageValue(key:string,value:string):boolean{
    if(key!=='usage_enabled')return key.startsWith('usage_');
    interactionLog.flush();interactionLog.enabled=value==='On';held.clear();dirty=true;appState.dirty=true;return true;
}
export function usageAction(key:string,shift:boolean):boolean{
    if(key!=='usage_export'&&key!=='usage_clear')return false;
    if(!shift)return true;
    if(key==='usage_clear'){interactionLog.clear();held.clear();purgePending=true;exportPending=false;status='Clear queued';}
    else {exportPending=true;status='Save queued';}
    dirty=true;appState.dirty=true;return true;
}
/** Synchronous device file APIs stay out of playback and active gestures. No timer is added. */
export function tickInterfaceUsage(now=Date.now()):void{
    if(!initialized||(!dirty&&!exportPending&&!purgePending)||seqState.playing||seqState.recording||held.size||now-lastInput<3000||now<retryAfter)return;
    if(!exportPending&&!purgePending&&now-lastSave<60000)return;
    lastSave=now;
    const report={schema:1,layout:PANEL_LAYOUT_VERSION,software:USAGE_SOFTWARE,generation:generation+1,history:interactionLog.snapshot(),coverage:'Move internal UI: physical gestures, shared panels and navigation; observed input is not engine acknowledgment. No automatic layout changes or network upload.'};
    try{
        const text=JSON.stringify(report),path=USAGE_PATHS[(generation+1)%2];
        if(typeof host_write_file!=='function'||typeof host_read_file!=='function')throw new Error('Unavailable');
        host_write_file(path,text);if(host_read_file(path)!==text)throw new Error('Write failed');
        if(purgePending){const other=USAGE_PATHS[generation%2];host_write_file(other,text);if(host_read_file(other)!==text)throw new Error('Clear failed');host_write_file(USAGE_REPORT_PATH,text);if(host_read_file(USAGE_REPORT_PATH)!==text)throw new Error('Clear report failed');}
        if(exportPending){host_write_file(USAGE_REPORT_PATH,text);if(host_read_file(USAGE_REPORT_PATH)!==text)throw new Error('Export failed');}
        generation++;dirty=false;status=exportPending?'Report saved':purgePending?'History cleared':'Saved locally';exportPending=purgePending=false;
    }catch{status='Save failed';retryAfter=now+60000;}
    appState.dirty=true;
}
export const usageParameters=[
    {key:'usage_enabled',name:'Usage Logging',type:'enum',options:['Off','On'],options_as_string:true,default:'On'},
    {key:'usage_export',name:'Save Usage Report',type:'enum',options:['Shift+Touch'],options_as_string:true},
    {key:'usage_clear',name:'Clear Usage History',type:'enum',options:['Shift+Touch'],options_as_string:true},
    {key:'usage_status',name:'Usage Status',type:'string',readOnly:true},
];
