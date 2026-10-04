/** A dedicated external input surface follows Movy's selected track and layout. */
import { appState } from '../app/state.js';
import { keyboardState, baseNoteFor } from '../keyboard/state.js';
import { buildPadMap, isPianoLayout } from '../keyboard/layouts.js';
import { parseHarmonySnapshot, withSurfacePreview, harmonyPadColor, harmonyApproachColor,
    harmonyPlaybackColor, harmonyPadPlaying, pianoApproachIdentity } from '../keyboard/harmony-pads.js';
import type { HarmonySnapshot } from '../keyboard/harmony-pads.js';
import { FOLLOWER_KEYBOARD_SCALES } from '../scale-catalog.js';
import { markUiStateDirty } from '../seq/ui-dirty.js';
import { PAD_PALETTE } from '../keyboard/pad-palette.js';
import { portFor } from '../track/registry.js';
import { flagValue } from '../seq/flags.js';
import { seqCmd, seqCmdFlush, engineReady } from '../seq/engine.js';
import { currentSetUuid, sessionReady } from '../seq/set-session.js';
import { seqState } from '../seq/state.js';
import { buildSurfaceCells, launchpadIndex, launchpadNote, legacyColor, previewPayload, sysexPackets } from './protocol.js';
import type { LaunchpadModel, SurfaceCell } from './protocol.js';

import { schwungPageFor } from '../renderer/schwung-grid.js';
import { beginSurfaceControl, toggleSurfaceLatch, surfaceControlLights } from './controls.js';
import type { Release, ControlLight } from './controls.js';

type Owner = { track: number; pitch: number };
type Bank = { cells: SurfaceCell[]; view: HarmonySnapshot | null; payload: string };
const held = new Map<number, Owner>();
const controls = new Map<number, Release | null>();
let modifier = false;
let controlLights: ControlLight[] = [];
const visited = new Set<number>();
const banks: Bank[] = [0, 1].map(() => ({ cells: [], view: null, payload: '' }));
let model: LaunchpadModel | 0 = 0, configured = false, track = -1, setUuid = '';
let sampledAt = -Infinity, ledAt = -Infinity, layoutSignature = '', scan = 0;
let ledCache: number[] = new Array(73).fill(-1);
let initialization: number[][] = [];
const prefix = [240, 0, 32, 41, 2, 12];

function send(packets: number[]): boolean {
    return typeof move_midi_external_send === 'function' && move_midi_external_send(packets) === true;
}

function release(index: number): void {
    const owner = held.get(index);
    if (!owner) return;
    held.delete(index);
    // Aliases in inline/piano layouts keep the note until their last physical release.
    if ([...held.values()].some(other => other.track === owner.track && other.pitch === owner.pitch)) return;
    portFor(owner.track).sendMidi(0x80, owner.pitch, 0);
    seqCmd(`nof ${owner.track} ${owner.pitch}`);
}

export function releaseLaunchpad(): void {
    for (const index of [...held.keys()]) release(index);
    for (const releaseControl of controls.values()) releaseControl?.(true);
    controls.clear(); modifier = false;
    if (engineReady()) seqCmdFlush();
}

/** Undo only the channel claim owned here; other channel remaps are untouched. */
export function unloadLaunchpad(): void {
    releaseLaunchpad();
    for (const ownerTrack of visited) portFor(ownerTrack).setParam('midi_fx1:surface_enabled', '0');
    visited.clear();
    if (configured) {
        host_ext_midi_remap_set(0, -1);
        host_external_surface(0);
        if (model === 2) send(sysexPackets([...prefix, 14, 0, 247]));
        else if (model === 1) send([11, 176, 0, 0]);
    }
    model = 0; configured = false; track = -1; setUuid = '';
    initialization = []; layoutSignature = ''; sampledAt = -Infinity;
    banks.forEach(bank => { bank.cells = []; bank.view = null; bank.payload = ''; });
}

function configure(next: LaunchpadModel): boolean {
    if (typeof host_ext_midi_remap_set !== 'function' || typeof host_ext_midi_remap_enable !== 'function' ||
        typeof host_external_surface !== 'function' || typeof move_midi_external_send !== 'function') return false;
    // 254 is the host's BLOCK sentinel: UI receives the original note, firmware gets no note-on.
    if (!host_ext_midi_remap_set(0, 254) || !host_ext_midi_remap_enable(true) || !host_external_surface(1)) return false;
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
    const signature = [selected, keyboardState.mode, keyboardState.layout, keyboardState.scale, baseNoteFor(selected)].join(':');
    if (signature !== layoutSignature) {
        layoutSignature = signature; track = selected; sampledAt = -Infinity;
        const notes = buildPadMap(keyboardState.mode, keyboardState.layout, keyboardState.scale, baseNoteFor(track), 8);
        const cells = buildSurfaceCells(notes, keyboardState.layout, isPianoLayout(keyboardState.mode, keyboardState.layout));
        for (let bank = 0; bank < 2; bank++) {
            banks[bank].cells = cells.slice(bank * 32, bank * 32 + 32); banks[bank].view = null; banks[bank].payload = '';
        }
        ledCache.fill(-1);
    }
    if (now - sampledAt < 50) return;
    sampledAt = now;
    const page = schwungPageFor(track, 'midi_fx1');
    controlLights = page.ready && page.moduleId === 'harmonybus' ? surfaceControlLights(page) : [];
    const port = portFor(track);
    if (!visited.has(track)) {
        if (port.setParam('midi_fx1:surface_enabled', '1') === false) return;
        visited.add(track);
    }
    for (let bank = 0; bank < 2; bank++) {
        const state = banks[bank];
        const payload = previewPayload(state.cells, keyboardState.layout === 2 || keyboardState.layout === 3);
        if (payload !== state.payload) {
            if (port.setParam('midi_fx1:surface_preview' + bank, payload) === false) continue;
            state.payload = payload;
        }
        const view = parseHarmonySnapshot(port.getParam('midi_fx1:surface_view' + bank));
        if (view) {
            state.view = view;
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

/** Bounded delta painting; failed queue writes remain pending and retry. */
export function tickLaunchpad(now = Date.now()): void {
    const next = (globalThis.overtakeParked === true ? 0 : flagValue('hblaunchpad')) as LaunchpadModel | 0;
    if (next !== model) { unloadLaunchpad(); if (next) configure(next); }
    if (!configured || globalThis.overtakeParked === true) return;
    if (initialization.length) {
        if (send(initialization[0])) initialization.shift();
        return;
    }
    sample(now);
    // Original Launchpad accepts at most 400 MIDI messages/sec; leave headroom.
    if (now - ledAt < (model === 1 ? 6 : 10)) return;
    const desired = colors();
    // Preserve the Move painter's two endpoint colors. Legacy has discrete levels.
    const phase = Math.round((Math.sin(now * Math.PI / 1000) + 1) * 8) / 16;
    for (let slot = 0; slot < 8; slot++) {
        const light = controlLights[slot] ?? { base: 0, color: 0, animation: 0 };
        const color = light.animation ? (phase < 0.5 ? light.base : light.color) : light.base;
        if (model === 1) {
            let level = legacyColor(color, false, false, false, false);
            if (light.animation && phase < 0.5 && level !== 12) level = 12 + Math.min(1, level & 3) + 16 * Math.min(1, (level >> 4) & 3);
            desired.push(level);
        }
        else {
            const rgb = PAD_PALETTE[light.base].map((component, index) => Math.round(
                (component + (light.animation ? (PAD_PALETTE[light.color][index] - component) * phase : 0)) * 127 / 255));
            desired.push(0x200000 + rgb[0] * 16384 + rgb[1] * 128 + rgb[2]);
        }
    }
    desired.push(modifier ? (model === 1 ? 63 : 120) : (model === 1 ? 12 : 0));
    const changed: number[] = desired[72] !== ledCache[72] ? [72] : [];
    for (let checked = 0; checked < 73 && changed.length < (model === 1 ? 2 : 8); checked++) {
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
    if (send(packets)) { changed.forEach(index => { ledCache[index] = desired[index]; }); ledAt = now; }
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
        if (!value) { controls.get(top)?.(); controls.delete(top); sampledAt = -Infinity; return; }
        if (controls.has(top) || !sessionReady() || !engineReady() || globalThis.overtakeParked === true) return;
        const page = schwungPageFor(appState.activeTrack.index, 'midi_fx1');
        if (!page.ready || page.moduleId !== 'harmonybus') return;
        if (modifier) { toggleSurfaceLatch(page, top); controls.set(top, null); }
        else controls.set(top, beginSurfaceControl(page, top));
        sampledAt = -Infinity; return;
    }
    if (index < 0) return;
    if (type === 128 || (type === 144 && value === 0)) { release(index); if (engineReady()) seqCmdFlush(); return; }
    if (type === 160) {
        const owner = held.get(index);
        if (owner) {
            portFor(owner.track).sendMidi(160, owner.pitch, value);
            seqCmd(`npr ${owner.track} ${owner.pitch} ${value}`); seqCmdFlush();
        }
        return;
    }
    if (type !== 144 || !sessionReady() || !engineReady() || globalThis.overtakeParked === true) return;
    sample(Date.now());
    const bank = banks[index >> 5], cell = bank.cells[index % 32];
    if (!cell || !bank.view || (cell.pitch < 0 && (cell.target < 0 || !bank.view.pianoApproach))) return;
    release(index); // rapid repeats are distinct onsets, even if a release was lost
    const pitch = cell.target >= 0 ? pianoApproachIdentity(cell.target, cell.row) : cell.pitch;
    const port = portFor(track), velocity = seqState.fullVelocity ? 127 : value;
    const alias = [...held.values()].some(owner => owner.track === track && owner.pitch === pitch);
    held.set(index, { track, pitch });
    if (!alias) {
        if (cell.target >= 0) port.setParam('midi_fx1:hb_movy_input_approach', `${pitch},${cell.target - pitch},${cell.row ? cell.row - 1 : 3}`);
        port.sendMidi(144, pitch, velocity);
        seqCmd(`non ${track} ${pitch} ${velocity}`); seqCmdFlush();
    }
}

declare function host_ext_midi_remap_set(input: number, output: number): boolean;
declare function host_ext_midi_remap_enable(enabled: boolean): boolean;
declare function host_external_surface(enabled: number): boolean;
declare function move_midi_external_send(packets: number[]): boolean;
