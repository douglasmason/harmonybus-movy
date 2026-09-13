/* Eight step-row performance controls. Releases belong to their original port. */
import { appState, VIEW_KNOBS, VIEW_KEYS, VIEW_CHAIN, VIEW_MAIN_PARAMS, VIEW_CLIP_PARAMS } from '../app/state.js';
import { seqState } from '../seq/state.js';
import { stepPageState, stepPageAvailable } from '../seq/step-page.js';
import { muteHeld } from '../seq/router-buttons.js';
import { schwungActiveFor } from './schwung-grid.js';
import { cachedSetAnimLED, seqLedsInvalidate } from '../seq/led-cache.js';
import { C_BLACK, C_DARKGREY, C_GREEN, C_WHITE, ANIM_NONE } from '../seq/colors.js';
import { seqToast } from '../seq/render.js';
import { flagValue, setFlag } from '../seq/flags.js';
import { fontPrint } from '../font/index.js';

export interface PerformancePort {
    performanceSet(key: string, value: string): void;
    performanceGet(key: string): string;
}
const keys = ['motion_hold_1','motion_hold_2','motion_hold_3','motion_hold_4',
    'performance_below','performance_above','performance_enclose_ab','performance_enclose_ba'];
const labels = ['Lane 1','Lane 2','Lane 3','Lane 4','Chrom Below','Scale Above',
    'Scale+ / Chrom- / Target','Chrom- / Scale+ / Target'];
const held = new Map<number, { owner: PerformancePort; key: string; momentary: boolean }>();
const usedOwners = new Set<PerformancePort>();
let paintedOwner: PerformancePort | null = null;
let sampledAt = -Infinity;
let statusMask = 0;

let lastMode: number | null = null;

function releaseForModeChange(): void {
    for (const action of held.values()) {
        if (action.momentary) action.owner.performanceSet(action.key, 'Off');
        // Keep the physical release owned so it cannot fall into step editing.
        action.momentary = false;
    }
    for (const owner of usedOwners) owner.performanceSet('performance_reset', '1');
    usedOwners.clear();sampledAt = -Infinity;statusMask = 0;
    seqLedsInvalidate();appState.dirty = true;
}

export function syncHbPerformanceMode(): boolean {
    const mode = flagValue('hbsteprow');
    if (lastMode !== null && lastMode !== mode) releaseForModeChange();
    lastMode = mode;
    return mode === 1;
}

export function setHbPerformanceMode(value: number): void {
    const next = value ? 1 : 0;
    if (flagValue('hbsteprow') !== next) releaseForModeChange();
    setFlag('hbsteprow', next);lastMode = next;
    appState.dirty = true;
}

function performanceViewAvailable(): boolean {
    return [VIEW_KNOBS,VIEW_KEYS,VIEW_CHAIN,VIEW_MAIN_PARAMS,VIEW_CLIP_PARAMS].includes(appState.currentView) &&
        !appState.shiftHeld && !seqState.sessionMode && !seqState.loopMode && !seqState.trackSelectHold &&
        !muteHeld() && !(stepPageState.selected && stepPageAvailable());
}

export function hbPerformancePage(): PerformancePort | null {
    if (!syncHbPerformanceMode() || !performanceViewAvailable()) return null;
    // HB remains the target when the focused editor changes to a synth/effect.
    const page = schwungActiveFor(appState.activeTrack.index, 'midi_fx1');
    // Controls may be declared inline in ui_hierarchy; chain_params alone is
    // not the module's complete contract (HB 0.2.130 serves a legacy list).
    if (!page || page.ctl.state.pickerOpen || !page.ctl.state.metaIndex?.get('motion_lane')) return null;
    return page;
}

export function drawHbPerformanceMode(): void {
    if (!syncHbPerformanceMode() || !performanceViewAvailable()) return;
    const active = hbPerformancePage() !== null;
    fill_rect(0,58,128,6,0);
    fontPrint(1,58,active ? 'PERFORM T' + (appState.activeTrack.index + 1) : 'STEPS / NO HB',1);
}

export function releaseHbPerformanceStep(data: number[]): boolean {
    syncHbPerformanceMode();
    const status = data[0] & 0xf0, step = data[1] - 16;
    if (!(status === 0x80 || (status === 0x90 && data[2] === 0))) return false;
    const action = held.get(step);
    if (!action) return false;
    held.delete(step);
    if (action.momentary) action.owner.performanceSet(action.key, 'Off');
    if (paintedOwner === action.owner && action.momentary) statusMask &= ~(1 << step);
    sampledAt = -Infinity;
    seqLedsInvalidate();appState.dirty = true;
    return true;
}

export function hbPerformanceStep(data: number[], owner: PerformancePort | null = hbPerformancePage()): boolean {
    if (releaseHbPerformanceStep(data)) return true;
    const status = data[0] & 0xf0, step = data[1] - 16;
    if (!owner || step < 0 || step >= 16 || (status !== 0x90 && status !== 0x80)) return false;
    if (step >= 8 || status === 0x80 || !data[2] || held.has(step)) return true;
    const key = keys[step];
    held.set(step, { owner, key, momentary: step < 6 });usedOwners.add(owner);
    owner.performanceSet(key, 'On');
    if (paintedOwner === owner) statusMask |= 1 << step;
    cachedSetAnimLED(16 + step, C_WHITE, C_WHITE, ANIM_NONE);
    sampledAt = -Infinity;
    seqToast(labels[step]);appState.dirty = true;
    return true;
}

export function paintHbPerformance(owner: PerformancePort | null = hbPerformancePage()): boolean {
    if (paintedOwner !== owner) {
        paintedOwner = owner;sampledAt = -Infinity;statusMask = 0;seqLedsInvalidate();
    }
    if (!owner) return false;
    const now = Date.now();
    if (sampledAt > now || now - sampledAt >= 100) {
        const value = Number(owner.performanceGet('performance_status'));
        if (Number.isFinite(value)) statusMask = value | 0;
        sampledAt = now;
    }
    for (let step = 0; step < 16; step++) {
        const down = held.get(step)?.owner === owner;
        const color = step >= 8 ? C_BLACK : down ? C_WHITE : statusMask & (1 << step) ? C_GREEN : C_DARKGREY;
        cachedSetAnimLED(16 + step, color, color, ANIM_NONE);
    }
    return true;
}

export function resetHbPerformance(): void {
    for (const action of held.values()) if (action.momentary) action.owner.performanceSet(action.key, 'Off');
    for (const owner of usedOwners) owner.performanceSet('performance_reset', '1');
    held.clear();usedOwners.clear();paintedOwner = null;sampledAt = -Infinity;statusMask = 0;
    seqLedsInvalidate();
}
