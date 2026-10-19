import { claimSurface, claimChannel } from './claims.js';
/** Opt-in stock FM1 USB MIDI keyboard input; the engine performs all musical mapping. */
import { fm1NoteEvent } from './core-input.js';
import { surfaceInput } from './input.js';
import { appState } from '../app/state.js';
import { flagValue } from '../seq/flags.js';
import { engineReady } from '../seq/engine.js';
import { sessionReady, currentSetUuid } from '../seq/set-session.js';
let claimedChannel = -1;
let setUuid = '';

export function releaseFm1(): void { surfaceInput.release(1); }
export function unloadFm1(): void {
    releaseFm1();
    if (claimedChannel >= 0) claimChannel(1, claimedChannel, -1);
    if (claimedChannel >= 0) claimSurface(1, false);
    claimedChannel = -1;
}
/** USB channels are the available host identity; don't guess devices from note numbers. */
export function tickFm1(): void {
    const desired = globalThis.overtakeParked === true ? -1 : flagValue('hbfm1channel') - 1;
    // Channel 1 belongs to Launchpad while enabled. Refuse this collision.
    const next = desired === 0 && flagValue('hblaunchpad') !== 0 ? -1 : desired;
    if (next !== claimedChannel) {
        unloadFm1();
        if (next >= 0 && typeof host_module_set_param_blocking === 'function' && typeof host_ext_midi_remap_set === 'function' &&
            typeof host_ext_midi_remap_enable === 'function' && claimChannel(1, next,254)) {
            if (host_ext_midi_remap_enable(true) && claimSurface(1, true)) claimedChannel = next;
            else claimChannel(1, next,-1);
        }
    }
    const uuid = currentSetUuid();
    if (uuid !== setUuid) { releaseFm1(); setUuid = uuid; }
    // One shared flush is driven by the existing Launchpad tick, including when LP is off.
}
export function onFm1Midi(data: number[]): boolean {
    if (claimedChannel < 0 || globalThis.overtakeParked === true) return false;
    const event = fm1NoteEvent(data, claimedChannel, appState.activeTrack.index);
    if (!event) return false;
    if (event.status === 144 && (!sessionReady() || !engineReady())) return true;
    surfaceInput.enqueue(1,event);
    return true;
}
declare function host_ext_midi_remap_set(input: number, output: number): boolean;
declare function host_ext_midi_remap_enable(enabled: boolean): boolean;
declare function host_module_set_param_blocking(key: string, value: string, timeout: number): boolean;
