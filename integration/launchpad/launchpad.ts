/** A dedicated external input surface follows Movy's selected track and layout. */
import { appState } from '../app/state.js';
import { keyboardState, baseNoteFor } from '../keyboard/state.js';
import { buildPadMap, isPianoLayout } from '../keyboard/layouts.js';
import { parseHarmonySnapshot, withSurfacePreview, harmonyPadColor, harmonyApproachColor,
    harmonyPlaybackColor, harmonyPadPlaying, pianoApproachIdentity, withHarmonyPadFrame,
    withSteadyHarmonyLights } from '../keyboard/harmony-pads.js';
import type { HarmonySnapshot } from '../keyboard/harmony-pads.js';
import { FOLLOWER_KEYBOARD_SCALES } from '../scale-catalog.js';
import { markUiStateDirty } from '../seq/ui-dirty.js';
import { PAD_PALETTE } from '../keyboard/pad-palette.js';
import { chainInstance } from '../track/ref.js';
import { portFor } from '../track/registry.js';
import { flagValue } from '../seq/flags.js';
import { seqCmd, seqCmdFlush, engineReady } from '../seq/engine.js';
import { currentSetUuid, sessionReady } from '../seq/set-session.js';
import { seqState } from '../seq/state.js';
import { buildSurfaceCells, launchpadIndex, launchpadNote, legacyColor, previewPayload, sysexPackets, surfaceFirstRow } from './protocol.js';
import type { LaunchpadModel, SurfaceCell } from './protocol.js';

import { schwungPageFor } from '../renderer/schwung-grid.js';
import { beginSurfaceControl, toggleSurfaceLatch, surfaceControlLights } from './controls.js';
import type { Release, ControlLight } from './controls.js';

type Owner = { track: number; pitch: number; engine: boolean };
type Bank = { cells: SurfaceCell[]; view: HarmonySnapshot | null; payload: string };
const held = new Map<number, Owner>();
const controls = new Map<number, Release | null>();
let modifier = false;
let controlLights: ControlLight[] = [];
const visited = new Set<number>();
let eventSerial = Date.now() * 128;
type InputEvent = { serial: number; track: number; status: number; note: number; pitch: number; value: number; shift: number; row: number; full: number };
const eventQueue: InputEvent[] = [];
let releaseFence = 0, attemptedThrough = 0;

/** One ordered round trip per burst, before any display reads. */
export function flushLaunchpadInput(): boolean {
    if (releaseFence) {
        if (!host_module_set_param_blocking('surface_release', String(releaseFence), 8)) return false;
        releaseFence = 0;
    }
    if (!eventQueue.length) return true;
    const batch = eventQueue.slice(0, 32);
    const payload = batch.map(event => [event.serial,event.track,event.status,event.note,event.pitch,event.value,event.shift,event.row,event.full].join(',')).join(';');
    attemptedThrough = batch[batch.length - 1].serial;
    if (!host_module_set_param_blocking('surface_events', payload, 8)) return false;
    eventQueue.splice(0, batch.length);
    return eventQueue.length === 0;
}

function queueInput(status: number, note: number, value: number, owner: Owner, shift = 0, row = -1): void {
    const previous = eventQueue[eventQueue.length - 1];
    // Consecutive pressure reports supersede one another; note edges never do.
    if (status === 160 && previous?.status === 160 && previous.note === note && previous.serial > attemptedThrough) { previous.value = value; return; }
    if (eventQueue.length >= 32) flushLaunchpadInput();
    // Fail closed if the engine stops acknowledging for an entire input ring.
    // A fenced all-off also cancels any older request that arrives late.
    if (eventQueue.length >= 256) { eventQueue.length = 0; releaseFence = ++eventSerial; held.clear(); return; }
    eventQueue.push({ serial: ++eventSerial, track: owner.track, status, note, pitch: owner.pitch,
        value, shift, row, full: Number(seqState.fullVelocity) });
}
let frameReady = false, sampleBank = 0;
const pendingViews: (HarmonySnapshot | null)[] = [null, null];
const banks: Bank[] = [0, 1].map(() => ({ cells: [], view: null, payload: '' }));
let model: LaunchpadModel | 0 = 0, configured = false, track = -1, setUuid = '';
let sampledAt = -Infinity, ledAt = -Infinity, layoutSignature = '', scan = 0;
let recoverAt = Infinity, ledReadyAt = -Infinity;
let ledCache: number[] = new Array(73).fill(-1);
let initialization: number[][] = [];
let previewFrozen = false;
/** Temporary diagnostic override. Does not alter the saved surface setting. */
export function setLaunchpadPreviewFrozen(frozen: boolean): void {
    if (previewFrozen === frozen) return;
    previewFrozen = frozen;
    sampledAt = -Infinity;
    pendingViews.fill(null);
}
export function launchpadPreviewFrozen(): boolean { return previewFrozen; }
export function launchpadAvailable(): boolean {
    return configured && flagValue('hblaunchpad') === model && globalThis.overtakeParked !== true;
}
export function launchpadPreviewReady(): boolean {
    return launchpadAvailable() && frameReady && initialization.length === 0;
}
const prefix = [240, 0, 32, 41, 2, 12];
function currentLayoutSignature(): string {
    const selected=appState.activeTrack.index;
    return [selected, keyboardState.mode, keyboardState.layout, keyboardState.scale, baseNoteFor(selected)].join(':');
}

function send(packets: number[]): boolean {
    return typeof move_midi_external_send === 'function' && move_midi_external_send(packets) === true;
}

function release(index: number): void {
    const owner = held.get(index);
    if (!owner) return;
    held.delete(index);
    // Aliases in inline/piano layouts keep the note until their last physical release.
    if ([...held.values()].some(other => other.track === owner.track && other.pitch === owner.pitch)) return;
    if (owner.engine) return;
    portFor(owner.track).sendMidi(0x80, owner.pitch, 0);
    seqCmd(`nof ${owner.track} ${owner.pitch}`);
}

export function releaseLaunchpad(): void {
    eventQueue.length = 0;
    if (typeof host_module_set_param_blocking === 'function') {
        releaseFence = ++eventSerial; flushLaunchpadInput();
    }
    for (const index of [...held.keys()]) release(index);
    for (const releaseControl of controls.values()) releaseControl?.(true);
    controls.clear(); modifier = false;
    if (engineReady()) seqCmdFlush();
}

/** Undo only the channel claim owned here; other channel remaps are untouched. */
export function unloadLaunchpad(): void {
    setLaunchpadPreviewFrozen(false);
    releaseLaunchpad();
    for (const ownerTrack of visited) portFor(ownerTrack).setParam('midi_fx1:surface_enabled', '0');
    visited.clear();
    if (configured) {
        host_ext_midi_remap_set(0, -1);
        host_external_surface(0);
        if (model === 2) send(sysexPackets([...prefix, 14, 0, 247]));
        else if (model === 1) send([11, 176, 0, 0]);
    }
    frameReady = false; sampleBank = 0; pendingViews.fill(null);
    model = 0; configured = false; track = -1; setUuid = '';
    initialization = []; layoutSignature = ''; sampledAt = ledAt = ledReadyAt = -Infinity;

    banks.forEach(bank => { bank.cells = []; bank.view = null; bank.payload = ''; });
}

function configure(next: LaunchpadModel): boolean {
    if (typeof host_ext_midi_remap_set !== 'function' || typeof host_ext_midi_remap_enable !== 'function' ||
        typeof host_external_surface !== 'function' || typeof move_midi_external_send !== 'function') return false;
    // 254 is the host's BLOCK sentinel: UI receives the original note, firmware gets no note-on.
    if (!host_ext_midi_remap_set(0, 254)) return false;
    if (!host_ext_midi_remap_enable(true) || !host_external_surface(1)) {
        host_ext_midi_remap_set(0, -1); host_external_surface(0); return false;
    }
    model = next; configured = true; ledCache.fill(-1); scan = 0;
    initialization = next === 1 ? [[11, 176, 0, 0], [11, 176, 0, 1]] : [
        sysexPackets([...prefix, 14, 1, 247]), // Programmer mode
        sysexPackets([...prefix, 11, 0, 1, 247]), // polyphonic pressure, medium threshold
    ];
    return true;
}

function sample(now: number): void {
    if (!configured || !sessionReady() || !engineReady()) return;
    const selected = appState.activeTrack.index;
    const uuid = currentSetUuid();
    if (uuid !== setUuid) { releaseLaunchpad(); visited.clear(); setUuid = uuid; track = -1; }
    const signature = currentLayoutSignature();
    if (signature !== layoutSignature) {
        // A frozen display can retain instance-wide approach capability while
        // the normal key/scale mapping changes during recorded modulation.
        const retainView = previewFrozen && selected === track;
        layoutSignature = signature; track = selected; sampledAt = -Infinity;
        const notes = buildPadMap(keyboardState.mode, keyboardState.layout, keyboardState.scale, baseNoteFor(track), 8,
            surfaceFirstRow(keyboardState.layout));
        const cells = buildSurfaceCells(notes, keyboardState.layout, isPianoLayout(keyboardState.mode, keyboardState.layout));
        for (let bank = 0; bank < 2; bank++) {
            banks[bank].cells = cells.slice(bank * 32, bank * 32 + 32);
            if (!retainView) banks[bank].view = null;
            banks[bank].payload = '';
        }
        ledCache.fill(-1); frameReady = retainView && frameReady; pendingViews.fill(null); sampleBank = 0; recoverAt=now+1000;
    }
    if (previewFrozen || now - sampledAt < 50) return;
    sampledAt = now;
    const page = schwungPageFor(track, 'midi_fx1');
    if(sampleBank===0)controlLights = page.ready && page.moduleId === 'harmonybus' ? surfaceControlLights(page) : [];
    const port = portFor(track);
    if (!visited.has(track)) {
        if (port.setParam('midi_fx1:surface_enabled', '1') === false) return;
        visited.add(track);
    }
    // One native preview per poll: each bank updates at 10 Hz, with no
    // two-bank burst on the audio thread. MIDI input is never throttled.
    {
        const bank=sampleBank;sampleBank=1-sampleBank;
        const state = banks[bank];
        const payload = previewPayload(state.cells, keyboardState.layout === 2 || keyboardState.layout === 3);
        if (payload !== state.payload) {
            if (port.setParam('midi_fx1:surface_preview' + bank, payload) === false) return;
            state.payload = payload;
        }
        const view = parseHarmonySnapshot(port.getParam('midi_fx1:surface_view' + bank));
        // A busy shared parameter slot is not evidence that geometry was
        // lost. Retain the last complete snapshot and retry at normal rate.
        if(!view&&now>=recoverAt){
            // A restored/replaced HB instance may have lost runtime geometry.
            // Re-establish it with a bounded one-second recovery backoff.
            banks.forEach(entry=>{entry.payload='';});visited.delete(track);recoverAt=now+1000;
        }
        if (view) {
            pendingViews[bank] = view;
            if (pendingViews[0] && pendingViews[1]) {
                // Both halves must describe the same harmony/key context.
                // A transition between polls waits for the other half.
                const signatureFor = (snapshot: HarmonySnapshot): string => JSON.stringify([
                    snapshot.current, snapshot.effective, snapshot.lookahead, snapshot.scale, snapshot.footer,
                    snapshot.input, snapshot.ready, snapshot.effectiveColor, snapshot.playColor, snapshot.bothColor, snapshot.tonicColor,
                    snapshot.settings, snapshot.globalScale, snapshot.tonic, snapshot.fullLookahead]);
                if (signatureFor(pendingViews[0]) === signatureFor(pendingViews[1])) {
                    banks[0].view = pendingViews[0]; banks[1].view = pendingViews[1];
                    pendingViews.fill(null); frameReady = true;
                }
            }
            recoverAt=now+1000;
            const scale = view.globalScale ?? view.input;
            const resolved = scale ? FOLLOWER_KEYBOARD_SCALES[scale.resolved - 1] : undefined;
            if (resolved !== undefined && (keyboardState.scale !== resolved || (view.input && keyboardState.rootPc !== view.input.root))) {
                keyboardState.scale = resolved;
                if (view.input) keyboardState.rootPc = view.input.root;
                markUiStateDirty(); appState.dirty = true;
                layoutSignature = ''; sampledAt = -Infinity;
            }
        }
    }
}

function colors(): number[] {
    return banks.flatMap((bank, bankIndex) => {
        if (!bank.view) return new Array(32).fill(0);
        const preview = { notes: Int16Array.from(bank.cells, cell => cell.pitch),
            targets: bank.cells.map(cell => cell.target), rows: bank.cells.map(cell => cell.row) };
        return withSurfacePreview(track, bank.view, preview, () => bank.cells.map((cell, index) => {
            const physical = bankIndex * 32 + index;
            const down = held.get(physical)?.track === track;
            const approach = cell.target >= 0;
            let color = approach ? harmonyApproachColor(index, track, down) : cell.pitch >= 0 ?
                harmonyPlaybackColor(harmonyPadColor(cell.pitch, track) ?? 0, track, index, down) : 0;
            if (model === 1) return legacyColor(color, approach, cell.pitch >= 0 && [2, 3].includes(keyboardState.layout),
                down, harmonyPadPlaying(track, index));
            return color;
        }));
    });
}

/** One X SysEx per visual frame; legacy hardware retains its message limit.
 * Failed queue writes keep the entire frame pending for a bounded retry. */
export function tickLaunchpad(now = Date.now()): void {
    if (!flushLaunchpadInput()) return;
    const next = (globalThis.overtakeParked === true ? 0 : flagValue('hblaunchpad')) as LaunchpadModel | 0;
    if (next !== model) { unloadLaunchpad(); if (next) configure(next); }
    if (!configured || globalThis.overtakeParked === true) return;
    if (initialization.length) {
        if (send(initialization[0])) initialization.shift();
        return;
    }
    sample(now);
    if (previewFrozen) return;
    // Original Launchpad accepts at most 400 MIDI messages/sec; leave headroom.
    if (now < ledReadyAt || now - ledAt < (model === 1 ? 6 : 25)) return;
    // Bound attempts too: a full USB queue must not cause a retry storm.
    ledAt = now;
    if (!frameReady) return;
    // Pulses stay at their on endpoint: no repeated animation traffic on USB.
    const desired = withSteadyHarmonyLights(() => withHarmonyPadFrame(colors));
    for (let slot = 0; slot < 8; slot++) {
        const light = controlLights[slot] ?? { base: 0, color: 0, animation: 0 };
        const color = light.animation ? light.color : light.base;
        desired.push(model === 1 ? legacyColor(color, false, false, false, false) : color);
    }
    desired.push(modifier ? (model === 1 ? 63 : 120) : (model === 1 ? 12 : 0));
    const changed: number[] = desired[72] !== ledCache[72] ? [72] : [];
    for (let checked = 0; checked < 73 && changed.length < (model === 1 ? 2 : 73); checked++) {
        const index = scan++ % 73;
        if (desired[index] !== ledCache[index] && !changed.includes(index)) changed.push(index);
    }
    if (!changed.length) return;
    const address = (index: number): number => index < 64 ? launchpadNote(model as LaunchpadModel, index) :
        index < 72 ? (model === 1 ? 104 : 91) + index - 64 : model === 1 ? 8 : 89;
    const packets = model === 1 ? changed.flatMap(index => [index >= 64 && index < 72 ? 11 : 9,
        index >= 64 && index < 72 ? 176 : 144, address(index), desired[index]]) :
        sysexPackets([...prefix, 3, ...changed.flatMap(index => [3, address(index),
            ...(desired[index] >= 0x200000 ? [(desired[index] >> 14) & 127, (desired[index] >> 7) & 127, desired[index] & 127] :
                PAD_PALETTE[desired[index]].map(component => Math.round(component * 127 / 255)))]), 247]);
    if (send(packets)) {
        changed.forEach(index => { ledCache[index] = desired[index]; });
        // Existing host defaults drain three USB MIDI packets per 128-sample
        // callback. Keep only the latest desired frame while this one drains.
        ledReadyAt = model === 2 ? now + Math.ceil((packets.length / 4) * 128000 / (44100 * 3)) : now;
    }
}

/** Releases retain the press owner across track, page and performance-mode changes. */
export function onMidiMessageExternal(data: number[]): void {
    if (!configured || data.length < 3 || !data.every(value => Number.isInteger(value))) return;
    const [status, note, value] = data;
    if (status < 128 || status > 239 || (status & 15) !== 0 || note < 0 || note > 127 || value < 0 || value > 127) return;
    const type = status & 240, index = launchpadIndex(model as LaunchpadModel, note);
    const top = type === 176 ? note - (model === 1 ? 104 : 91) : -1;
    const isModifier = model === 1 ? note === 8 && (type === 144 || type === 128) : note === 89 && type === 176;
    if (isModifier) { modifier = type !== 128 && value > 0; return; }
    if (top >= 0 && top < 8) {
        flushLaunchpadInput();
        if (!value) { controls.get(top)?.(); controls.delete(top); sampledAt = -Infinity; return; }
        if (controls.has(top) || !sessionReady() || !engineReady() || globalThis.overtakeParked === true) return;
        const page = schwungPageFor(appState.activeTrack.index, 'midi_fx1');
        if (!page.ready || page.moduleId !== 'harmonybus') return;
        if (modifier) { toggleSurfaceLatch(page, top); controls.set(top, null); }
        else controls.set(top, beginSurfaceControl(page, top));
        sampledAt = -Infinity; return;
    }
    if (index < 0) return;
    if (type === 128 || (type === 144 && value === 0)) {
        const owner = held.get(index);
        if (owner?.engine) queueInput(128, note, 0, owner);
        release(index); if (!owner?.engine && engineReady()) seqCmdFlush(); return;
    }
    if (type === 160) {
        const owner = held.get(index);
        if (owner?.engine) { queueInput(160, note, value, owner); return; }
        if (owner) {
            portFor(owner.track).sendMidi(160, owner.pitch, value);
            seqCmd(`npr ${owner.track} ${owner.pitch} ${value}`); seqCmdFlush();
        }
        return;
    }
    if (type !== 144 || !sessionReady() || !engineReady() || globalThis.overtakeParked === true) return;
    // Steady-state input must not wait on display reads. Only a layout/track
    // change needs to establish geometry before the first note.
    if(currentLayoutSignature()!==layoutSignature)sample(Date.now());
    const bank = banks[index >> 5], cell = bank.cells[index % 32];
    // Ordinary notes need geometry only. Approach capability is instance-wide,
    // so input need not wait for both display banks to complete.
    const inputView = pendingViews[index >> 5] ?? bank.view ?? pendingViews[1 - (index >> 5)];
    if (!cell || (cell.pitch < 0 && (cell.target < 0 || !inputView?.pianoApproach))) return;
    release(index); // rapid repeats are distinct onsets, even if a release was lost
    const pitch = cell.target >= 0 ? pianoApproachIdentity(cell.target, cell.row) : cell.pitch;
    const port = portFor(track), velocity = seqState.fullVelocity ? 127 : value;
    const alias = [...held.values()].some(owner => owner.track === track && owner.pitch === pitch);
    const owner = { track, pitch, engine: chainInstance(track) >= 0 && typeof host_module_set_param_blocking === 'function' };
    held.set(index, owner);
    if (owner.engine) queueInput(144, note, velocity, owner, cell.target >= 0 ? cell.target - pitch : 0,
        cell.target >= 0 ? cell.row ? cell.row - 1 : 3 : -1);
    if (!alias && !owner.engine) {
        if (cell.target >= 0) port.setParam('midi_fx1:hb_movy_input_approach', `${pitch},${cell.target - pitch},${cell.row ? cell.row - 1 : 3}`);
        port.sendMidi(144, pitch, velocity);
        seqCmd(`non ${track} ${pitch} ${velocity}`); seqCmdFlush();
    }
}

declare function host_ext_midi_remap_set(input: number, output: number): boolean;
declare function host_ext_midi_remap_enable(enabled: boolean): boolean;
declare function host_external_surface(enabled: number): boolean;
declare function move_midi_external_send(packets: number[]): boolean;

declare function host_module_set_param_blocking(key: string, value: string, timeout: number): boolean;
