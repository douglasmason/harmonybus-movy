/** Session's multi-track instrument. Tracks own sound and harmony; this module
 * owns only role allocation, gestures, geometry and cached preview requests. */
import { appState } from '../app/state.js';
import { keyboardState, baseNoteFor } from '../keyboard/state.js';
import { buildPadMap } from '../keyboard/layouts.js';
import { harmonyApproachColor, harmonyPadColor, harmonyPlaybackColor, parseHarmonySnapshot, pianoApproachIdentity, withSurfacePreview } from '../keyboard/harmony-pads.js';
import type { HarmonySnapshot } from '../keyboard/harmony-pads.js';
import { buildSurfaceCells, previewPayload } from '../surfaces/protocol.js';
import type { SurfaceCell } from '../surfaces/protocol.js';
import { portFor } from '../track/registry.js';
import { trackKind } from '../track/ref.js';
import { seqState } from './state.js';
import { markUiStateDirty } from './ui-dirty.js';
import { recToggle } from '../undo/rec-pass.js';
import { sendPadLedFrame, cachedSetAnimLED } from './led-cache.js';
import { jointPage, jointPanelTouch, resetJointPanels, releaseJointPanelTouches } from './joint-panels.js';
import { schwungLibAvailable } from '../renderer/schwung-lib.js';
import { drawHeader, drawBankBar } from '../renderer/header.js';
import { trackColor } from './colors.js';
import { currentSetUuid } from './set-session.js';

export type JointGroup = { bass: number; comp: number; lower: number; upper: number; steps: number; overwrite: number };
// Source 0 follows, 1 uses clips/motifs, 2 exposes pads. Layout: octaves/piano/approach.
const fresh = (): JointGroup => ({bass:0, comp:0, lower:0, upper:2, steps:2, overwrite:5});
let groups: JointGroup[] = Array.from({length:4}, fresh);
let enabled = false;
let belowHeld=false, belowLatch=false;
/** Actor identity is exactly the existing track palette, including native colors. */
export function jointActorColor(role:number):number {return trackColor(baseTrack()+role);}
let pushed = '', linked = '', geometry = '', previewAt = -Infinity, previewActor = 0;
let setId = '';
let pendingRelease = false;
const held = new Set<number>();
type Actor = {track:number; cells:SurfaceCell[]; view:HarmonySnapshot|null; payload:string};
let actors: Actor[] = [];
let cells: (SurfaceCell & {track:number})[] = [];
let colors: number[] = new Array(32).fill(-1);

export function jointActive(): boolean {return enabled && !seqState.sessionMode && jointAvailable();}
export function jointApproachRowsActive():boolean {return group().comp!==2&&group().upper===2;}
export function jointPadRoles(base = baseTrack()): number[] {return groups[base/4].bass===2?[0,1,3]:[0,3];}
export function jointStepMode(): number {return group().steps;}
export function jointEnabled(): boolean {return enabled;}
export function setJointEnabled(value: boolean): void {
    enabled = value; geometry = ''; appState.dirty = true;
    if (!value) { pendingRelease = true; held.clear(); releaseJointPanelTouches(); belowHeld=belowLatch=false; }
}
function group(): JointGroup {return groups[appState.focusGroup] ?? groups[0];}
function baseTrack(): number {return appState.focusGroup * 4;}
export function resetJointInput(): void {
    setJointEnabled(false); pushed = linked = ''; actors = []; cells = []; colors.fill(-1);
    resetJointPanels();
}
export function jointSnapshot(): JointGroup[] {return groups.map(value=>({...value}));}
export function restoreJoint(value: unknown): void {
    resetJointInput();
    groups = Array.from({length:4}, (_,index)=> {
        const entry = Array.isArray(value) ? value[index] : null;
        const settings = fresh();
        for (const key of ['bass','comp','lower','upper','steps','overwrite'] as const) {
            const candidate = entry?.[key];
            if (Number.isInteger(candidate) && candidate >= 0 && candidate <= (key==='overwrite'?15:key==='comp'?3:2)) settings[key]=candidate;
        }
        settings.overwrite |= 1; return settings;
    });
}

/** Pure geometry: physical row zero is the bottom, actors remain semantic. */
export function jointGeometry(base: number, settings: JointGroup, bases: number[], scale: number,
                              approach: boolean, below: boolean): (SurfaceCell & {track:number})[] {
    const result = Array.from({length:32},()=>({track:base,pitch:-1,target:-1,row:0}));
    const section = (role:number, start:number, rows:number, layout:number): void => {
        const actualLayout = rows===1 ? 1 : layout===0?1:layout===1?1:2;
        const mode = rows===1 || layout!==1 ? 1 : 0;
        const notes = buildPadMap(mode,actualLayout,scale,bases[role],rows);
        const surface = buildSurfaceCells(notes,actualLayout,mode===0);
        surface.forEach((cell,index)=> {
            const next={...cell,track:base+role};
            // Comp guides never acquire pitch-operation semantics.
            if(role===2) next.target=-1;
            // Lower chromatic keys commit harmony; they must not carry a
            // resolving approach identity through the conductor.
            if(role<=1 && next.target>=0){next.pitch=next.target-1;next.target=-1;}
            if(role===3 && approach && next.pitch>=0) {next.target=next.pitch;next.pitch=-1;}
            if(role<=1 && below) {
                if(next.pitch>=0) next.pitch--;
                if(next.target>=0) next.target--;
            }
            result[start+index]=next;
        });
    };
    if(settings.bass===2) {section(1,0,1,0);section(0,8,1,0);} else section(0,0,2,settings.lower);
    if(settings.comp===2) {section(2,16,1,0);section(3,24,1,0);} else section(3,16,2,settings.upper);
    return result;
}

function updateGeometry(): void {
    const base=baseTrack(), settings=group();
    const signature=JSON.stringify([base,settings,keyboardState.scale,keyboardState.rootPc,
        keyboardState.octave.slice(base,base+4),false,belowHeld||belowLatch]);
    if(signature===geometry)return;
    geometry=signature;
    cells=jointGeometry(base,settings,[0,1,2,3].map(role=>baseNoteFor(base+role)),keyboardState.scale,
        false,belowHeld||belowLatch);
    actors=[...new Set(cells.map(cell=>cell.track))].map(track=>({track,view:null,payload:'',
        cells:cells.map(cell=>cell.track===track?cell:{pitch:-1,target:-1,row:0})}));
    colors.fill(-1); previewAt=-Infinity; previewActor=0;
}

/** One preview read per 50 ms total, irrespective of the number of actors. */
export function syncJoint(send:(key:string,value:string)=>void, now=Date.now()): void {
    const nextSet=currentSetUuid();
    if(setId!==nextSet){setId=nextSet;geometry='';pushed=linked='';}
    if(pendingRelease){send('joint_release','1');pendingRelease=false;}
    const linkValue=groups.map((settings,index)=>[index*4,settings.bass===0?1:0,settings.comp===0?1:0,
        keyboardState.octave[index*4+1]-keyboardState.octave[index*4],
        keyboardState.octave[index*4+2]-keyboardState.octave[index*4+3],settings.comp===3?1:0].join(',')).join(';');
    if(linked!==linkValue){send('joint_links',linkValue);linked=linkValue;}
    if(!jointActive()) {if(pushed!=='off'){send('joint_map','off');pushed='off';}return;}
    if(schwungLibAvailable())jointPage().tick();
    updateGeometry();
    const map=cells.map(cell=> {
        const pitch=cell.target>=0?pianoApproachIdentity(cell.target,cell.row):cell.pitch;
        return [cell.track,pitch,cell.target,cell.row||3].join(',');
    }).join(';');
    if(pushed!==map){send('joint_map',map);pushed=map;}
    if(now-previewAt<50||!actors.length)return;
    previewAt=now;const actor=actors[previewActor++%actors.length];
    const payload=previewPayload(actor.cells,actor.cells.some(cell=>cell.target>=0));
    const port=portFor(actor.track);
    if(actor.payload!==payload){if(port.setParam('midi_fx1:pad_preview_inputs',payload)===false)return;actor.payload=payload;}
    const view=parseHarmonySnapshot(port.getParam('midi_fx1:pad_view'));
    if(view)actor.view=view;
}

export function paintJointPads(): void {
    if(!jointActive())return;
    const next=new Array(32).fill(0) as number[];
    for(const actor of actors){
        if(!actor.view)continue;
        withSurfacePreview(actor.track,actor.view,{notes:Int16Array.from(actor.cells,cell=>cell.pitch),
            targets:actor.cells.map(cell=>cell.target),rows:actor.cells.map(cell=>cell.row)},()=>{
            actor.cells.forEach((cell,index)=>{
                if(cells[index].track!==actor.track)return;
                next[index]=cell.target>=0?harmonyApproachColor(index,actor.track,held.has(index)):
                    cell.pitch>=0?harmonyPlaybackColor(harmonyPadColor(cell.pitch,actor.track)??0,actor.track,index,held.has(index)):0;
            });
        });
    }
    const changes=next.flatMap((color,index)=>color===colors[index]?[]:[{index,note:68+index,color}]);
    for(const change of sendPadLedFrame(changes))colors[change.index]=change.color;
}

export function jointRecordCommand(): string | null {
    if(!jointActive())return null;
    const settings=group(), base=baseTrack();
    const mask=9|(settings.bass===2?2:0)|(settings.comp===2?4:0);
    return 'jrec '+(mask<<base)+' '+((settings.overwrite&mask)<<base);
}

/** Return true only for controls owned by this view. Session remains upstream. */
export function jointMidi(data:number[]): boolean {
    const status=data[0]&0xf0, key=data[1], value=data[2];
    if((status===0x80||(status===0x90&&!value))&&key>=68&&key<=99&&held.has(key-68)){
        held.delete(key-68);return true;
    }
    if((status===0x80||(status===0x90&&!value))&&key<8&&jointPanelTouch(key,false))return true;
    if(!jointActive())return false;
    if((status===0x90||status===0x80||status===0xa0)&&key>=68&&key<=99){
        if(status===0x90&&value)held.add(key-68);
        // DSP already dispatched and recorded this physical gesture.
        return true;
    }
    if(status===0xb0&&key===51&&value){if(jointPage().back()?.action==='exit')setJointEnabled(false);return true;}
    if(status===0xb0&&key===14){const delta=value<64?value:value-128;if(delta)jointPage().changePage(delta);appState.dirty=true;return true;}
    if(status===0xb0&&key===MoveMainButton){if(value)jointPage().click(appState.shiftHeld);appState.dirty=true;return true;}
    if(status===0xb0&&key===86){if(value)recToggle(baseTrack());return true;}
    if((status===0x90||status===0x80)&&key<8){jointPanelTouch(key,status===0x90&&value>0);appState.dirty=true;return true;}
    if(status===0xb0&&key>=71&&key<=78){const delta=value<64?value:value-128;if(delta)jointPage().knobTurn(key-71,delta);appState.dirty=true;return true;}
    return false;
}

/** Values live with the quartet; the shared page controller edits their metadata. */
export function jointPanelGet(base:number,key:string):number {
    const settings=groups[base/4];
    if(key==='joint_unit')return appState.focusGroup;
    if(key==='joint_chromatic_below')return belowLatch?2:belowHeld?1:0;
    const recording=['root','bass','comp','melody'].indexOf(key.replace('joint_record_',''));
    if(recording>=0)return recording===0?0:Number(!!(settings.overwrite&(1<<recording)));
    return settings[key.replace('joint_','') as 'bass'|'comp'|'lower'|'upper'|'steps']??0;
}
export function jointPanelSet(base:number,key:string,value:string):void {
    const settings=groups[base/4],index=Number(value);
    if(key==='joint_chromatic_below'){
        belowHeld=value==='Down';
        if(value==='LatchOn')belowLatch=true;
        if(value==='LatchOff'||value==='Cancel')belowLatch=false;
    }else if(!Number.isInteger(index)||index<0)return;
    else if(key==='joint_unit'){
        if(index<=3&&[0,1,2,3].every(role=>trackKind(index*4+role)==='movy'))appState.focusGroup=index;
    }else if(key.startsWith('joint_record_')){
        const role=['root','bass','comp','melody'].indexOf(key.slice(13));
        if(role>0&&index<=1)settings.overwrite=index?settings.overwrite|(1<<role):settings.overwrite&~(1<<role);
    }else{
        const field=key.slice(6) as 'bass'|'comp'|'lower'|'upper'|'steps';
        if(['bass','comp','lower','upper','steps'].includes(field)&&index<=(field==='comp'?3:2))settings[field]=index;
    }
    geometry='';markUiStateDirty();appState.dirty=true;
}

export function renderJoint():void {
    const page=jointPage();
    for(let slot=0;slot<8;slot++)if(!(page.knobLEDMask&(1<<slot))){const color=page.keyAt(slot)==='joint_blank'?0:jointActorColor(3);cachedSetAnimLED(slot,color,color,0);}
    clear_screen();drawHeader(page.keyAt(0)==='joint_unit'?'Joint Setup':page.pageTitle,'Tracks '+(baseTrack()+1)+'-'+(baseTrack()+4));drawBankBar(page.pageIndex,page.pageCount);
    page.render('Joint G'+(appState.focusGroup+1));
}

export function jointAvailable(): boolean {
    return [0,1,2,3].every(role=>trackKind(baseTrack()+role)==='movy');
}
