"""Fixed operation knobs: directional persistent latch, one-shot tap, momentary hold."""
from pathlib import Path
from patch_responsive_persistence import replace_once

def patch_knob_latch(root: Path) -> None:
    """Separate latch gestures from Shift edits on all operation-touch knobs."""
    p: Path=root/'src/renderer/hb-performance.ts'
    s: str=p.read_text().replace('    modern?: boolean;', '    knob?: boolean; modern?: boolean;')
    s=replace_once(s,'wasPersistent:binding[6]===1, lane, refs: 0','wasPersistent:binding[6]===1, knob:valid && binding.length>=8, lane, refs: 0')
    s=replace_once(s,"action.modern ? 'Touch,'+action.started : 'Touch'","action.knob ? 'Knob,'+action.started : action.modern ? 'Touch,'+action.started : 'Touch'")
    s=replace_once(s,'const pair=!!previous &&', 'const pair=!action.knob && !!previous &&')
    s=replace_once(s,'const off=!!(short && (action.wasPersistent || (pair&&previous?.off) || (!pair&&action.wasLatched)));','const off=!action.knob && !!(short && (action.wasPersistent || (pair&&previous?.off) || (!pair&&action.wasLatched)));')
    s=replace_once(s, "        action.owner.performanceSet(action.key,cancel ? 'Cancel' : 'Up,'+elapsed+','+now);", """        const preserveLatch=cancel && action.knob && action.wasPersistent && appState.shiftHeld;
        action.owner.performanceSet(action.key,cancel&&!preserveLatch ? 'Cancel' : 'Up,'+elapsed+','+now);""")
    s=replace_once(s, "const stays=short ? !off : !cancel&&!!action.wasPersistent;", "const stays=!!preserveLatch || (short ? !off : !cancel&&!!action.wasPersistent);")
    s=replace_once(s,'if(short && !(pair&&previous?.off))lastLaneTap.set','if(!action.knob && short && !(pair&&previous?.off))lastLaneTap.set')
    s+='''
/** A turn takes ownership from the current touch; releasing that touch cannot
 * undo the new latch or accidentally arm a second one-shot. */
export function setHbLaneLatch(owner: PerformancePort, lane: number, on: boolean): void {
    const key=owner.performanceTrack ?? owner;
    const action=laneActions.get(key)?.get(lane);
    if(action)action.done=true;
    laneActions.get(key)?.delete(lane);lastLaneTap.delete(key);
    const binding=owner.performanceGet('motion_gesture_binding_'+(lane+1)).split(',').map(Number);
    owner.performanceSet('motion_gesture_'+(lane+1),on?'LatchOn':'LatchOff');
    usedOwners.add(owner);
    if(owner.performanceTrack!==undefined && binding.length>=7 && binding[0]>=12 && binding[0]<=15){
        const lanes=clipLaneHolds.get(key) ?? new Set<number>();
        if(on)lanes.add(lane);else lanes.delete(lane);
        clipLaneHolds.set(key,lanes);clipOwners.set(key,owner);
        engineWrite('hbperform',[owner.performanceTrack,lane,on?1:0,...binding.slice(0,3)].join(','));
    }
    invalidateLaneLights(owner);sampledAt=-Infinity;appState.dirty=true;
}
'''
    p.write_text(s)
    p=root/'src/renderer/schwung-page.ts'
    s=p.read_text().replace('import { beginHbLaneTouch, paintHbOperationKnobs }','import { setHbLaneLatch, beginHbLaneTouch, paintHbOperationKnobs }')
    s=replace_once(s,'        knobTurn: (slot: number, delta: number) => {','''        knobTurn: (slot: number, delta: number) => {
            const operationKey=ctl.keyAt(slot);
            const fixedLane=/^motion_control_(\\d+)$/.exec(operationKey);
            if(appState.shiftHeld && /^follow_touch_[1-9]$/.test(operationKey))return;
            if(appState.shiftHeld && fixedLane && Number(fixedLane[1])<=16){
                if(laneTouchSlots.has(slot))releasePerformanceTouch(slot,true);
                const key='motion_operation_'+fixedLane[1];
                const options=ctl.state.metaIndex.get('motion_operation')?.options||[];
                const current=options.indexOf(lanePort.performanceGet(key));
                if(delta&&current>=0){
                    const index=Math.max(0,Math.min(options.length-1,current+delta));
                    lanePort.performanceSet(key,options[index]);markUiStateDirty();
                    const pageIndex=ctl.state.pageIndex;reload();ctl.goToPage(pageIndex);
                    ctl.state.peek={key:operationKey,title:'Lane '+fixedLane[1]+' Operation',options,index,at:Date.now()};
                }
                touchPaintPending=true;return;
            }
            if(!appState.shiftHeld && (fixedLane || /^follow_touch_[1-9]$/.test(operationKey))){
                if(!delta)return;
                const lane=fixedLane?Number(fixedLane[1])-1:Math.max(1,Math.min(16,Number(lanePort.performanceGet(operationKey))||1))-1;
                setHbLaneLatch(lanePort,lane,delta>0);
                touchPaintPending=true;
                return;
            }''')
    s=replace_once(s, "            if (namedControl) {", "            if (namedControl) {\n                if(appState.shiftHeld)return;")
    s=replace_once(s, "            if (/^follow_touch_[1-9]$/.test(key)) {", "            if (/^follow_touch_[1-9]$/.test(key)) {\n                if(appState.shiftHeld)return;")
    p.write_text(s)
