"""Eight assignable knob gestures using the existing operation lane engine."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_follow_touch(root: Path) -> None:
    p = root / 'src/renderer/hb-performance.ts'
    s = p.read_text()
    # Native gesture ownership is a lane, so simultaneous physical sources share
    # its initial down and final release (including duplicate knob assignments).
    s = s.replace('    owner: PerformancePort; key:', '    refs?: number; done?: boolean; owner: PerformancePort; key:')
    s = s.replace('const held = new Map<number, HeldAction>();', "const held = new Map<number, HeldAction>();\nconst laneActions = new Map<PerformancePort | number, Map<number, HeldAction>>();")
    s = replace_once(s, 'function resetOwner(owner: PerformancePort): void {', """function resetOwner(owner: PerformancePort): void {
    const lanes = laneActions.get(owner.performanceTrack ?? owner);
    if (lanes) for (const action of lanes.values()) action.done = true;
    laneActions.delete(owner.performanceTrack ?? owner);""")
    s = replace_once(s, 'function releaseAction(action: HeldAction, cancel = false): void {', """function releaseAction(action: HeldAction, cancel = false): void {
    if (action.done) return;
    if (!cancel && action.refs && --action.refs > 0) return;
    action.done = true;
    laneActions.get(action.owner.performanceTrack ?? action.owner)?.delete(action.lane!);""")
    s = replace_once(s, '    const key = keys[step];', """    const key = keys[step];
    const shared = laneActions.get(owner.performanceTrack ?? owner)?.get(step);
    if (shared) { shared.refs = (shared.refs ?? 1) + 1; held.set(step, shared); return true; }""")
    s = replace_once(s, "    if (clip) engineWrite('hbperform',[owner.performanceTrack,step,", """    const action = held.get(step)!; action.refs = 1;
    let sharedLanes = laneActions.get(owner.performanceTrack ?? owner);
    if (!sharedLanes) { sharedLanes = new Map(); laneActions.set(owner.performanceTrack ?? owner, sharedLanes); }
    sharedLanes.set(step, action);
    if (clip) engineWrite('hbperform',[owner.performanceTrack,step,""")
    s += '''
export function beginHbLaneTouch(owner: PerformancePort, lane: number): (cancel?: boolean) => void {
    const ownerKey = owner.performanceTrack ?? owner;
    let lanes = laneActions.get(ownerKey);
    if (!lanes) { lanes = new Map(); laneActions.set(ownerKey, lanes); }
    let action = lanes.get(lane);
    if (!action) {
        const binding = owner.performanceGet('motion_gesture_binding_' + (lane + 1)).split(',').map(Number);
        const valid = binding.length === 6 && binding.every(Number.isFinite);
        const clip = valid && owner.performanceTrack !== undefined && binding[0] >= 12 && binding[0] <= 15;
        action = { owner, key: 'motion_gesture_' + (lane + 1), momentary: true,
            clip, gesture: true, started: Date.now(), mode: 2, threshold: valid ? binding[4] : 350,
            wasLatched: valid && binding[5] === 1, lane, refs: 0 };
        lanes.set(lane, action); usedOwners.add(owner);
        if (clip) engineWrite('hbperform', [owner.performanceTrack,lane,1,...binding.slice(0,3)].join(','));
        owner.performanceSet(action.key, 'Touch');
    }
    action.refs = (action.refs ?? 1) + 1;
    let released = false;
    return (cancel = false) => {
        if (released) return;
        released = true;
        releaseAction(action!, cancel);
        sampledAt = -Infinity; appState.dirty = true;
    };
}
'''
    p.write_text(s)
    p = root / 'src/renderer/schwung-page.ts'
    s = "import { beginHbLaneTouch } from './hb-performance.js';\n" + p.read_text()
    seam = '    const touchActions = new Map<number, string>();'
    if seam not in s:
        raise RuntimeError('Follow Touch: touchActions seam missing')
    s = replace_once(s, seam, seam + '''
    const laneTouchSlots = new Set<number>();
    const lanePort = {
        performanceTrack: port.track.index,
        performanceSet: (key: string, value: string) => port.setParam(qualify(componentKey + ':' + key), value),
        performanceGet: (key: string) => String(port.getParam(qualify(componentKey + ':' + key)) ?? ''),
    };''')
    s = replace_once(s, '            if (touchActions.has(slot)) return;\n            // Flush', '''            if (laneTouchSlots.has(slot)) {
                releasePerformanceTouch(slot, true);
                touchReadOnly = true;
                try { ctl.onKnobTouch(slot, true); } finally { touchReadOnly = false; }
            }
            if (/^follow_touch_[1-8]$/.test(ctl.keyAt(slot))) {
                const key = ctl.keyAt(slot);
                const current = Number(lanePort.performanceGet(key)) || 1;
                ctl.commitEnum(key, Math.max(0, Math.min(15, current - 1 + delta)));
                ctl.revalue();
                laneTouchSlots.add(slot);
                ownPerformanceTouch(slot, () => {
                    laneTouchSlots.delete(slot);touchPaintPending = true;
                    touchReadOnly = true;
                    try { ctl.onKnobTouch(slot, false); } finally { touchReadOnly = false; }
                });
                return;
            }
            if (touchActions.has(slot)) return;
            // Flush''')
    s = replace_once(s, '                if (padControlTouches.has(slot))', '                if (laneTouchSlots.has(slot)) { releasePerformanceTouch(slot); return; }\n                if (padControlTouches.has(slot))')
    s = replace_once(s, '            // These enums are presentation settings', '''            if (/^follow_touch_[1-8]$/.test(key)) {
                const lane = Math.max(1, Math.min(16, Number(lanePort.performanceGet(key)) || 1)) - 1;
                const release = beginHbLaneTouch(lanePort, lane);
                const started = Date.now();
                laneTouchSlots.add(slot);
                ownPerformanceTouch(slot, (cancel = false) => {
                    laneTouchSlots.delete(slot);
                    release(cancel);
                    if (!cancel && Date.now() - started < gestureHoldMs) {
                        const previous = ctl.state.triggerFiredAt[key] || [];
                        ctl.state.triggerFiredAt[key] = previous.filter((stamp: number) => Date.now() - stamp < 400).slice(-3).concat(Date.now());
                    }
                    touchPaintPending = true;
                    touchReadOnly = true;
                    try { ctl.onKnobTouch(slot, false); } finally { touchReadOnly = false; }
                });
                return;
            }
            // These enums are presentation settings''')
    p.write_text(s)
