/** Shared operation touches: a physical release cannot steal another surface's hold. */
import { beginHbLaneTouch, setHbLaneLatch, paintHbOperationKnobs } from '../renderer/hb-performance.js';
import type { PerformancePort } from '../renderer/hb-performance.js';
import { approachRowsActive, approachTouched } from '../renderer/hb-approach.js';
import type { SchwungPage } from '../renderer/schwung-page.js';
export type Release = (cancel?: boolean) => void;
type Touch = { owner: PerformancePort; key: string; started: number; refs: number; done: boolean };
const touches = new Map<PerformancePort | number, Map<string, Touch>>();
export function beginControlTouch(owner: PerformancePort, key: string): Release {
    const ownerKey = owner.performanceTrack ?? owner;
    let actions = touches.get(ownerKey);
    if (!actions) { actions = new Map(); touches.set(ownerKey, actions); }
    let action = actions.get(key);
    if (!action) {
        action = { owner, key, started: Date.now(), refs: 0, done: false }; actions.set(key, action);
        owner.performanceSet(key, 'Down'); approachTouched(owner);
    }
    action.refs++;
    let released = false;
    return (cancel = false) => {
        if (released || action!.done) return;
        released = true;
        if (--action!.refs > 0) return;
        action!.done = true; actions!.delete(key);
        owner.performanceSet(key, cancel ? 'Cancel' : ['key_center', 'parallel_mode', 'dominant_color'].includes(key) ? 'Up' :
            'Up,' + Math.max(0, Date.now() - action!.started));
    };
}
function laneFor(page: SchwungPage, key: string): number {
    if (/^motion_control_\d+$/.test(key)) return Number(key.slice(15)) - 1;
    if (/^follow_touch_[1-9]$/.test(key)) return Math.max(1, Math.min(16, Number(page.performanceGet(key)) || 1)) - 1;
    return -1;
}
export function beginSurfaceControl(page: SchwungPage, slot: number): Release | null {
    const key = page.keyAt(slot) ?? '', lane = laneFor(page, key);
    if (lane >= 0) return beginHbLaneTouch(page, lane);
    if (/^approach_bank_\d+$/.test(key)) return beginControlTouch(page, key.replace('bank', 'touch'));
    if (['key_center', 'parallel_mode', 'dominant_color', 'harm_play_release_control'].includes(key)) return beginControlTouch(page, key);
    if (key === 'harm_play_advance') { page.performanceSet(key, 'Next'); return () => {}; }
    return null;
}
export function toggleSurfaceLatch(page: SchwungPage, slot: number): void {
    const key = page.keyAt(slot) ?? '', lane = laneFor(page, key);
    if (lane >= 0) {
        const binding = page.performanceGet('motion_gesture_binding_' + (lane + 1)).split(',').map(Number);
        if (binding.length >= 7) setHbLaneLatch(page, lane, binding[6] !== 1);
        return;
    }
    let latchKey = key, touchKey = key, on: boolean;
    if (/^approach_bank_\d+$/.test(key)) {
        if (approachRowsActive()) return;
        latchKey = key.replace('bank', 'control'); touchKey = key.replace('bank', 'touch');
        const mask = Number(page.performanceGet('approach_latch_slots')) || 0;
        on = !(mask & (1 << (Number(key.slice(14)) - 1)));
    } else if (key === 'approach_motif_latch') {
        if (!approachRowsActive()) page.performanceSet(key, page.performanceGet(key) === 'On' ? 'Off' : 'On');
        return;
    } else if (['key_center', 'parallel_mode', 'dominant_color', 'harm_play_release_control'].includes(key)) {
        on = key === 'key_center' ? page.performanceGet(key) === 'Off' : page.performanceGet(key) !== 'Latch';
    } else return;
    const actions = touches.get(page.performanceTrack ?? page), action = actions?.get(touchKey);
    if (action) { action.done = true; actions!.delete(touchKey); }
    page.performanceSet(latchKey, on ? 'LatchOn' : 'LatchOff'); approachTouched(page);
}
export type ControlLight = { base: number; color: number; animation: number };
/** Invoke the knob painter itself with an external destination. */
export function surfaceControlLights(page: SchwungPage): ControlLight[] {
    const lights = Array.from({ length: 8 }, () => ({ base: 0, color: 0, animation: 0 }));
    paintHbOperationKnobs(page, Array.from({ length: 8 }, (_, slot) => page.keyAt(slot)), page.ctl.state.values,
        (note, base, color, animation, button = false) => { if (!button && note >= 0 && note < 8) lights[note] = { base, color, animation }; });
    return lights;
}
