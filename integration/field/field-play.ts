/** Field Play owns gestures and display only; noise and timing belong to HB DSP. */
import { appState } from '../app/state.js';
import { seqState } from './state.js';
import { engineReady, fieldEngineSet } from './engine.js';
import { portFor } from '../track/registry.js';
import { createSchwungPage, type SchwungPage } from '../renderer/schwung-page.js';
import { drawHeader, drawBankBar } from '../renderer/header.js';
import { sendPadLedFrame } from './led-cache.js';
import { currentSetUuid } from './set-session.js';
import { syncPadRoute } from '../track/pad-route.js';
import { releaseLaunchpad } from '../surfaces/launchpad.js';

let enabled=false, owner=-1, lastRead=-Infinity, lastSend=-Infinity, setId='';
let page:SchwungPage|null=null;
let samples:number[]=Array(64).fill(64), paint:number[]=Array(32).fill(-1);
let rate=1,zoom=1;
const held=new Map<string,{rate:number;zoom:number}>();
const rates=[-400,-200,-100,0,100,150,200,400];
export function fieldActive():boolean{return enabled&&!seqState.sessionMode;}
export function fieldEnabled():boolean{return enabled;}
export function releaseField():void{
    held.clear();if(owner>=0)portFor(owner).setParam('midi_fx1:field_release','1');lastSend=-Infinity;
}
export function setFieldEnabled(value:boolean):void{
    if(enabled===value)return;
    releaseField();releaseLaunchpad();enabled=value;owner=appState.activeTrack.index;page=null;paint.fill(-1);lastRead=-Infinity;
    // Immediately retire the native fast note map before another pad can arrive.
    if(engineReady()){syncPadRoute(fieldEngineSet);if(value){fieldEngineSet('joint_map','off');fieldEngineSet('joint_release','1');}}appState.dirty=true;
}
function fieldPage():SchwungPage{
    if(!page)page=createSchwungPage(portFor(owner),'midi_fx1',{hierarchy:hierarchy=>{
        if(hierarchy.levels.field)hierarchy.levels.root={...hierarchy.levels.field,name:'Field Play'};
        return hierarchy;
    }});
    return page;
}
/** Last-pressed wins; releasing it restores another held gesture or baseline. */
export function fieldPad(source:string,index:number,down:boolean,width=8,height=4):boolean{
    if(!['move','launchpad','remote'].includes(source)||!fieldActive()||!engineReady()||!Number.isInteger(index)||index<0||index>=width*height||width!==8||![4,8].includes(height))return false;
    const key=source+':'+index;
    if(down){held.delete(key);held.set(key,{rate:rates[index%8],zoom:Math.round(25*Math.pow(16,Math.floor(index/8)/(height-1)))});}
    else held.delete(key);
    sendGesture();appState.dirty=true;return true;
}
export function releaseFieldSource(source:string):void{
    for(const key of held.keys())if(key.startsWith(source+':'))held.delete(key);
    sendGesture();
}
function sendGesture(now=Date.now()):void{
    if(owner<0)return;
    const gestures=[...held.values()];const gesture=gestures[gestures.length-1];
    const accepted=portFor(owner).setParam(gesture?'midi_fx1:field_gesture':'midi_fx1:field_release',gesture?`${gesture.rate},${gesture.zoom}`:'1');
    if(accepted!==false)lastSend=now;
}
export function tickField(now=Date.now()):void{
    const nextSet=currentSetUuid();
    if(setId!==nextSet){releaseField();setId=nextSet;page=null;lastRead=-Infinity;}
    if(!fieldActive()){if(held.size)releaseField();return;}
    if(owner!==appState.activeTrack.index){releaseField();owner=appState.activeTrack.index;page=null;}
    if(held.size&&now-lastSend>=400)sendGesture(now);
    fieldPage().tick();
    if(now-lastRead<125)return;lastRead=now;
    const text=portFor(owner).getParam('midi_fx1:field_view');
    if(text?.startsWith('nf1,')){
        const values=text.split(',').slice(1).map(Number);
        if(values.length===66&&values.every(Number.isFinite)){[rate,zoom]=values;samples=values.slice(2);appState.dirty=true;}
    }
}
export function fieldColors(source:string,width=8,height=4):number[]{
    return Array.from({length:width*height},(_,index)=>{
        if(held.has(source+':'+index))return 127;
        const row=Math.round(Math.floor(index/width)*7/(height-1));
        const level=samples[row*8+index%width]??64;
        return [1,2,13,14,15][Math.min(4,Math.floor(level*5/128))];
    });
}
export function paintField():void{
    const colors=fieldColors('move');
    const changes=colors.flatMap((color,index)=>color===paint[index]?[]:[{note:68+index,color}]);
    for(const change of sendPadLedFrame(changes))paint[change.note-68]=change.color;
}
export function renderField():void{
    clear_screen();const panel=fieldPage();drawHeader('Field Play',`${rate.toFixed(1)}x / ${zoom.toFixed(1)}x`);drawBankBar(panel.pageIndex,panel.pageCount);panel.render('Pads: speed / size');
}
export function fieldMidi(data:number[]):boolean{
    if(!fieldActive())return false;
    const [status,key,value]=data,type=status&240;
    if([128,144,160].includes(type)&&key>=68&&key<100){if(type!==160)fieldPad('move',key-68,type===144&&value>0);return true;}
    if(type===176&&key>=71&&key<=78){fieldPage().knobTurn(key-71,value<64?value:value-128);appState.dirty=true;return true;}
    if((type===144||type===128)&&key<8){fieldPage().knobTouch(key,type===144&&value>0);return true;}
    if(type===176&&key===14){fieldPage().changePage(value<64?value:value-128);appState.dirty=true;return true;}
    if(type===176&&key===MoveMainButton){if(value)fieldPage().click(appState.shiftHeld);appState.dirty=true;return true;}
    if(type===176&&key===51){if(value&&fieldPage().back()?.action==='exit')setFieldEnabled(false);return true;}
    return false;
}
/** Remote UI uses the same event contract. Polling this snapshot is read-only. */
export function fieldSnapshot():{active:boolean;rate:number;scale:number;values:number[]}{return {active:fieldActive(),rate,scale:zoom,values:[...samples]};}
