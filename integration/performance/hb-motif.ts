import { seqState } from '../seq/state.js';
import { seqToast } from '../seq/render.js';
import { motifSplash, motifFeedbackColor, clearMotifSplash } from './motif-feedback.js';
/* The normal step-recorder gestures, with a motif destination instead of a
   song clip. Ownership survives page navigation; changing track closes safely. */
import { appState } from '../app/state.js';
import { markUiStateDirty } from '../seq/ui-dirty.js';
import { setStepRecTarget } from '../seq/step-rec-target.js';
import { cachedSetAnimLED, seqLedsInvalidate } from '../seq/led-cache.js';
import { C_BLACK, C_DARKGREY, C_WHITE, TRACK_COLOR, ANIM_NONE, ANIM_PULSE_SLOW } from '../seq/colors.js';
import { fontPrint } from '../font/index.js';
import type { PerformancePort } from './hb-performance.js';

interface MotifPort extends PerformancePort { readonly ctl?: any; }
let owner: MotifPort | null = null;
let row: number[] = [];
let sampledAt = -Infinity;
let pageOffset = 0;
let status = '';
let viewOwner: MotifPort | null = null;
let viewAt = -Infinity;
let viewRow: number[] = [];
let viewStatus = '';
const seenFlash=new Map<number,number>();
function acceptFlash(port: MotifPort,values: number[]): void {
    const track=port.performanceTrack;if(track===undefined||values.length!==41)return;
    const serial=values[38],previous=seenFlash.get(track);seenFlash.set(track,serial);
    if(previous!==undefined&&serial!==previous)motifSplash(track,values[39],values[40]);
}
const slotReleases = new Set<number>();
function sample(force = false): void {
    if (!owner) return;
    if (!force && Date.now() - sampledAt < 60) return;
    const next = owner.performanceGet('motif_row').split(',').map(Number);
    if (next.length === 41 && next.every(Number.isFinite)) row = next;
    acceptFlash(owner,row);
    status = owner.performanceGet('motif_status');sampledAt = Date.now();
    if (row.length) pageOffset = Math.min(1, Math.floor(row[2] / 16));
}
function write(key: string, value: string): void {
    if (!owner) return;
    owner.performanceSet(key,value);sampledAt = -Infinity;sample(true);
    seqLedsInvalidate();appState.dirty = true;
}
export function motifEditing(): boolean { return owner !== null; }
function detachMotif(): void {
    owner = null;row = [];setStepRecTarget(null);markUiStateDirty();seqLedsInvalidate();appState.dirty = true;
}
export function motifFinish(cancel = false): void {
    if (!owner) return;
    write(cancel ? 'motif_cancel' : 'motif_record', cancel ? 'Cancel' : 'Done');
    // A library capacity error leaves the draft open for correction.
    if (!cancel && row[0] >= 0) return;
    detachMotif();
}
export function motifAction(port: MotifPort, key: string): boolean {
    if(key==='motif_copy'){
        if(owner||seqState.recording||seqState.countingIn||seqState.stepAutoMode){seqToast('Finish recording/edit');return true;}
        port.performanceSet('motif_copy','Copy to Slot');
        const draft=port.performanceGet('motif_row').split(',').map(Number);
        if(draft[0]>=0)return motifAction(port,'motif_record');
        return true;
    }
    if (key === 'motif_record') {
        if (owner) { motifFinish();return true; }
        if(seqState.recording||seqState.countingIn||seqState.stepAutoMode){seqToast('Finish clip recording/edit');return true;}
        owner=port;row=[];sampledAt=-Infinity;sample(true);
        if(row[0]<0)write('motif_record','Edit'); // Resume a retained capacity-error draft.
        if (row[0] < 0) {owner=null;return true;}
        setStepRecTarget({
            head: () => {sample();return row[2] ?? 0;},
            header: () => {sample();return status;},
            canGoLeft: () => (row[2] ?? 0)>0,
            pad: () => { sampledAt=-Infinity;return true; },
            release: () => {sampledAt=-Infinity;return true;},
            arrow: (direction: number) => {write('motif_arrow',String(direction));return true;},
            step: (button: number) => {write('motif_step',String(pageOffset*16+button+1));return true;},
            end: () => motifFinish(),
            reset: () => motifFinish(true),
        });
        return true;
    }
    if (key === 'motif_anchor' || key === 'motif_undo' || key === 'motif_cancel') {
        if (owner) {if(key==='motif_cancel')motifFinish(true);else write(key,'On');}
        return true;
    }
    if (key === 'motif_arm' || key === 'motif_slot') {
        if (!owner) port.performanceSet('motif_arm',port.performanceGet('motif_slot'));
        appState.dirty=true;return true;
    }
    return false;
}
export function motifPage(port: MotifPort | null): boolean {
    return !!port?.ctl?.page?.keys?.some((key: string)=>key==='motif_slot'||key==='motif_preset');
}
export function motifStep(data: number[], port: MotifPort | null): boolean {
    const kind=data[0]&0xf0,step=data[1]-16;
    if(step<0||step>=16||(kind!==0x80&&kind!==0x90))return false;
    const down=kind===0x90&&data[2]>0;
    if(!down&&slotReleases.delete(step))return true;
    if(owner)return false; // Normal step-rec routing owns editing gestures.
    if(!motifPage(port)||!port)return false;
    if(down){port.performanceSet('motif_slot',String(step+1));port.performanceSet('motif_arm',String(step+1));slotReleases.add(step);markUiStateDirty();appState.dirty=true;}
    return true;
}
export function paintMotif(port: MotifPort | null): boolean {
    if(owner){
        if(owner.performanceTrack!==appState.activeTrack.index){
            motifFinish();
            if(owner){seqToast('Motif draft retained on previous track');detachMotif();}
            return false;
        }
        sample();const cursor=row[2]??0,anchor=row[5]??-1;
        for(let button=0;button<16;button++){
            const step=pageOffset*16+button,kind=row[6+step]??0;
            const color=step===anchor?13:kind===1?TRACK_COLOR[appState.activeTrack.index]:kind===2?22:kind===3?C_DARKGREY:kind===4?25:C_BLACK;
            // Hardware smooth pulse with a dim white peak; anchor retains cyan.
            cachedSetAnimLED(16+button,motifFeedbackColor(color,appState.activeTrack.index,step,'step'),118,step===cursor?ANIM_PULSE_SLOW:ANIM_NONE);
        }
        return true;
    }
    if(!motifPage(port)||!port){viewRow=[];viewStatus='';return false;}
    if(viewOwner!==port||Date.now()-viewAt>=60){viewOwner=port;viewAt=Date.now();viewRow=port.performanceGet('motif_row').split(',').map(Number);acceptFlash(port,viewRow);
        const nextStatus=viewRow[0]===-2?port.performanceGet('motif_status'):'';
        if(nextStatus!==viewStatus){viewStatus=nextStatus;appState.dirty=true;}}
    const values=viewRow;
    if(values[0]===-2){
        const cursor=values[2],anchor=values[5],offset=Math.min(1,Math.floor(cursor/16))*16;
        for(let button=0;button<16;button++){
            const step=offset+button,kind=values[6+step];
            const color=step===anchor?13:kind===4?25:kind===3?C_DARKGREY:kind?22:C_BLACK;
            cachedSetAnimLED(16+button,color,118,step===cursor?ANIM_PULSE_SLOW:ANIM_NONE);
        }
        return true;
    }
    const occupied=values[4]??0,armed=values[3]??-1,selected=values[1]??0;
    for(let step=0;step<16;step++){
        const color=armed===step?13:selected===step?TRACK_COLOR[appState.activeTrack.index]:(occupied&(1<<step))?85:C_BLACK;
        cachedSetAnimLED(16+step,color,color,ANIM_NONE);
    }
    return true;
}
export function drawMotif(): boolean {
    if(!owner){
        if(viewRow[0]!==-2||viewOwner?.performanceTrack!==appState.activeTrack.index)return false;
        fill_rect(0,0,128,8,1);fontPrint(1,1,viewStatus,0);return true;
    }
    sample();fill_rect(0,0,128,8,1);fontPrint(1,1,status,0);return true;
}
export function resetMotif(): void { viewRow=[];viewStatus='';motifFinish(true);slotReleases.clear();seenFlash.clear();clearMotifSplash(); }
