"""Expose fixed named performance controls and amount turns without lane remapping."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_named_controls(root: Path) -> None:
    """Route fixed knobs through the shared native gesture owner."""
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = path.read_text()
    # The existing release owner also handles named controls, including cancel
    # on a turn or page change. Turning never changes a control's lane identity.
    anchor: str = "            if (/^follow_touch_[1-9]$/.test(key)) {"
    replacement: str = """            const namedControl = /^motion_control_(\\d+)$/.exec(key);
            if (namedControl) {
                const lane = Number(namedControl[1]) - 1;
                const release = beginHbLaneTouch(lanePort, lane);
                const started = Date.now();
                laneTouchSlots.add(slot);
                ownPerformanceTouch(slot, (cancel = false) => {
                    laneTouchSlots.delete(slot);release(cancel);touchPaintPending = true;
                    if (!cancel && Date.now() - started < gestureHoldMs) {
                        const previous = ctl.state.triggerFiredAt[key] || [];
                        ctl.state.triggerFiredAt[key] = previous.filter((stamp: number) => Date.now() - stamp < 400).slice(-3).concat(Date.now());
                    }
                    touchReadOnly = true;
                    try { ctl.onKnobTouch(slot, false); } finally { touchReadOnly = false; }
                });
                return;
            }
""" + anchor
    source = replace_once(source, anchor, replacement)
    path.write_text(source)

    path = root / 'src/renderer/hb-performance.ts'
    source = path.read_text()
    source = source.replace("const assignments=keys.map(key=>key&&/^follow_touch_[1-9]$/.test(key)?Number(values[key])-1:-1);", "const assignments=keys.map(key=>key&&/^motion_control_[0-9]+$/.test(key)?Number(key.slice(15))-1:key&&/^follow_touch_[1-9]$/.test(key)?Number(values[key])-1:-1);")
    source = source.replace('lane>=0&&lane<16?1<<index:0', 'lane>=0&&lane<51?1<<index:0')
    source = source.replace('    const lights=wanted?readLaneLights(owner):null;', '    const userLights=wanted?readLaneLights(owner):null;\n    const namedLights=assignments.some(lane=>lane>=16)?readNamedLights(owner):null;')
    source = source.replace('        if(!lights)continue;\n        const active=', '        const lights=lane>=16?namedLights:userLights;const localLane=lane>=16?lane-16:lane;\n        if(!lights)continue;\n        const active=')
    start: int = source.index('export function paintHbOperationKnobs')
    source = source[:start] + source[start:].replace('(1<<lane)', '(1<<localLane)').replace('operations[lane]', 'operations[localLane]')
    source = source.replace('lights.active&(1<<localLane)', 'Math.floor(lights.active / 2**localLane)%2').replace('lights.persistent&(1<<localLane)', 'Math.floor(lights.persistent / 2**localLane)%2').replace('lights.down&(1<<localLane)', 'Math.floor(lights.down / 2**localLane)%2')
    source += """
const namedLaneLights=new Map<PerformancePort|number,LaneLights>();
/** Presentation-only read; the normal LED update owns host polling. */
export function cachedNamedControlActive(owner:PerformancePort,control:number):boolean {
    const state=namedLaneLights.get(owner.performanceTrack ?? owner);
    return !!state&&!!(Math.floor(state.active/2**(control-17))%2);
}
function readNamedLights(owner:PerformancePort):LaneLights|null {
    const key=owner.performanceTrack ?? owner,now=Date.now(),cached=namedLaneLights.get(key);
    if(cached&&now>=cached.at&&now-cached.at<50)return cached;
    const row=owner.performanceGet('motion_named_lights').split(',').map(Number);
    if(row.length!==38||!row.every(Number.isFinite))return null;
    const state={at:now,active:row[0],persistent:row[1],down:row[2],operations:row.slice(3)};
    namedLaneLights.set(key,state);return state;
}
"""
    source = source.replace('function invalidateLaneLights(owner:PerformancePort):void {', 'function invalidateLaneLights(owner:PerformancePort):void { namedLaneLights.delete(owner.performanceTrack ?? owner);')
    path.write_text(source)
