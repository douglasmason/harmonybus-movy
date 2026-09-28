"""Timestamp shared operation gestures and display authoritative lane activation."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_double_tap(root: Path) -> None:
    """Use the same native gesture and LED state for step buttons and knobs."""
    path: Path = root / 'src/renderer/hb-performance.ts'
    source: str = path.read_text()
    source = source.replace('C_BLACK, C_GREEN, ANIM_NONE', 'C_BLACK, C_GREEN, ANIM_NONE, ANIM_PULSE_SLOW')
    source = source.replace('    refs?: number;', '    modern?: boolean; wasPersistent?: boolean; refs?: number;')
    source = source.replace('gestureBinding.length === 6', 'gestureBinding.length >= 6')
    source = source.replace('binding.length === 6', 'binding.length >= 6')
    source = source.replace('mode,threshold,wasLatched,lane:step', 'mode,threshold,wasLatched,modern:gestureBinding.length>=7,wasPersistent:gestureBinding[6]===1,lane:step')
    source = source.replace("owner.performanceSet(commandKey, gesture?'Down':'On');", "invalidateLaneLights(owner);owner.performanceSet(commandKey, gesture ? (gestureBinding.length>=7 ? 'Down,'+Date.now() : 'Down') : 'On');")
    source = source.replace('wasLatched: valid && binding[5] === 1, lane, refs: 0', 'wasLatched: valid && binding[5] === 1, modern:valid && binding.length>=7, wasPersistent:binding[6]===1, lane, refs: 0')
    source = source.replace("owner.performanceSet(action.key, 'Touch');", "invalidateLaneLights(owner);owner.performanceSet(action.key, action.modern ? 'Touch,'+action.started : 'Touch');")
    source = replace_once(source, '    if (action.gesture) {', """    invalidateLaneLights(action.owner);
    if (action.modern) {
        const now=Date.now(), elapsed=Math.max(0,now-(action.started ?? now));
        const ownerKey=action.owner.performanceTrack ?? action.owner;
        const previous=lastLaneTap.get(ownerKey);
        const pair=!!previous && previous.lane===action.lane && (action.started ?? now)>=previous.at && (action.started ?? now)-previous.at<=300;
        const short=!cancel && elapsed<(action.threshold ?? 350);
        const off=!!(short && (action.wasPersistent || (pair&&previous?.off) || (!pair&&action.wasLatched)));
        action.owner.performanceSet(action.key,cancel ? 'Cancel' : 'Up,'+elapsed+','+now);
        if(short && !(pair&&previous?.off))lastLaneTap.set(ownerKey,{lane:action.lane!,at:now,off});
        else lastLaneTap.delete(ownerKey);
        const stays=short ? !off : !cancel&&!!action.wasPersistent;
        if(action.clip){
            const lanes=clipLaneHolds.get(ownerKey) ?? new Set<number>();clipOwners.set(ownerKey,action.owner);
            if(stays)lanes.add(action.lane!);else lanes.delete(action.lane!);
            clipLaneHolds.set(ownerKey,lanes);
            if(!stays)engineWrite('hbperform',[action.owner.performanceTrack,action.lane,0,0,0,0].join(','));
        }
        return;
    }
    if (action.gesture) {""")
    source = replace_once(source, 'function resetOwner(owner: PerformancePort): void {', """function resetOwner(owner: PerformancePort): void {
    const ownerKey=owner.performanceTrack ?? owner;
    lastLaneTap.delete(ownerKey);clipLaneHolds.delete(ownerKey);clipOwners.delete(ownerKey);laneLights.delete(ownerKey);""")
    source = replace_once(source, '    const now = Date.now();\n    if (sampledAt', '    const lights=readLaneLights(owner);\n    const now = Date.now();\n    if (sampledAt')
    source = source.replace('    if (sampledAt > now || now - sampledAt >= 100) {', '    if(lights){statusMask=lights.active;operations=lights.operations;sampledAt=now;}\n    else if (sampledAt > now || now - sampledAt >= 100) {')
    source = replace_once(source, '        const color = hbOperationColor(operations[step],down || !!(statusMask & (1 << step)));\n        cachedSetAnimLED(16 + step, color, color, ANIM_NONE);', """        const active=lights ? !!(lights.active&(1<<step)) : down || !!(statusMask&(1<<step));
        const color=lights&&!active ? 0 : hbOperationColor(lights?.operations[step] ?? operations[step],active);
        const pulse=!!(lights && (lights.persistent&(1<<step)) && !(lights.down&(1<<step)));
        cachedSetAnimLED(16+step,pulse?hbOperationColor(lights?.operations[step] ?? operations[step],false):color,color,pulse?ANIM_PULSE_SLOW:ANIM_NONE);""")
    source += r"""
interface LaneLights { at:number; active:number; persistent:number; down:number; operations:number[]; }
const laneLights=new Map<PerformancePort|number,LaneLights|null>();
const lastLaneTap=new Map<PerformancePort|number,{lane:number;at:number;off:boolean}>();
const clipLaneHolds=new Map<PerformancePort|number,Set<number>>();
const clipOwners=new Map<PerformancePort|number,PerformancePort>();
export function pollHbOperationClips():void {
    for(const [key,owner] of clipOwners)if(clipLaneHolds.get(key)?.size)readLaneLights(owner);
}
function invalidateLaneLights(owner:PerformancePort):void { laneLights.delete(owner.performanceTrack ?? owner); }
function readLaneLights(owner:PerformancePort):LaneLights|null {
    const key=owner.performanceTrack ?? owner,now=Date.now(),cached=laneLights.get(key);
    if(cached===null || (cached&&now>=cached.at&&now-cached.at<50))return cached ?? null;
    const row=owner.performanceGet('motion_lights').split(',').map(Number);
    if(row.length!==19||!row.every(Number.isFinite)){laneLights.set(key,null);return null;}
    const state={at:now,active:row[0],persistent:row[1],down:row[2],operations:row.slice(3)};
    laneLights.set(key,state);
    for(const lane of clipLaneHolds.get(key) ?? [])if(!(state.active&(1<<lane))){
        engineWrite('hbperform',[owner.performanceTrack,lane,0,0,0,0].join(','));
        clipLaneHolds.get(key)?.delete(lane);
    }
    return state;
}
let operationKnobMask=0;
export function paintHbOperationKnobs(owner:PerformancePort,keys:(string|null)[],values:Record<string,unknown>):void {
    const assignments=keys.map(key=>key&&/^follow_touch_[1-9]$/.test(key)?Number(values[key])-1:-1);
    const wanted=assignments.reduce((mask,lane,index)=>mask|(lane>=0&&lane<16?1<<index:0),0);
    const lights=wanted?readLaneLights(owner):null;
    for(let knob=0;knob<8;knob++){
        const bit=1<<knob,lane=assignments[knob];
        if(!(wanted&bit)){if(operationKnobMask&bit){cachedSetAnimLED(knob,0,0,ANIM_NONE);cachedSetAnimLED(MoveKnob1+knob,0,0,ANIM_NONE,true);}continue;}
        if(!lights)continue;
        const active=!!(lights.active&(1<<lane)),pulse=!!(lights.persistent&(1<<lane))&&!(lights.down&(1<<lane));
        const color=active?hbOperationColor(lights.operations[lane],true):0;
        cachedSetAnimLED(knob,pulse?hbOperationColor(lights.operations[lane],false):color,color,pulse?ANIM_PULSE_SLOW:ANIM_NONE);
        cachedSetAnimLED(MoveKnob1+knob,pulse?hbOperationColor(lights.operations[lane],false):color,color,pulse?ANIM_PULSE_SLOW:ANIM_NONE,true);
    }
    operationKnobMask=wanted;
}
"""
    path.write_text(source)
    path = root / 'src/renderer/schwung-page.ts'
    source = path.read_text().replace('import { beginHbLaneTouch }','import { beginHbLaneTouch, paintHbOperationKnobs }').replace('export { hbOperationColor','export { beginHbLaneTouch, paintHbOperationKnobs, hbOperationColor')
    source = replace_once(source, '        // Consume the presentation frame', '        paintHbOperationKnobs(lanePort,keysOf(),ctl.state.values);\n        // Consume the presentation frame')
    source = replace_once(source, '            ctl.renderOverlays(ctx, { clearScreen: () => clear_screen() });', '            ctl.renderOverlays(ctx, { clearScreen: () => clear_screen() });\n            paintHbOperationKnobs(lanePort,keysOf(),ctl.state.values);')
    path.write_text(source)

    path = root / 'src/app/tick.ts'
    source = "import { pollHbOperationClips } from '../renderer/hb-performance.js';\n" + path.read_text()
    source = replace_once(source, 'function tickBody(): void {', 'function tickBody(): void {\n    pollHbOperationClips();')
    path.write_text(source)
