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
import { fontPrint } from '../font/index.js';
import { drawHeader } from '../renderer/header.js';
import { sendPadLedFrame, cachedSetAnimLED } from './led-cache.js';
import { beginControlTouch, setControlLatch } from '../surfaces/controls.js';
import type { Release } from '../surfaces/controls.js';
import type { PerformancePort } from '../renderer/hb-performance.js';
import { trackColor } from './colors.js';
import { currentSetUuid } from './set-session.js';

export type JointGroup = { bass: number; comp: number; lower: number; upper: number; overwrite: number };
// Source 0 follows, 1 uses clips/motifs, 2 exposes pads. Layout: octaves/piano/approach.
const fresh = (): JointGroup => ({bass:0, comp:0, lower:0, upper:2, overwrite:5});
let groups: JointGroup[] = Array.from({length:4}, fresh);
let enabled = false;
let showControls = false, touchedKnob = -1;
let approachHeld = false, belowHeld = false, approachLatch = false, belowLatch = false;
let parallelHeldTrack = -1;
const operationKeys=['joint_approach_lt','joint_chromatic_below','parallel_mode'];
const operationReleases=new Map<number,Release>();
const operationOwners=new Map<number,PerformancePort>();
const ports=new Map<number,PerformancePort>();
function operationPort(track:number):PerformancePort {
    let owner=ports.get(track);
    if(!owner){owner={performanceTrack:track,
        performanceGet:(key:string):string=>key==='joint_approach_lt'?(approachLatch?'Latch':approachHeld?'Hold':'Off'):
            key==='joint_chromatic_below'?(belowLatch?'Latch':belowHeld?'Hold':'Off'):portFor(track).getParam('midi_fx1:'+key)??'',
        performanceSet:(key:string,value:string):void=>{
            if(key==='joint_approach_lt'||key==='joint_chromatic_below'){
                const down=value==='Down', latch=value==='LatchOn', latchChange=value==='LatchOn'||value==='LatchOff'||value==='Cancel';
                if(key==='joint_approach_lt'){approachHeld=down;if(latchChange)approachLatch=latch;}
                else {belowHeld=down;if(latchChange)belowLatch=latch;}
            }else portFor(track).setParam('midi_fx1:'+key,value);
            geometry='';appState.dirty=true;
        }};ports.set(track,owner);}
    return owner;
}
function nativeOperationPort(track:number):PerformancePort {
    return {performanceTrack:track,
        performanceGet:(key:string):string=>portFor(track).getParam('midi_fx1:'+key)??'',
        performanceSet:(key:string,value:string):void=>{portFor(track).setParam('midi_fx1:'+key,value);}};
}
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
export function jointEnabled(): boolean {return enabled;}
export function setJointEnabled(value: boolean): void {
    enabled = value; geometry = ''; appState.dirty = true;
    if (!value) { pendingRelease = true; held.clear(); clearJointModifiers(); }
}
function group(): JointGroup {return groups[appState.focusGroup] ?? groups[0];}
function baseTrack(): number {return appState.focusGroup * 4;}
function clearJointModifiers(): void {
    for(const release of operationReleases.values())release(true);
    operationReleases.clear();operationOwners.clear();
    approachHeld = belowHeld = approachLatch = belowLatch = false;
    parallelHeldTrack = -1;
}
export function resetJointInput(): void {
    setJointEnabled(false); pushed = linked = ''; actors = []; cells = []; colors.fill(-1);
    showControls=false;touchedKnob=-1;
}
export function jointSnapshot(): JointGroup[] {return groups.map(value=>({...value}));}
export function restoreJoint(value: unknown): void {
    resetJointInput();
    groups = Array.from({length:4}, (_,index)=> {
        const entry = Array.isArray(value) ? value[index] : null;
        const settings = fresh();
        for (const key of ['bass','comp','lower','upper','overwrite'] as const) {
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
        keyboardState.octave.slice(base,base+4),approachHeld||approachLatch,belowHeld||belowLatch]);
    if(signature===geometry)return;
    geometry=signature;
    cells=jointGeometry(base,settings,[0,1,2,3].map(role=>baseNoteFor(base+role)),keyboardState.scale,
        approachHeld||approachLatch,belowHeld||belowLatch);
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
    updateGeometry();
    const map=cells.map(cell=> {
        const pitch=cell.target>=0?pianoApproachIdentity(cell.target,cell.row):cell.pitch;
        return [cell.track,pitch,cell.target,cell.row||3].join(',');
    }).join(';');
    if(pushed!==map){send('joint_map',map);pushed=map;}
    if(now-previewAt<50||!actors.length)return;
    previewAt=now;const actor=actors[previewActor++%actors.length];
    const payload=previewPayload(actor.cells,true);
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
    if((status===0x80||(status===0x90&&!value))&&key<3&&operationReleases.has(key)){
        operationReleases.get(key)?.();operationReleases.delete(key);operationOwners.delete(key);
        if(key===2)parallelHeldTrack=-1;touchedKnob=-1;return true;
    }
    if(!jointActive())return false;
    if((status===0x90||status===0x80||status===0xa0)&&key>=68&&key<=99){
        if(status===0x90&&value)held.add(key-68);
        // DSP already dispatched and recorded this physical gesture.
        return true;
    }
    if(status===0xb0&&key===51&&value){setJointEnabled(false);return true;}
    if(status===0xb0&&key===14){
        const delta=value<64?value:value-128;
        if(delta){const next=Math.max(0,Math.min(3,appState.focusGroup+Math.sign(delta)));if([0,1,2,3].every(role=>trackKind(next*4+role)==='movy'))appState.focusGroup=next;geometry='';appState.dirty=true;}
        return true;
    }
    if(status===0xb0&&key===MoveMainButton){if(value){showControls=!showControls;appState.dirty=true;}return true;}
    if(status===0xb0&&key===86){if(value)recToggle(baseTrack());return true;}
    if((status===0x90||status===0x80)&&key<8){
        const down=status===0x90&&value>0;
        touchedKnob=down?key:-1;
        if(key<3){
            if(down&&!operationReleases.has(key)){
                const owner=operationPort(baseTrack());operationOwners.set(key,owner);
                const localRelease=beginControlTouch(owner,operationKeys[key]);
                // Use the exact native touch owner/key, so an external surface
                // holding the same operation cannot lose its hold to this pad view.
                const nativeRelease=key===0?beginControlTouch(nativeOperationPort(baseTrack()+3),'approach_touch_5'):null;
                operationReleases.set(key,(cancel=false)=>{localRelease(cancel);nativeRelease?.(cancel);});
                if(key===2)parallelHeldTrack=baseTrack();
            }else if(!down){operationReleases.get(key)?.();operationReleases.delete(key);operationOwners.delete(key);if(key===2)parallelHeldTrack=-1;}
        }
        geometry='';appState.dirty=true;return true;
    }
    if(status===0xb0&&key>=71&&key<=78){
        const knob=key-71, delta=value<64?value:value-128;
        if(!delta)return true;
        const settings=group(), direction=Math.sign(delta);
        if(knob<3){const owner=operationOwners.get(knob)??operationPort(baseTrack());setControlLatch(owner,operationKeys[knob],operationKeys[knob],direction>0);}
        const field=({3:'bass',4:'comp',5:'lower',6:'upper'} as const)[knob as 3|4|5|6];
        if(field)settings[field]=Math.max(0,Math.min(field==='comp'?3:2,settings[field]+direction));
        if(knob===7){const role=appState.activeTrack.index%4;if(role)settings.overwrite=direction>0?settings.overwrite|(1<<role):settings.overwrite&~(1<<role);}
        geometry='';markUiStateDirty();appState.dirty=true;return true;
    }
    return false;
}

export function renderJoint(): void {
    clear_screen();drawHeader('Joint Play','G'+(appState.focusGroup+1),true);
    const settings=group();
    // No actor palette: the same per-track/native colors used everywhere else.
    [3,0,0,1,2,0,3,appState.activeTrack.index%4].forEach((role,index)=>{
        const color=jointActorColor(role);cachedSetAnimLED(index,color,color,0);
    });
    const labels=['Approach LT','Chrom Below','Parallel','Bass source','Comp source','Lower layout','Upper layout','Record mode'];
    const layouts=['2 Octaves','Piano','Approach'];
    const values=[approachLatch?'Latch':approachHeld?'Hold':'Off',belowLatch?'Latch':belowHeld?'Hold':'Off',
        parallelHeldTrack>=0?'Hold':'Touch', ['Follow','Clip','Pads'][settings.bass],
        ['Follow','Clip','Pads','Clip+Guide'][settings.comp], ['2 Octaves','Piano','Chrom row'][settings.lower],layouts[settings.upper],
        settings.overwrite&(1<<(appState.activeTrack.index%4))?'Replace':'Overdub'];
    if(showControls){
        const short=['LT','Below','Parallel','Bass','Comp','Lower','Upper','Record'];
        short.forEach((name,index)=>fontPrint(2+(index%2)*64,15+Math.floor(index/2)*10,`${index+1} ${name}`,1));
        const index=touchedKnob>=0?touchedKnob:7;
        fontPrint(2,55,labels[index]+': '+values[index],1);return;
    }
    ['Root','Bass','Comp','Melody'].forEach((name,role)=>{
        const track=baseTrack()+role, state=seqState.session[track];
        const source=role===1?settings.bass:role===2?settings.comp:2;
        const mode=source===0?'Follow':source===1?'Clip':source===3?'Clip+Lead':settings.overwrite&(1<<role)?'Replace':'Overdub';
        const slot=state.playing>=0?state.playing:state.selected;
        fontPrint(2,15+role*9,`${track+1} ${name} ${slot+1} ${mode}`,1);
    });
    fontPrint(2,54,touchedKnob>=0?labels[touchedKnob]+': '+values[touchedKnob]:'Session:clips Jog:controls',1);
}

export function jointAvailable(): boolean {
    return [0,1,2,3].every(role=>trackKind(baseTrack()+role)==='movy');
}
