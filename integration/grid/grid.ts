import { returnPreviousInputView } from './router-buttons.js';
import { sharedPanel } from './shared-panel.js';
const followPanel=sharedPanel();
/** Shared grid viewport/controller. Musical state remains in the sequencer. */
import { editRangeDown, editStepUp, beginStepAutomation, endStepAutomation, editStepPageKnob } from './step-edit.js';
import { setStepPageSelected, setStepTouchedKnob } from './step-page.js';
import { buildStepPageVM } from './step-page-vm.js';
import { renderKnobsView } from '../renderer/knob-view.js';
import { appState } from '../app/state.js';
import { seqState } from './state.js';
import { seqCmd } from './engine.js';
import { watchedTrack } from './watch.js';
import { undoableEdit } from '../undo/edit.js';
import { trackLabel } from '../undo/label.js';
import { markUiStateDirty } from './ui-dirty.js';
import { createSchwungPage, type SchwungPage } from '../renderer/schwung-page.js';
import { portFor } from '../track/registry.js';
import type { TrackPort } from '../track/port.js';
import { fontPrint } from '../font/index.js';
import { resetKnobLedCache } from '../renderer/knob-leds.js';
import { drawHeader, drawBankBar } from '../renderer/header.js';
import { cachedSetAnimLED, sendPadLedFrame } from './led-cache.js';
import { C_BLACK,C_DARKGREY,C_WHITE,trackColor } from './colors.js';

export type GridViewport={lane:number;page:number;division:number;follow:boolean};
export type GridEvent={tick:number;duration:number;assignment:number};
const divisions=[24,48,96,192,384];
const divisionNames=['1/16','1/8','1/4','1/2','1 Bar'];
const names=Array.from({length:144},(_,index)=>index<128?['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'][index%12]+String(Math.floor(index/12)-1):'Operation '+(index-127));
const freshRows=():number[]=>[60,62,64,65,67,69,71,72,...Array.from({length:16},(_,index)=>128+index),36,38,42,46,48,50,52,55];
let rows=Array.from({length:16},freshRows);
let enabled=false,overview=true;
let timeline:number[]=[];
let occupied:number[]=[];
let lastWindow='';
export const gridOverview=():boolean=>overview;
export const gridTouchPage=():SchwungPage|null=>overview||noteFocus?null:gridPage();
let noteFocus:{track:number;previousLane:number}|null=null;
function clearNoteFocus():void {
    if(!noteFocus)return;editStepUp(1000);endStepAutomation();
    if(noteFocus.track===watchedTrack()){seqState.watchLane=noteFocus.previousLane;seqCmd('wlane '+noteFocus.previousLane);}noteFocus=null;
}
export const gridViews:{[surface:string]:GridViewport}={move:{lane:0,page:0,division:0,follow:true},launchpad:{lane:0,page:0,division:0,follow:true}};
let events:GridEvent[][]=[[],[]];
const queries=new Map<string,string>();
let eventTrack=-1;
let lastPayload='';
let lastPaint:number[]=new Array(32).fill(-1);
let wasActive=false;
const pages=new Map<number,SchwungPage>();
const touched=new Map<number,SchwungPage>();
const held=new Map<string,{track:number;assignment:number;tick:number;duration:number;velocity:number;at:number;focus:boolean}>();
export function gridEnabled():boolean{return enabled;}
export function gridActive():boolean{return enabled&&!seqState.sessionMode;}
export function setGridEnabled(value:boolean):void {
    if(enabled===value)return;
    clearNoteFocus();resetKnobLedCache();
    for(const [slot,page] of touched)page.knobTouch(slot,false);
    touched.clear();held.clear();enabled=value;lastPaint.fill(-1);queries.clear();appState.initLedsDone=false;appState.initLedIndex=0;seqCmd('gview '+Number(value));appState.dirty=true;
}
export function gridSnapshot():number[][]{return rows.map(row=>row.slice());}
export function restoreGrid(value:unknown):void {
    setGridEnabled(false);overview=true;timeline=[];occupied=[];lastWindow='';rows=Array.from({length:16},freshRows);pages.clear();events=[[],[]];queries.clear();eventTrack=-1;lastPayload='';
    for(const view of Object.values(gridViews)){view.lane=0;view.page=0;view.division=0;view.follow=true;}
    if(Array.isArray(value))value.slice(0,16).forEach((row,track)=>{if(Array.isArray(row))row.slice(0,32).forEach((assignment,index)=>{if(Number.isInteger(assignment)&&assignment>=0&&assignment<144)rows[track][index]=assignment;});});
}
export function gridAccept(payload:string,track:number):void {
    if(lastPayload===payload&&eventTrack===track)return;
    lastPayload=payload;eventTrack=track;
    occupied=Array.from(payload.split('/').find(section=>section.startsWith('3@'))?.slice(2)??'',Number);
    timeline=[];
    const summary=payload.split('/').find(section=>section.startsWith('2@'))?.slice(2).split(':');
    if(summary&&summary.length===3&&/^[0-3]{64}$/.test(summary[2]))timeline=Array.from(summary[2],Number);
    events=[[],[]];for(const section of payload.split('/')){const [surface,list]=section.split('@');const index=Number(surface);if(index!==0&&index!==1)continue;events[index]=(list??'').split(',').filter(Boolean).map(item=>item.split(':').map(Number)).filter(parts=>parts.length===3&&parts.every(Number.isFinite)).map(([tick,duration,assignment])=>({tick,duration,assignment}));}
    appState.dirty=true;
}
export function gridWindow(surface:string,columns=8):GridViewport {
    const view=gridViews[surface]??(gridViews[surface]={lane:0,page:0,division:0,follow:true});
    if(view.follow&&seqState.playing)view.page=Math.floor(seqState.posTick/(divisions[view.division]*columns));
    const span=divisions[view.division]*columns;
    view.page=Math.max(Math.floor(seqState.loopStart*24/span),Math.min(Math.ceil((seqState.loopStart+Math.max(16,seqState.lenSteps))*24/span)-1,view.page));
    return view;
}
export function gridWindowLabel():string {
    const view=gridWindow('move'),span=divisions[view.division]*8,start=view.page*span;
    return span<384?'B'+(Math.floor(start/384)+1)+' '+(Math.floor(start%384/span)+1)+'/'+(384/span):'B'+(Math.floor(start/384)+1)+'-'+Math.ceil((start+span)/384);
}
/** Geometry is supplied by the adapter, never fixed by the musical model. */
export function gridColors(surface:string,height:number,width:number):number[] {
    const view=gridWindow(surface,width),duration=divisions[view.division],start=view.page*width*duration;
    const surfaceId=surface==='launchpad'?1:0;
    const query=`gview ${surfaceId} ${start} ${duration} `+Array.from({length:8},(_,index)=>index<height?(rows[watchedTrack()][view.lane+index]??65535):65535).join(' ');
    const signature=watchedTrack()+':'+query;if(queries.get(surface)!==signature){queries.set(surface,signature);seqCmd(query);}
    return Array.from({length:height*width},(_,index)=>{
        const row=Math.floor(index/width),tick=start+(index%width)*duration;
        const assignment=rows[watchedTrack()][view.lane+row];
        if(assignment===undefined||tick<seqState.loopStart*24||tick>=(seqState.loopStart+Math.max(16,seqState.lenSteps))*24)return C_BLACK;
        const present=eventTrack===watchedTrack()&&events[surfaceId].some(event=>event.assignment===assignment&&(assignment<128?event.tick>=tick&&event.tick<tick+duration:event.tick<tick+duration&&event.tick+event.duration>tick));
        const playhead=seqState.playing&&seqState.posTick>=tick&&seqState.posTick<tick+duration;
        return present?(playhead?C_WHITE:trackColor(watchedTrack())):playhead?C_DARKGREY:C_BLACK;
    });
}
export function gridPad(surface:string,index:number,down:boolean,velocity:number,height=4,width=8,focus=false):boolean {
    const key=surface+':'+index;
    if(!down){
        const owner=held.get(key);if(!owner)return gridActive();held.delete(key);
        if(!gridActive()||owner.track!==watchedTrack())return true;
        if(owner.focus||Date.now()-owner.at>=350){focusRow(owner.assignment,owner.tick,owner.duration);return true;}
        undoableEdit('GRID EVENT',trackLabel(owner.track),()=>seqCmd(`gtog ${owner.track} ${owner.tick} ${owner.duration} ${owner.assignment} ${owner.velocity}`));
        return true;
    }
    if(!gridActive())return false;
    const view=gridWindow(surface,width),row=Math.floor(index/width),assignment=rows[watchedTrack()][view.lane+row];
    if(index<0||row>=height||assignment===undefined)return true;
    held.set(key,{track:watchedTrack(),assignment,tick:(view.page*width+index%width)*divisions[view.division],duration:divisions[view.division],velocity:Math.max(1,velocity),at:Date.now(),focus});return true;
}
export function gridNavigate(surface:string,horizontal:number,vertical:number,height=4,width=8):void {
    const view=gridWindow(surface,width);
    if(horizontal){view.follow=false;view.page=Math.max(0,Math.min(Math.ceil((seqState.loopStart+Math.max(16,seqState.lenSteps))*24/(width*divisions[view.division]))-1,view.page+horizontal));}
    if(vertical)view.lane=Math.max(0,Math.min(32-height,view.lane+vertical));
    appState.dirty=true;
}
function focusRow(assignment:number,tick:number,duration:number):void {
    clearNoteFocus();
    if(assignment<128){
        noteFocus={track:watchedTrack(),previousLane:seqState.watchLane};
        seqState.watchLane=assignment;seqCmd('wlane '+assignment);
        editRangeDown(1000,Math.floor(tick/24),Math.floor((tick+duration-1)/24));
        beginStepAutomation();setStepPageSelected(true);appState.dirty=true;return;
    }
    overview=false;const page=gridPage();
    if(assignment>=128){
        page.performanceSet('motion_lane',String(assignment-127));
        const index=page.ctl.pages?.findIndex((entry:any)=>entry.keys?.includes('motion_operation'))??-1;
        if(index>=0)page.goToPage(index);page.reload(true);
    }
    appState.dirty=true;
}
const enumeration=(key:string,name:string,options:string[])=>({key,name,short_name:name,type:'enum',options,options_as_string:true,default:options[0]});
const parameters=[...Array.from({length:4},(_,index)=>enumeration('grid_row_'+index,'Row '+(index+1),names)),enumeration('grid_div','Grid',divisionNames),enumeration('grid_page','Page',Array.from({length:256},(_,index)=>String(index+1))),enumeration('grid_bank','Lanes',Array.from({length:29},(_,index)=>String(index+1)+'-'+String(index+4))),enumeration('grid_follow','Follow',['Off','On'])];
function gridGet(key:string):string|null {
    const view=gridWindow('move');
    if(key.startsWith('grid_row_'))return names[rows[watchedTrack()][view.lane+Number(key.slice(9))]];
    if(key==='grid_div')return divisionNames[view.division];
    if(key==='grid_page')return String(view.page+1);
    if(key==='grid_bank')return String(view.lane+1)+'-'+String(view.lane+4);
    if(key==='grid_follow')return view.follow?'On':'Off';return null;
}
function gridSet(key:string,value:string):void {
    const view=gridWindow('move');
    if(key.startsWith('grid_row_')){const assignment=names.indexOf(value);if(assignment>=0)rows[watchedTrack()][view.lane+Number(key.slice(9))]=assignment;markUiStateDirty();}
    if(key==='grid_div'){const division=divisionNames.indexOf(value);if(division>=0){view.division=division;view.page=0;}}
    if(key==='grid_page'){view.follow=false;view.page=Math.max(0,Math.min(255,Number(value)-1));}
    if(key==='grid_bank')view.lane=Math.max(0,Math.min(28,Number(value.split('-')[0])-1));
    if(key==='grid_follow')view.follow=value==='On';appState.dirty=true;
}
export function gridPage():SchwungPage {
    const track=watchedTrack();let page=pages.get(track);if(page)return followPanel(page);
    const native=portFor(track);
    const getParam=(key:string):string|null=>{
        const bare=key.replace(/:(base|modulated)$/,'').split(':').pop()??'';
        if(bare.startsWith('grid_'))return key.endsWith(':modulated')?'0':gridGet(bare);
        const value=native.getParam(key);
        if(key.endsWith(':chain_params')&&value){try{return JSON.stringify([...JSON.parse(value),...parameters]);}catch(_){}}
        return value;
    };
    const setParam=(key:string,value:string):boolean=>{const bare=key.split(':').pop()??'';if(bare.startsWith('grid_')){gridSet(bare,value);return true;}return native.setParam(key,value);};
    const port:TrackPort={...native,getParam,setParam,getMany:keys=>{const remote=keys.filter(key=>!key.includes(':grid_'));const values=native.getMany(remote);let index=0;return keys.map(key=>key.includes(':grid_')?getParam(key):values[index++]??null);},setMany:pairs=>{const local=pairs.filter(([key])=>key.includes(':grid_')),remote=pairs.filter(([key])=>!key.includes(':grid_'));return local.every(([key,value])=>setParam(key,value))&&(!remote.length||native.setMany(remote));},setParamTimeout:(key,value,_timeout)=>setParam(key,value)};
    page=createSchwungPage(port,'midi_fx1',{harmonyMode:3,hierarchy:hierarchy=>{
        const levels=hierarchy.levels;
        const controls=parameters.slice(4),assignments=parameters.slice(0,4);
        const links=['grid_rows','motion_operation','motion_timing','motion_conditions'].filter(key=>key==='grid_rows'||levels[key]).map(level=>({level}));
        levels.root={name:'Grid Window',knobs:controls.map(parameter=>parameter.key),params:[...controls,...links]};
        levels.grid_rows={name:'Row Assignments',knobs:assignments.map(parameter=>parameter.key),params:assignments};
        const retained=new Set<string>();
        const retain=(key:string):void=>{if(retained.has(key)||!levels[key])return;retained.add(key);for(const item of levels[key].params??[])if(item.level)retain(item.level);};
        retain('root');for(const key of Object.keys(levels))if(!retained.has(key))delete levels[key];return hierarchy;
    }});pages.set(track,page);return followPanel(page);
}
export function gridMidi(data:number[]):boolean {
    const type=data[0]&240,key=data[1],value=data[2],down=type===144&&value>0;
    if((type===128||type===144)&&key<8&&!down&&touched.has(key)){touched.get(key)!.knobTouch(key,false);touched.delete(key);return true;}
    if(!gridActive())return false;
    if(noteFocus&&noteFocus.track!==watchedTrack())clearNoteFocus();
    if(noteFocus&&type===176&&key===51){if(value)clearNoteFocus();appState.dirty=true;return true;}
    if(noteFocus&&type===176&&key>=71&&key<=78){editStepPageKnob(key-71,value<64?value:value-128);appState.dirty=true;return true;}
    if(noteFocus&&(type===128||type===144)&&key<8){setStepTouchedKnob(down?key:-1);appState.dirty=true;return true;}
    if((type===128||type===144)&&key>=68&&key<100)return gridPad('move',key-68,down,value,4,8,appState.shiftHeld);
    if(type===160&&key>=68&&key<100)return true;
    if(type===176&&[62,63,54,55].includes(key)){if(value)gridNavigate('move',key===62?-1:key===63?1:0,key===54?-1:key===55?1:0);return true;}
    if(type===176&&key===14){
        const delta=value<64?value:value-128;
        if(overview){if(delta>0){overview=false;gridPage().goToPage(Math.min(gridPage().pageCount-1,delta-1));}}
        else{const page=gridPage();if(page.pageIndex+delta<0)overview=true;else page.changePage(delta);}
        appState.dirty=true;return true;
    }
    if(overview&&type===176&&key===51){if(value)returnPreviousInputView();return true;}
    if(overview){if(type===176&&key===MoveMainButton&&value){overview=false;gridPage().goToPage(0);appState.dirty=true;}return (type===176&&[51,MoveMainButton,71,72,73,74,75,76,77,78].includes(key))||((type===128||type===144)&&key<8);}
    const page=gridPage();
    if(type===176&&key>=71&&key<=78){page.knobTurn(key-71,value<64?value:value-128);appState.dirty=true;return true;}
    if((type===128||type===144)&&key<8){if(down)touched.set(key,page);page.knobTouch(key,down);appState.dirty=true;return true;}
    if(type===176&&key===14){page.changePage(value<64?value:value-128);appState.dirty=true;return true;}
    if(type===176&&key===MoveMainButton){if(value)page.click(appState.shiftHeld);appState.dirty=true;return true;}
    if(type===176&&key===51){if(value&&page.back()?.action==='exit'){overview=true;appState.dirty=true;}return true;}
    return false;
}
export function paintGrid(force=false):boolean {
    if(force)lastPaint.fill(-1);
    const colors=gridColors('move',4,8);
    const changes=colors.flatMap((color,index)=>color===lastPaint[index]?[]:[{index,note:68+index,color}]);
    for(const change of sendPadLedFrame(changes))lastPaint[change.index]=change.color;
    return colors.every((value,index)=>lastPaint[index]===value);
}
export function renderGrid():void {
    if(noteFocus&&noteFocus.track!==watchedTrack())clearNoteFocus();
    if(noteFocus){renderKnobsView(buildStepPageVM(seqState),false,watchedTrack());return;}
    if(overview){renderOverview();for(let slot=0;slot<8;slot++){cachedSetAnimLED(slot,0,0,0);cachedSetAnimLED(71+slot,0,0,0,true);}return;}
    const page=gridPage();clear_screen();drawHeader(page.pageTitle,gridWindowLabel());drawBankBar(page.pageIndex+1,page.pageCount+1);page.render(gridWindowLabel()+' '+divisionNames[gridWindow('move').division]);
    for(let slot=0;slot<8;slot++)if(!(page.knobLEDMask&(1<<slot))){const color=page.keyAt(slot)?trackColor(watchedTrack()):0;cachedSetAnimLED(slot,color,color,0);cachedSetAnimLED(71+slot,color,color,0,true);}
}

export function gridTick():void {const active=gridActive();if(active!==wasActive){lastPaint.fill(-1);wasActive=active;}if(active){
    const view=gridWindow('move'),signature=[watchedTrack(),view.page,view.lane,view.division,seqState.playing,Math.floor(seqState.posTick/divisions[view.division])].join(':');
    if(signature!==lastWindow){lastWindow=signature;appState.dirty=true;}
    gridTouchPage()?.tick();
}}

export function gridSurfaceControl(surface:string,control:number):void {
    const view=gridWindow(surface);
    if(control===4)view.follow=!view.follow;
    if(control===5){view.division=(view.division+1)%divisions.length;view.page=0;}
    appState.dirty=true;
}

/** A read-only overview: rows are the current pad window; N/O strips span the loop. */
function renderOverview():void {
    const view=gridWindow('move'),span=divisions[view.division]*8,start=view.page*span;
    clear_screen();drawHeader('T'+(watchedTrack()+1)+' '+divisionNames[view.division],gridWindowLabel());
    gridColors('move',4,8);
    for(let row=0;row<4;row++){
        const assignment=rows[watchedTrack()][view.lane+row];
        fontPrint(1,12+row*6,assignment<128?names[assignment]:'Op'+(assignment-127),1);
        for(let column=0;column<8;column++){
            const x=30+column*12,y=12+row*6;
            const tick=start+column*divisions[view.division];
            const present=eventTrack===watchedTrack()&&events[0].some(event=>event.assignment===assignment&&event.tick<tick+divisions[view.division]&&event.tick+event.duration>tick);
            fill_rect(x,y+4,10,1,1);if(present)fill_rect(x,y,10,4,1);
            if(seqState.playing&&seqState.posTick>=tick&&seqState.posTick<tick+divisions[view.division])fill_rect(x+4,y,2,5,present?0:1);
        }
    }
    const loopStart=seqState.loopStart*24,length=Math.max(16,seqState.lenSteps)*24;
    const position=(tick:number):number=>30+Math.round(Math.max(0,Math.min(1,(tick-loopStart)/length))*95);
    fontPrint(1,40,'N'+gridHiddenDirections(false),1);fontPrint(1,47,'Op'+gridHiddenDirections(true),1);
    if(eventTrack===watchedTrack())for(let index=0;index<64;index++){
        const x=30+Math.floor(index*96/64),width=Math.ceil(96/64);
        if(timeline[index]&1)fill_rect(x,40,width,4,1);
        if(timeline[index]&2)fill_rect(x,47,width,4,1);
    }
    for(let tick=loopStart;tick<=loopStart+length;tick+=384)fill_rect(position(tick),37,1,2,1);
    const left=position(start),right=position(start+span);
    fill_rect(left,54,Math.max(1,right-left+1),1,1);fill_rect(left,52,1,3,1);fill_rect(right,52,1,3,1);
    if(seqState.playing)fill_rect(position(seqState.posTick),39,1,13,1);
    fontPrint(1,58,'Clip '+(length/384)+' bars / Jog: settings',1);
}

/** Directions refer to row-bank scrolling, even with custom row assignments. */
export function gridHiddenDirections(operations:boolean):string {
    if(eventTrack!==watchedTrack())return '';
    const view=gridWindow('move'),assignments=rows[watchedTrack()];
    const visible=new Set(assignments.slice(view.lane,view.lane+4));
    let above=false,below=false,unassigned=false;
    for(let assignment=operations?128:0;assignment<(operations?144:128);assignment++){
        if(!occupied[assignment]||visible.has(assignment))continue;
        const indices=assignments.flatMap((value,index)=>value===assignment?[index]:[]);
        if(!indices.length)unassigned=true;
        above ||= indices.some(index=>index<view.lane);
        below ||= indices.some(index=>index>=view.lane+4);
    }
    return (above?'^':'')+(below?'v':'')+(unassigned?'!':'');
}
