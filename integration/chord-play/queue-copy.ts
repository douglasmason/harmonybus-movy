/** Copy a native abstract progression without disturbing its live performance. */
import {appState} from '../app/state.js';
import {engineGeneration,engineReady,seqCmd,seqCmdFlush,requestLabelSync} from './engine.js';
import {currentSetUuid} from './set-session.js';
import {sessionPlayMode} from './router-buttons.js';
import {seqState} from './state.js';
import {seqToast} from './render.js';
import {undoableEdit} from '../undo/edit.js';
import {fontPrint} from '../font/index.js';
import {drawHeader} from '../renderer/header.js';
import {cachedSetAnimLED,invalidateInputModeLeds} from './led-cache.js';
import {C_GREEN,C_DARKGREY,trackColorDim} from './colors.js';

interface Review {handoff:boolean;track:number;focus:number;mode:number;token:string;count:number;ticks:number;empty:number;slot:number;generation:number;set:string|null;}
let review:Review|null=null;
const ownedReleases=new Set<string>();
const get=(key:string):string=>String(host_module_get_param(key)??'');
function valid(pending:Review):boolean {
    return engineReady()&&pending.generation===engineGeneration()&&pending.set===currentSetUuid()
        &&pending.mode===sessionPlayMode()&&pending.focus===appState.activeTrack.index
        &&!seqState.recording&&!seqState.countingIn;
}
export function cancelQueueCopy():void {if(review){review=null;invalidateInputModeLeds();appState.dirty=true;}}
export function queueCopyActive():boolean {
    if(review&&!valid(review))cancelQueueCopy();
    return review!==null;
}
export function openQueueCopy(track:number):void {
    cancelQueueCopy();
    if(!engineReady()||seqState.recording||seqState.countingIn){seqToast('Finish recording first');return;}
    seqCmdFlush();
    const raw=get('chord_copy_info_'+track);
    if(raw.startsWith('error:')){seqToast(raw.slice(6));return;}
    const fields=raw.split('|'),count=Number(fields[2]),ticks=Number(fields[3]),empty=Number(fields[4]);
    if(fields.length!==5||fields[0]!=='qc1'||!/^[0-9a-f]{16}$/.test(fields[1])||!Number.isInteger(count)||count<1||count>512
        ||!Number.isInteger(ticks)||ticks<24||ticks>6144||ticks%24||!Number.isInteger(empty)||empty<0||empty>255){seqToast('Queue copy unavailable');return;}
    const slot=Array.from({length:8},(_,index)=>index).find(index=>empty&(1<<index));
    if(slot===undefined){seqToast('No empty conductor clip');return;}
    review={handoff:false,track,focus:appState.activeTrack.index,mode:sessionPlayMode(),token:fields[1],count,ticks,empty,slot,
        generation:engineGeneration(),set:currentSetUuid()};
    invalidateInputModeLeds();appState.dirty=true;
}
function commit(slot:number):void {
    const pending=review;
    if(!pending||!valid(pending)){cancelQueueCopy();return;}
    if(!(pending.empty&(1<<slot))){seqToast('Choose an empty clip');return;}
    cancelQueueCopy();
    undoableEdit(pending.handoff?'COPY + HANDOFF':'COPY QUEUE',`T${pending.track+1} CLIP ${slot+1}`,()=>{
        seqCmd(`${pending.handoff?'qhandoff':'qcopy'} ${pending.track} ${slot} ${pending.token}`);seqCmdFlush();
        const result=get('chord_copy_result');
        seqToast(result.startsWith('Copied')?(pending.handoff?'Saved; handoff at cycle start':`Copied to T${pending.track+1} Clip ${slot+1}`):result.replace(/^error:/,'')||'Queue copy failed');
    });
    seqCmdFlush();requestLabelSync();appState.dirty=true;
}
/** Matching releases stay owned after confirmation/cancellation and view changes. */
export function queueCopyMidi(data:number[]):boolean {
    const status=data[0]&240,key=data[1],down=status===144?data[2]>0:status===176&&data[2]>0;
    const identity=(status===128||status===144?'n':'c')+key;
    if(!down&&ownedReleases.delete(identity))return true;
    if(!queueCopyActive())return false;
    const pending=review!;
    if((status===144||status===128)&&key>=16&&key<32){
        if(down){ownedReleases.add(identity);if(key<24)commit(key-16);else if(key===24){if(!seqState.playing){seqToast('Play first for handoff');return true;}pending.handoff=!pending.handoff;appState.dirty=true;}}
        return true;
    }
    if(status===176){
        if(key===14){pending.slot=Math.max(0,Math.min(7,pending.slot+(data[2]<64?data[2]:data[2]-128)));appState.dirty=true;return true;}
        if(key===3||key===51||key===60){
            if(down){ownedReleases.add(identity);if(key===3)commit(pending.slot);else cancelQueueCopy();}
            // Initial Copy-up still belongs to the mode button dispatcher.
            return key!==60||down;
        }
        if(down)cancelQueueCopy(); // Transport, mode, Undo and printed buttons keep their owners.
        return false;
    }
    if((status===144||status===128)&&key<16&&down)cancelQueueCopy();
    return false; // Live melody pads and their releases remain playable.
}
export function paintQueueCopySteps():boolean {
    if(!queueCopyActive())return false;
    const pending=review!;
    for(let index=0;index<16;index++){
        const color=index===8?(pending.handoff?C_GREEN:C_DARKGREY):index>8?0:index===pending.slot?C_GREEN:pending.empty&(1<<index)?C_DARKGREY:trackColorDim(pending.track);
        cachedSetAnimLED(16+index,color,color,0);
    }
    return true;
}
export function renderQueueCopy():boolean {
    if(!queueCopyActive())return false;
    const pending=review!;
    clear_screen();drawHeader(pending.handoff?'Copy + handoff':'Copy queue',`T${pending.track+1}`);
    fontPrint(1,14,`${pending.count} chords / ${pending.ticks/96} beats`,1);
    fontPrint(1,25,`Clip ${pending.slot+1}: ${pending.empty&(1<<pending.slot)?'Empty':'Occupied'}`,1);
    fontPrint(1,36,'Steps 1-8 / Jog: confirm',1);
    fontPrint(1,46,pending.handoff?'9: Handoff at cycle start':'9: Save only (queue live)',1);
    fontPrint(1,56,'Back / Copy: cancel',1);
    return true;
}
