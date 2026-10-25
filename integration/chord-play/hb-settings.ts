import { returnPreviousInputView } from './router-buttons.js';
import { sharedPanel } from './shared-panel.js';
const followPanel=sharedPanel();
/** Session destination layered over the current performance owner. */
import { appState } from '../app/state.js';
import { seqState } from './state.js';
import { portFor } from '../track/registry.js';
import { createSchwungPage, type SchwungPage } from '../renderer/schwung-page.js';
import { releasePerformanceTouch } from '../renderer/performance-touch.js';
import { drawHeader, drawBankBar } from '../renderer/header.js';
let opened=false,previousSession=false,page:SchwungPage|null=null,owner=-1;
const touches=new Map<number,SchwungPage>();
export const settingsOpen=():boolean=>opened;
export const settingsActive=():boolean=>opened&&!seqState.sessionMode;
export function setSettingsOpen(value:boolean,returnToSession=seqState.sessionMode):void{
    if(value===opened)return;
    for(const [slot,current] of touches)if(!releasePerformanceTouch(slot,true))current.knobTouch(slot,false);
    touches.clear();opened=value;
    if(value){previousSession=returnToSession;owner=appState.activeTrack.index;page=null;seqState.sessionMode=false;}
    else seqState.sessionMode=previousSession;
    appState.dirty=true;
}
export function settingsHierarchy(hierarchy:any):any{
    const levels=hierarchy.levels;
    const order=['follower_root','next_harm','grid_timing','role_defaults','conductor_chord_defaults','follower_chord_defaults','conductor_scale_defaults','follower_scale_defaults','chord_defaults_status','pad_display','shared_context','follower_this','diagnostics'];
    const routing=['version','track_role','render_channel','receive_channel'];
    levels.root={...levels.root,name:'HB Settings',knobs:routing,params:[...routing.map((key:string)=>({key})),...order.filter(key=>levels[key]).map(level=>({level}))]};
    const retained=new Set<string>();
    const retain=(key:string):void=>{if(retained.has(key)||!levels[key])return;retained.add(key);for(const item of levels[key].params??[])if(item.level)retain(item.level);};
    retain('root');for(const key of Object.keys(levels))if(!retained.has(key))delete levels[key];
    return hierarchy;
}
export function settingsPage():SchwungPage{
    if(owner!==appState.activeTrack.index){owner=appState.activeTrack.index;page=null;}
    if(!page)page=createSchwungPage(portFor(owner),'midi_fx1',{harmonyMode:3,hierarchy:settingsHierarchy});return followPanel(page);
}
export function tickSettings():void{
    if(!settingsActive())return;
    if(owner!==appState.activeTrack.index){owner=appState.activeTrack.index;page=null;appState.dirty=true;}
    const current=settingsPage(),values=()=>JSON.stringify((current.ctl.page?.keys??[]).map((key:string)=>current.ctl.state.values[key]));
    const before=values();
    if(current.needsTouchPaint)appState.dirty=true;
    current.tick();
    if(values()!==before)appState.dirty=true;
}
export function settingsMidi(data:number[]):boolean{
    const status=data[0]&240,key=data[1],value=data[2],down=status===144&&value>0,up=status===128||(status===144&&!value);
    if(up&&touches.has(key)){touches.get(key)!.knobTouch(key,false);touches.delete(key);appState.dirty=true;return true;}
    if(!settingsActive())return false;
    const current=settingsPage();
    if(down&&key<8){touches.set(key,current);current.knobTouch(key,true);appState.dirty=true;return true;}
    if(status!==176)return false;
    if(key===14){current.changePage(value<64?value:value-128);appState.dirty=true;return true;}
    if(key>=71&&key<=78){current.knobTurn(key-71,value<64?value:value-128);appState.dirty=true;return true;}
    if(key===MoveMainButton){if(value)current.click(appState.shiftHeld);appState.dirty=true;return true;}
    if(key===51){if(value&&current.back()?.action==='exit')returnPreviousInputView();return true;}
    return false;
}
export function renderSettings():void{const current=settingsPage();clear_screen();drawHeader(current.pageTitle,'Track '+(owner+1));drawBankBar(current.pageIndex,current.pageCount);current.render('HB Settings');}
