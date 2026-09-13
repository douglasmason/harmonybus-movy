/* Read-only pitch-class visualization. No MIDI generation or modifier consumption. */
import { performanceTouchActive } from '../renderer/performance-touch.js';
import { flagValue } from '../seq/flags.js';
import { keyboardState } from './state.js';
import { inScaleFor } from '../seq/scales.js';
import { trackColor, C_LIGHTGREY } from '../seq/colors.js';
import { portFor } from '../track/registry.js';
import { seqState } from '../seq/state.js';
import { visualEngineTick } from '../seq/engine.js';
import { PAD_PALETTE } from './pad-palette.js';

export type HarmonySnapshot = { current: number; effective: number; scale: number; ready: boolean };
let snapshot: HarmonySnapshot | null = null;
let watchedTrack = -1;
let polledAt = -Infinity;
const colors = [127, 3, 7, 126, 13, 125, 22, 25];
const periods = [0, 0.25, 0.5, 1, 2, 4, 8, 16];
const mixes = new Map<string, number>();

export function parseHarmonySnapshot(raw: string | null): HarmonySnapshot | null {
    if (!raw) return null;
    const parts = raw.trim().split(',').map(Number);
    if (parts.length !== 4 || parts.some(value => !Number.isInteger(value)) ||
        parts.slice(0, 3).some(value => value < 0 || value > 4095) ||
        (parts[3] !== 0 && parts[3] !== 1)) return null;
    return { current: parts[0], effective: parts[1], scale: parts[2], ready: parts[3] === 1 };
}

/** Poll one compact snapshot, never once per pad or once per display frame. */
export function refreshHarmonyPads(track: number, now = Date.now()): void {
    if (!flagValue('padDisplay')) { snapshot = null; watchedTrack = -1; return; }
    if (track !== watchedTrack) { watchedTrack = track; snapshot = null; polledAt = -Infinity; }
    if (performanceTouchActive()) return;
    if (now >= polledAt && now - polledAt < 50) return;
    polledAt = now;
    snapshot = parseHarmonySnapshot(portFor(track).getParam('midi_fx1:pad_harmony'));
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
    const first = mode !== 2 && (current & (1 << pitchClass)) ? (animate ? harmonyPulse(phase, shape) : 1) : 0;
    const second = mode !== 1 && (effective & (1 << pitchClass)) ? (animate ? harmonyPulse(phase + 0.5, shape) : 1) : 0;
    if (!first && !second) return background;
    return paletteMix(background, currentColor, effectiveColor, first, second);
}

/** Null leaves Standard's existing pressed/last-played/step-edit behavior intact. */
export function harmonyPadColor(pitch: number, track: number): number | null {
    const mode = flagValue('padDisplay');
    if (!mode) return null;
    const view = watchedTrack === track ? snapshot : null;
    let scale = view?.scale || 0;
    if (!scale) for (let note = 0; note < 12; note++)
        if (inScaleFor(note, keyboardState.rootPc, keyboardState.scale)) scale |= 1 << note;
    const period = periods[flagValue('padPulseRate')];
    const beat = seqState.playing ? visualEngineTick() / 96 : Date.now() * seqState.bpmX100 / 6000000;
    // During learning, display current harmony in Effective mode too.
    const current = view?.current || 0;
    const effective = view?.ready ? view.effective : (mode === 2 ? current : 0);
    return colorHarmonyPitch(pitch, keyboardState.rootPc, track, scale, current, effective,
        mode, period ? beat / period : 0, flagValue('padPulseShape'),
        colors[flagValue('padCurrentColor')], colors[flagValue('padEffectiveColor')], period > 0);
}
