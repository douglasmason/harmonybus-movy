/* Sixteen assignable step-row performance controls. Releases belong to their original port. */
import { appState, VIEW_KNOBS, VIEW_KEYS, VIEW_CHAIN, VIEW_MAIN_PARAMS, VIEW_CLIP_PARAMS } from '../app/state.js';
import { seqState } from '../seq/state.js';
import { stepPageState, stepPageAvailable } from '../seq/step-page.js';
import { muteHeld } from '../seq/router-buttons.js';
import { schwungActiveFor } from './schwung-grid.js';
import { cachedSetAnimLED, seqLedsInvalidate } from '../seq/led-cache.js';
import { C_BLACK, C_GREEN, ANIM_NONE } from '../seq/colors.js';
import { seqToast } from '../seq/render.js';
import { flagValue, setFlag } from '../seq/flags.js';
import { fontPrint } from '../font/index.js';

export interface PerformancePort {
    readonly performanceTrack?: number;
    performanceSet(key: string, value: string): void;
    performanceGet(key: string): string;
}
const keys = Array.from({length:16}, (_,index) => 'motion_hold_' + (index + 1));
const held = new Map<number, { owner: PerformancePort; key: string; momentary: boolean; clip: boolean }>();
const hosts = new Map<number, (value: string) => void>();
function engineWrite(key: string, value: string): void {
    if (typeof host_module_set_param_blocking === 'function') host_module_set_param_blocking(key,value,50);
    else if (typeof host_module_set_param === 'function') host_module_set_param(key,value);
}
export function registerHbHost(track: number, write: (value: string) => void): void {
    hosts.set(track,write);write('movy-clip-v2');
}
export function releaseHbHosts(): void {
    for (const [track,write] of hosts) { engineWrite('hbperform_reset',String(track));write(''); }
    hosts.clear();
}
function releaseAction(action: {owner: PerformancePort; key: string; clip: boolean}): void {
    // No parameter reads on release; the original owner and lane were captured.
    if (action.clip) engineWrite('hbperform',[action.owner.performanceTrack,Number(action.key.slice(12))-1,0,0,0,0].join(','));
    action.owner.performanceSet(action.key,'Off');
}
function resetOwner(owner: PerformancePort): void {
    if (owner.performanceTrack !== undefined) engineWrite('hbperform_reset',String(owner.performanceTrack));
    owner.performanceSet('performance_reset','1');
}
const usedOwners = new Set<PerformancePort>();
let paintedOwner: PerformancePort | null = null;
let sampledAt = -Infinity;
let statusMask = 0;
let operations: number[] = new Array(16).fill(0);
/** Hardware palette: Neon Green 11/85; Royal Blue 17/97. */
export function hbOperationColor(operation: number, active: boolean): number {
    if (!operation) return C_BLACK;
    const clip = operation >= 12 && operation <= 15;
    return clip ? (active ? 17 : 97) : (active ? C_GREEN : 85);
}

let lastMode: number | null = null;

function releaseForModeChange(): void {
    for (const action of held.values()) {
        if (action.momentary) releaseAction(action);
        // Keep the physical release owned so it cannot fall into step editing.
        action.momentary = false;
    }
    for (const owner of usedOwners) resetOwner(owner);
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
    if (action.momentary) releaseAction(action);
    if (paintedOwner === action.owner && action.momentary) statusMask &= ~(1 << step);
    sampledAt = -Infinity;
    seqLedsInvalidate();appState.dirty = true;
    return true;
}

export function hbPerformanceStep(data: number[], owner: PerformancePort | null = hbPerformancePage()): boolean {
    if (releaseHbPerformanceStep(data)) return true;
    const status = data[0] & 0xf0, step = data[1] - 16;
    if (!owner || step < 0 || step >= 16 || (status !== 0x90 && status !== 0x80)) return false;
    if (status === 0x80 || !data[2] || held.has(step)) return true;
    const key = keys[step];
    const binding = owner.performanceGet('motion_binding_' + (step + 1)).split(',').map(Number);
    const clip = owner.performanceTrack !== undefined && binding.length === 3 && binding.every(Number.isFinite) && binding[0] >= 12 && binding[0] <= 15;
    held.set(step, { owner, key, momentary: true, clip });usedOwners.add(owner);
    if (clip) engineWrite('hbperform',[owner.performanceTrack,step,1,...binding].join(','));
    owner.performanceSet(key, 'On');
    if (paintedOwner === owner) statusMask |= 1 << step;
    const operation = Number.isFinite(binding[0]) ? binding[0] : 0;
    if (paintedOwner === owner) operations[step] = operation;
    const color = hbOperationColor(operation,true);
    cachedSetAnimLED(16 + step,color,color,ANIM_NONE);
    sampledAt = -Infinity;
    seqToast('Slot ' + (step + 1));appState.dirty = true;
    return true;
}

export function paintHbPerformance(owner: PerformancePort | null = hbPerformancePage()): boolean {
    if (paintedOwner !== owner) {
        paintedOwner = owner;sampledAt = -Infinity;statusMask = 0;operations.fill(0);seqLedsInvalidate();
    }
    if (!owner) return false;
    const now = Date.now();
    if (sampledAt > now || now - sampledAt >= 100) {
        // One bounded read carries both activity and all sixteen assignments.
        const row = owner.performanceGet('motion_row').split(',').map(Number);
        if (row.length === 17 && row.every(Number.isFinite)) {
            statusMask = row[0] | 0;operations = row.slice(1);
        }
        sampledAt = now;
    }
    for (let step = 0; step < 16; step++) {
        const down = held.get(step)?.owner === owner;
        const color = hbOperationColor(operations[step],down || !!(statusMask & (1 << step)));
        cachedSetAnimLED(16 + step, color, color, ANIM_NONE);
    }
    return true;
}

export function resetHbPerformance(): void {
    for (const action of held.values()) if (action.momentary) releaseAction(action);
    for (const owner of usedOwners) resetOwner(owner);
    held.clear();usedOwners.clear();paintedOwner = null;sampledAt = -Infinity;statusMask = 0;
    seqLedsInvalidate();
}
