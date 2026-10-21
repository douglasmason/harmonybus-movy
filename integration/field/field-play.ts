import { fontPrint } from '../font/index.js';
import { outputs, latchMode, cancelOutputLane, type OutputFinish, outputView, vertical, outputBank, outputLane, outputSnapshot, outputLabels, outputPad, outputPressure, outputKnob, releaseOutputs, outputFrame, outputHeld, outputDirty, outputSent, outputColors } from './field-outputs.js';
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
let rate=1,zoom=1,outputSendAt=-Infinity,outputReadAt=-Infinity,settingsOpen=false;
let pendingFinishes:OutputFinish[]=[];
const pendingClears=new Set<number>();
const held=new Map<string,{rate:number;zoom:number}>();
const rates=[-400,-200,-100,0,100,150,200,400];
export function fieldActive():boolean{return enabled&&!seqState.sessionMode;}
export function fieldEnabled():boolean{return enabled;}
export function releaseField():void{
    pendingFinishes=[];releaseOutputs();sendOutputs();held.clear();if(owner>=0)portFor(owner).setParam('midi_fx1:field_release','1');lastSend=-Infinity;
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
export function fieldPad(source:string,index:number,down:boolean,width=8,height=4,clear=appState.shiftHeld):boolean{
    if(!['move','launchpad','remote'].includes(source)||!fieldActive()||!engineReady()||!Number.isInteger(index)||index<0||index>=width*height||width!==8||![4,8].includes(height))return false;
    if(outputView){if(clear&&down)clearFieldOutput(outputLane(vertical?index%8:Math.floor(index/8)));else finishOutput(outputPad(source,index,down,height));sendOutputs();appState.dirty=true;return true;}
    const key=source+':'+index;
    if(down){held.delete(key);held.set(key,{rate:rates[index%8],zoom:Math.round(25*Math.pow(16,Math.floor(index/8)/(height-1)))});}
    else held.delete(key);
    sendGesture();appState.dirty=true;return true;
}
export function fieldPressure(source:string,index:number,pressure:number):void{
    if(fieldActive()&&outputView){outputPressure(source,index,pressure);appState.dirty=true;}
}
function finishOutput(finish:OutputFinish|undefined):void{
    if(finish&&owner>=0){pendingFinishes=pendingFinishes.filter(entry=>entry.lane!==finish.lane);pendingFinishes.push(finish);}
}
/** Explicit clear is shared with remote/Launchpad; ordinary cancellation isn't. */
export function clearFieldOutput(lane=16):void{
    if(owner<0)return;
    pendingFinishes=pendingFinishes.filter(entry=>lane!==16&&entry.lane!==lane);
    if(lane===16)releaseOutputs();else cancelOutputLane(lane);
    if(lane===16)pendingClears.clear();pendingClears.add(lane);sendOutputs();appState.dirty=true;
}
function sendOutputs(now=Date.now()):void{
    if(owner<0)return;
    outputSendAt=now;
    for(const lane of pendingClears){if(portFor(owner).setParam('midi_fx1:field_output_clear',String(lane))===false)return;pendingClears.delete(lane);}
    while(pendingFinishes.length){const finish=pendingFinishes[0];if(portFor(owner).setParam('midi_fx1:field_output_finish',`0,${finish.lane},${finish.value}`)===false)return;pendingFinishes.shift();}
    if(portFor(owner).setParam('midi_fx1:field_outputs',outputFrame())!==false){outputSendAt=now;outputSent();}
}
export function releaseFieldSource(source:string):void{
    pendingFinishes=[];releaseOutputs(source);sendOutputs();
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
    if(setId!==nextSet){releaseField();if(owner>=0)clearFieldOutput();setId=nextSet;page=null;lastRead=-Infinity;}
    if(pendingClears.size&&now-outputSendAt>=33)sendOutputs(now);
    if(!fieldActive()){if(held.size||outputHeld())releaseField();return;}
    if(owner!==appState.activeTrack.index){releaseField();owner=appState.activeTrack.index;page=null;}
    if(held.size&&now-lastSend>=400)sendGesture(now);
    fieldPage().tick();
    if((outputDirty()&&now-outputSendAt>=33)||(outputHeld()&&now-outputSendAt>=400))sendOutputs(now);
    if(now-outputReadAt>=125){
        outputReadAt=now;
        const previous=outputView;
        const labels=portFor(owner).getParam('midi_fx1:field_output_labels');
        if(labels)outputLabels(labels);
        const snapshot=portFor(owner).getParam('midi_fx1:field_outputs_view2');
        if(snapshot&&outputSnapshot(snapshot)){if(previous!==outputView){settingsOpen=false;held.clear();sendGesture();}appState.dirty=true;}
    }
    if(outputView)return;
    if(now-lastRead<125)return;lastRead=now;
    const text=portFor(owner).getParam('midi_fx1:field_view');
    if(text?.startsWith('nf1,')){
        const values=text.split(',').slice(1).map(Number);
        if(values.length===66&&values.every(Number.isFinite)){[rate,zoom]=values;samples=values.slice(2);appState.dirty=true;}
    }
}
export function fieldColors(source:string,width=8,height=4):number[]{
    if(outputView)return outputColors(source,height);
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
    if(outputView&&!settingsOpen){
        clear_screen();drawHeader('Field Outputs',latchMode?'Latch':'Momentary');
        const count=vertical?8:4;
        for(let strip=0;strip<count;strip++){
            const lane=outputLane(strip),output=outputs[lane],column=strip>=4?64:0,row=strip%4;
            fontPrint(column+2,14+row*10,`${lane+1}${output.latched?'L':''} ${output.label??Math.round(output.value*100)+'%'}`,1);
            if(!output.label)fill_rect(column+36,17+row*10,Math.round(output.value*25),2,1);
        }
        fontPrint(2,56,'Shift pad/back: clear',1);return;
    }
    clear_screen();const panel=fieldPage();drawHeader('Field Play',`${rate.toFixed(1)}x / ${zoom.toFixed(1)}x`);drawBankBar(panel.pageIndex,panel.pageCount);panel.render('Pads: speed / size');
}
export function fieldMidi(data:number[]):boolean{
    if(!fieldActive())return false;
    const [status,key,value]=data,type=status&240;
    if([128,144,160].includes(type)&&key>=68&&key<100){if(type===160)fieldPressure('move',key-68,value);else fieldPad('move',key-68,type===144&&value>0);return true;}
    if(type===176&&key===51&&appState.shiftHeld){if(value)clearFieldOutput();return true;}
    if(outputView&&!settingsOpen){
        if(type===176&&key>=71&&key<=78){outputKnob(key-71,true,(value<64?value:value-128)*(appState.shiftHeld?.1:1));sendOutputs();appState.dirty=true;return true;}
        if((type===144||type===128)&&key<8){finishOutput(outputKnob(key,type===144&&value>0));sendOutputs();appState.dirty=true;return true;}
        if(type===176&&key===14){releaseOutputs();sendOutputs();portFor(owner).setParam('midi_fx1:field_bank',String((outputBank+(value<64?1:3))%4));return true;}
    }
    if(type===176&&key===MoveMainButton&&value&&outputView&&(!settingsOpen||appState.shiftHeld)){releaseOutputs('knob');sendOutputs();settingsOpen=!settingsOpen;appState.dirty=true;return true;}
    if(type===176&&key>=71&&key<=78){fieldPage().knobTurn(key-71,value<64?value:value-128);appState.dirty=true;return true;}
    if((type===144||type===128)&&key<8){fieldPage().knobTouch(key,type===144&&value>0);return true;}
    if(type===176&&key===14){fieldPage().changePage(value<64?value:value-128);appState.dirty=true;return true;}
    if(type===176&&key===MoveMainButton){if(value)fieldPage().click(appState.shiftHeld);appState.dirty=true;return true;}
    if(type===176&&key===51){if(value&&fieldPage().back()?.action==='exit')setFieldEnabled(false);return true;}
    return false;
}
/** Remote UI uses the same event contract. Polling this snapshot is read-only. */
export function fieldSnapshot(){return {active:fieldActive(),rate,scale:zoom,values:[...samples],view:outputView?'outputs':'terrain',orientation:vertical?'vertical':'horizontal',bank:outputBank,override:latchMode?'latch':'momentary',outputs:outputs.map(output=>({...output}))};}
