/* Read-only pitch-class visualization. No MIDI generation or modifier consumption. */
import { performanceTouchActive } from '../renderer/performance-touch.js';
import { keyboardState } from './state.js';
import { isPianoLayout } from './layouts.js';
import { markUiStateDirty } from '../seq/ui-dirty.js';
import { appState } from '../app/state.js';
import { inScaleFor } from '../seq/scales.js';
import { trackColor, C_LIGHTGREY, C_GREEN, C_DARKGREY, C_WHITE } from '../seq/colors.js';
import { portFor } from '../track/registry.js';
import { seqState } from '../seq/state.js';
import { visualEngineTick } from '../seq/engine.js';
import { PAD_PALETTE } from './pad-palette.js';

export type HarmonySnapshot = { current: number; effective: number; lookahead: number; scale: number; ready: boolean; settings: number[]; arpInputs?: number[]; input?: {root: number; selected: number; resolved: number; scale: number; chord: number} };
let snapshot: HarmonySnapshot | null = null;
let settings = [0,3,0,4,2];
let watchedTrack = -1;
let polledAt = -Infinity;
const colors = [127, 3, 7, 126, 13, 125, 22, 25];
const periods = [0, 0.25, 0.5, 1, 2, 4, 8, 16];
const mixes = new Map<string, number>();

export function parseHarmonySnapshot(raw: string | null): HarmonySnapshot | null {
    if (!raw) return null;
    const [harmony, arp, inputRaw] = raw.trim().split('|');
    const parts = harmony.split(',').map(Number);
    if (parts.length !== 10 || parts.some(value => !Number.isInteger(value)) ||
        [...parts.slice(0, 3), parts[4]].some(value => value < 0 || value > 4095) ||
        (parts[3] !== 0 && parts[3] !== 1) ||
        parts.slice(5).some((value,index) => value < 0 || value >= [5,8,3,8,8][index])) return null;
    let arpInputs: number[] | undefined;
    if (arp) {
        const [version, active, ...notes] = arp.split(',');
        if (version !== 'arp1' || !['0','1'].includes(active)) return null;
        const inputs = notes.map(Number);
        if (inputs.some(note => !Number.isInteger(note) || note < 0 || note > 127)) return null;
        if (active === '1') arpInputs = inputs;
    }
    let input: HarmonySnapshot['input'];
    if (inputRaw) {
        const [version, ...rawValues] = inputRaw.split(',');
        const values = rawValues.map(Number);
        if (version !== 'input1' || values.length !== 5 || values.some(v => !Number.isInteger(v)) ||
            values[0] < 0 || values[0] > 11 || values[1] < 0 || values[1] > 9 ||
            values[2] < 1 || values[2] > 9 || values.slice(3).some(v => v < 0 || v > 4095) ||
            (values[4] & ~values[3])) return null;
        input = {root: values[0], selected: values[1], resolved: values[2], scale: values[3], chord: values[4]};
    }
    return { ...(input ? {input} : {}), ...(arpInputs !== undefined ? {arpInputs} : {}), current: parts[0], effective: parts[1], lookahead: parts[4], scale: parts[2], ready: parts[3] === 1, settings: parts.slice(5) };
}

/** Poll one compact snapshot, never once per pad or once per display frame. */
export function refreshHarmonyPads(track: number, now = Date.now()): void {
    if (track !== watchedTrack) { watchedTrack = track; snapshot = null; polledAt = -Infinity; }
    if (performanceTouchActive()) return;
    if (now >= polledAt && now - polledAt < 50) return;
    polledAt = now;
    const port = portFor(track);
    const raw = port.getParam('midi_fx1:pad_view');
    snapshot = parseHarmonySnapshot(raw || port.getParam('midi_fx1:pad_render'));
    settings = snapshot?.settings || [0,3,0,4,2];
    const input = snapshot?.input;
    if (input && (keyboardState.scale !== input.resolved - 1 || keyboardState.rootPc !== input.root)) {
        keyboardState.scale = input.resolved - 1;
        keyboardState.rootPc = input.root;
        markUiStateDirty();
        appState.dirty = true;
    }
}

/** Supported input scales for the active follower; other modules keep all scales. */
export function followerInputScaleCount(track: number): number {
    return watchedTrack === track && snapshot?.input ? 9 : 13;
}

/** User edits write once; inferred snapshots never write back or disable Infer. */
export function setFollowerInputScale(track: number, scale: number): void {
    const labels = ['Major','Natural Minor','Dorian','Phrygian','Lydian','Mixolydian','Locrian','Harmonic Minor','Melodic Minor'];
    if (watchedTrack !== track || !snapshot?.input || !labels[scale]) return;
    portFor(track).setParam('midi_fx1:follower_scale', labels[scale]);
    polledAt = -Infinity;
}

/** Peaks at phase zero. Independent half-cycle shifts need not sum to one. */
export function harmonyPulse(phase: number, shape: number): number {
    const wrapped = ((phase % 1) + 1) % 1;
    const distance = Math.min(wrapped, 1 - wrapped);
    if (shape === 2) return distance < 0.2 ? 1 : 0;
    if (shape === 1) return Math.max(0, 1 - 2 * distance);
    return Math.pow((1 + Math.cos(2 * Math.PI * wrapped)) / 2, 2);
}

/** Approximate RGB mixtures with Move's fixed palette; cache quantized levels. */
function paletteMix(background: number, current: number, effective: number, first: number, second: number): number {
    const total = first + second;
    if (total > 1) { first /= total; second /= total; }
    const firstLevel = Math.round(first * 12), secondLevel = Math.round(second * 12);
    const key = [background, current, effective, firstLevel, secondLevel].join(':');
    const cached = mixes.get(key); if (cached !== undefined) return cached;
    first = firstLevel / 12; second = secondLevel / 12;
    const base = Math.max(0, 1 - first - second);
    const desired = [0, 1, 2].map(channel => PAD_PALETTE[background][channel] * base +
        PAD_PALETTE[current][channel] * first + PAD_PALETTE[effective][channel] * second);
    let best = background, distance = Infinity;
    for (let index = 0; index < PAD_PALETTE.length; index++) {
        const error = PAD_PALETTE[index].reduce((sum, value, channel) => sum + (value - desired[channel]) ** 2, 0);
        if (error < distance) { best = index; distance = error; }
    }
    if (mixes.size >= 4096) mixes.clear();
    mixes.set(key, best);
    return best;
}

export function colorHarmonyPitch(pitch: number, inputRoot: number, track: number,
    scale: number, current: number, effective: number, mode: number,
    phase: number, shape: number, currentColor: number, effectiveColor: number, animate: boolean): number {
    if (pitch < 0) return 0;
    const pitchClass = pitch % 12;
    const background = pitchClass === inputRoot ? trackColor(track) : (scale & (1 << pitchClass)) ? C_LIGHTGREY : 0;
    const first = (mode === 1 || mode === 3) && (current & (1 << pitchClass)) ? (animate ? harmonyPulse(phase, shape) : 1) : 0;
    const second = mode !== 1 && (effective & (1 << pitchClass)) ? (animate ? harmonyPulse(phase + 0.5, shape) : 1) : 0;
    if (!first && !second) return background;
    return paletteMix(background, currentColor, effectiveColor, first, second);
}

/** Null leaves Standard's existing pressed/last-played/step-edit behavior intact. */
export function harmonyPadColor(pitch: number, track: number, held = false): number | null {
    if (pitch < 0) return 0;
    const mode = settings[0];
    const view = watchedTrack === track ? snapshot : null;
    // Exact raw input notes own highlights; generated output never lights pads.
    if (view?.arpInputs !== undefined) {
        if (view.arpInputs.includes(pitch)) return C_GREEN;
        if (!mode && !view.input) return pitch % 12 === keyboardState.rootPc ? trackColor(track) :
            inScaleFor(pitch, keyboardState.rootPc, keyboardState.scale) ? C_LIGHTGREY : 0;
    }
    if (!mode && view?.input) {
        if (held && view.arpInputs === undefined) return C_WHITE;
        const input = view.input, bit = 1 << (pitch % 12);
        if (pitch % 12 === input.root) return trackColor(track);
        if (input.chord & bit) return paletteMix(C_LIGHTGREY, trackColor(track), 0, 0.5, 0);
        if (input.scale & bit) return C_LIGHTGREY;
        return isPianoLayout(keyboardState.mode, keyboardState.layout) ? C_DARKGREY : 0;
    }
    if (!mode) return null;
    let scale = view?.scale || 0;
    if (!view) for (let note = 0; note < 12; note++)
        if (inScaleFor(note, keyboardState.rootPc, keyboardState.scale)) scale |= 1 << note;
    const period = periods[settings[1]];
    const beat = seqState.playing ? visualEngineTick() / 96 : Date.now() * seqState.bpmX100 / 6000000;
    // Every mask identifies INPUT keys by their effective RENDERED voices.
    const current = view?.current || 0;
    const effective = mode === 2 ? (view?.effective || 0) : (view?.ready ? view.lookahead : 0);
    return colorHarmonyPitch(pitch, keyboardState.rootPc, track, scale, current, effective,
        mode, period ? beat / period : 0, settings[2],
        colors[settings[3]], colors[settings[4]], period > 0);
}

/** Editing the keyboard tonic selects the same explicit input root in HB. */
export function setFollowerInputRoot(track: number, root: number): void {
    if (watchedTrack !== track || !snapshot?.input) return;
    const port = portFor(track);
    const names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
    port.setParam('midi_fx1:follower_root_policy', 'Explicit');
    port.setParam('midi_fx1:follower_explicit_root', names[((root % 12) + 12) % 12]);
    polledAt = -Infinity;
}
