/* Read-only pitch-class visualization. No MIDI generation or modifier consumption. */
import { performancePreviewRevision } from '../renderer/performance-touch.js';
import { keyboardState, padMapFor } from './state.js';
import { isPianoLayout } from './layouts.js';
import { markUiStateDirty } from '../seq/ui-dirty.js';
import { appState } from '../app/state.js';
import { inScaleFor } from '../seq/scales.js';
import { trackColor, C_LIGHTGREY, C_GREEN, C_DARKGREY, C_WHITE } from '../seq/colors.js';
import { portFor } from '../track/registry.js';
import { seqState } from '../seq/state.js';
import { visualEngineTick } from '../seq/engine.js';
import { PAD_PALETTE } from './pad-palette.js';

export type HarmonySnapshot = { current: number; effective: number; lookahead: number; scale: number; ready: boolean; settings: number[]; effectiveColor?: number; playColor?: number; tonic?: number; fullLookahead?: number; bothColor?: number; tonicColor?: number; outputGroups?: number[]; arpInputs?: number[]; globalScale?: {selected: number; resolved: number}; input?: {root: number; selected: number; resolved: number; scale: number; chord: number} };
let snapshot: HarmonySnapshot | null = null;
let requestedPads: number[] = [];
let previewRevision = -1;
let settings = [0,3,0,4,2];
let watchedTrack = -1;
let polledAt = -Infinity;
const colors = [127, 3, 7, 126, 13, 125, 22, 25];
const periods = [0, 0.25, 0.5, 1, 2, 4, 8, 16];
const mixes = new Map<string, number>();

export function parseHarmonySnapshot(raw: string | null): HarmonySnapshot | null {
    if (!raw) return null;
    const [harmony, ...sections] = raw.trim().split('|');
    const colorSection = sections.find(section => section.startsWith('colors2,'));
    const effectiveColor = colorSection ? Number(colorSection.split(',')[1]) : 8;
    if (!Number.isInteger(effectiveColor) || effectiveColor < 0 || effectiveColor > 8) return null;
    const playSection = sections.find(section => section.startsWith('playcolor1,'));
    const playColor = playSection ? Number(playSection.split(',')[1]) : undefined;
    if (playSection && (playSection.split(',').length !== 2 || !Number.isInteger(playColor) || playColor! < 0 || playColor! > 11)) return null;
    const tonicSection = sections.find(section => section.startsWith('tonic1,'));
    const tonic = tonicSection ? Number(tonicSection.split(',')[1]) : undefined;
    if (tonicSection && (tonicSection.split(',').length !== 2 || !Number.isInteger(tonic) || tonic! < 0 || tonic! > 4095)) return null;
    const fullSection = sections.find(section => section.startsWith('full1,'));
    let fullLookahead: number | undefined;
    if (fullSection) {
        const fields = fullSection.split(',');
        const mask = Number(fields[2]);
        if (fields.length !== 3 || !['0','1'].includes(fields[1]) || !Number.isInteger(mask) || mask < 0 || mask > 4095) return null;
        fullLookahead = fields[1] === '1' ? mask : 0;
    }
    const bothSection = sections.find(section => section.startsWith('both1,'));
    const bothColor = bothSection ? Number(bothSection.split(',')[1]) : undefined;
    if (bothSection && (bothSection.split(',').length !== 2 || !Number.isInteger(bothColor) || bothColor! < 0 || bothColor! > 9)) return null;
    const tonicColorSection = sections.find(section => section.startsWith('toniccolor1,'));
    const tonicColor = tonicColorSection ? Number(tonicColorSection.split(',')[1]) : 8;
    if (tonicColorSection && (tonicColorSection.split(',').length !== 2 || !Number.isInteger(tonicColor) || tonicColor < 0 || tonicColor > 9)) return null;
    const outputSection = sections.find(section => section.startsWith('outputs1,'));
    const outputGroups = outputSection?.split(',').slice(1).map(Number);
    if (outputGroups && (outputGroups.length !== 32 || outputGroups.some(value => !Number.isInteger(value) || value < -1 || value > 31))) return null;
    const arp = sections.find(section => section.startsWith('arp1,'));
    const inputRaw = sections.find(section => section.startsWith('input1,'));
    const keyRaw = sections.find(section => section.startsWith('key1,'));
    const parts = harmony.split(',').map(Number);
    if (parts.length !== 10 || parts.some(value => !Number.isInteger(value)) ||
        [...parts.slice(0, 3), parts[4]].some(value => value < 0 || value > 4095) ||
        (parts[3] !== 0 && parts[3] !== 1) ||
        parts.slice(5).some((value,index) => value < 0 || value >= [7,8,4,9,9][index])) return null;
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
            values[0] < 0 || values[0] > 11 || values[1] < 0 || values[1] > 15 ||
            values[2] < 1 || values[2] > 15 || values.slice(3).some(v => v < 0 || v > 4095)) return null;
        input = {root: values[0], selected: values[1], resolved: values[2], scale: values[3], chord: values[4]};
    }
    let globalScale: HarmonySnapshot['globalScale'];
    if (keyRaw) {
        const fields = keyRaw.split(',');
        const selected = Number(fields[1]), resolved = Number(fields[2]);
        if (fields.length !== 3 || !Number.isInteger(selected) || selected < 0 || selected > 15 ||
            !Number.isInteger(resolved) || resolved < 1 || resolved > 15) return null;
        globalScale = {selected, resolved};
    }
    return { ...(playColor !== undefined ? {playColor} : {}), ...(outputGroups ? {outputGroups} : {}), ...(tonicColorSection ? {tonicColor} : {}), ...(bothColor !== undefined ? {bothColor} : {}), ...(fullLookahead !== undefined ? {fullLookahead} : {}), ...(tonic !== undefined ? {tonic} : {}), ...(colorSection ? {effectiveColor} : {}), ...(globalScale ? {globalScale} : {}), ...(input ? {input} : {}), ...(arpInputs !== undefined ? {arpInputs} : {}), current: parts[0], effective: parts[1], lookahead: parts[4], scale: parts[2], ready: parts[3] === 1, settings: parts.slice(5) };
}

/** Poll one compact snapshot, never once per pad or once per display frame. */
export function refreshHarmonyPads(track: number, now = Date.now()): void {
    if (track !== watchedTrack) { watchedTrack = track; snapshot = null; polledAt = -Infinity; }
    // Gestures invalidate the preview but never perform reads on the MIDI
    // callback. The next LED tick reads once; sustained holds keep the usual
    // bounded cadence so harmony/one-shot changes remain visible too.
    const revision = performancePreviewRevision();
    if (revision === previewRevision && now >= polledAt && now - polledAt < 50) return;
    previewRevision = revision;
    polledAt = now;
    const port = portFor(track);
    requestedPads = Array.from(padMapFor(track));
    const request = requestedPads.map(note => (note < 0 ? 255 : note).toString(16).padStart(2, '0')).join('');
    const raw = port.getParam('midi_fx1:pad_view@' + request) || port.getParam('midi_fx1:pad_view');
    const next = parseHarmonySnapshot(raw || port.getParam('midi_fx1:pad_render'));
    // The shared host parameter slot can miss a read while chains restore or
    // another page is polling. A failed read is not an empty harmony model:
    // retain the last complete frame and retry on the normal bounded cadence.
    if (next) snapshot = next;
    settings = snapshot?.settings || [0,0,0,4,2];
    const input = snapshot?.input;
    const scale = snapshot?.globalScale || input;
    if (scale && (keyboardState.scale !== followerKeyboardScales[scale.resolved - 1] || (input && keyboardState.rootPc !== input.root))) {
        keyboardState.scale = followerKeyboardScales[scale.resolved - 1];
        if (input) keyboardState.rootPc = input.root;
        markUiStateDirty();
        appState.dirty = true;
    }
}

// Append UI scales after existing pentatonic/blues/chromatic IDs: old Sets keep their meaning.
const followerKeyboardScales = [0,1,2,3,4,5,6,7,8,13,14,15,16,17,18];
export function followerScaleIndices(track: number): number[] {
    return watchedTrack === track && snapshot ? followerKeyboardScales : Array.from({length:19},(_,index)=>index);
}

/** Supported input scales for the active follower; other modules keep all scales. */
export function followerInputScaleCount(track: number): number {
    return watchedTrack === track && snapshot ? 15 : 19;
}

/** User edits write once; inferred snapshots never write back or disable Infer. */
export function setFollowerInputScale(track: number, scale: number): void {
    const labels = ['Major','Natural Minor','Dorian','Phrygian','Lydian','Mixolydian','Locrian','Harmonic Minor','Melodic Minor','Dorian b2','Lydian Augmented','Lydian Dominant','Mixolydian b6','Locrian #2','Altered'];
    scale = followerKeyboardScales.indexOf(scale);
    if (watchedTrack !== track || !snapshot || !labels[scale]) return;
    portFor(track).setParam('midi_fx1:follower_scale', labels[scale]);
    polledAt = -Infinity;
}

/** Peaks at phase zero. Independent half-cycle shifts need not sum to one. */
export function harmonyPulse(phase: number, shape: number): number {
    if (shape === 3) return 1;
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

/** Only harmony colors mix. Quantized pulse-off restores the scale background. */
function harmonyMix(background: number, current: number, future: number, first: number, second: number): number {
    first = Math.round(first * 12); second = Math.round(second * 12);
    const total = first + second;
    return total ? paletteMix(0, current, future, first / total, second / total) : background;
}

export function colorHarmonyPitch(pitch: number, inputRoot: number, track: number,
    scale: number, current: number, effective: number, mode: number,
    phase: number, shape: number, currentColor: number, effectiveColor: number, animate: boolean, _outputTonic?: number, bothColor?: number, tonicColor = trackColor(track)): number {
    if (pitch < 0) return 0;
    const pitchClass = pitch % 12;
    const background = pitchClass === inputRoot ? tonicColor : (scale & (1 << pitchClass)) ? C_LIGHTGREY : 0;
    const first = (mode === 1 || mode === 3 || mode === 6) && (current & (1 << pitchClass)) ? (animate ? harmonyPulse(phase, shape) : 1) : 0;
    const second = mode !== 1 && (effective & (1 << pitchClass)) ? (animate ? harmonyPulse(phase + 0.5, shape) : 1) : 0;
    if (!first && !second) return background;
    if ((mode === 3 || mode === 6) && bothColor !== undefined &&
        (current & effective & (1 << pitchClass))) currentColor = effectiveColor = bothColor;
    return harmonyMix(background, currentColor, effectiveColor, first, second);
}

/** Null disables the play overlay and exposes the normal harmony background. */
export function harmonyPlayColor(track: number): number | null {
    const choice = watchedTrack === track ? snapshot?.playColor : undefined;
    if (choice === undefined || choice === 3) return C_GREEN;
    if (choice === 11) return null;
    if (choice === 10) return C_WHITE;
    if (choice === 9) return C_LIGHTGREY;
    return choice === 8 ? trackColor(track) : colors[choice];
}

/** Null leaves non-HarmonyBus tracks using their existing pad background. */
export function harmonyPadColor(pitch: number, track: number, held = false): number | null {
    if (pitch < 0) return 0;
    const mode = settings[0];
    const view = watchedTrack === track ? snapshot : null;
    const tonicChoice = view?.tonicColor ?? 8;
    const tonicColor = tonicChoice === 9 ? C_LIGHTGREY : tonicChoice === 8 ? trackColor(track) : colors[tonicChoice];
    // Exact raw input notes own highlights; generated output never lights pads.
    if (view?.arpInputs !== undefined) {
        if (view.arpInputs.includes(pitch)) {
            const playColor = harmonyPlayColor(track);
            if (playColor !== null) return playColor;
        }
        if (!mode && !view.input) return pitch % 12 === keyboardState.rootPc ? tonicColor :
            inScaleFor(pitch, keyboardState.rootPc, keyboardState.scale) ? C_LIGHTGREY : 0;
    }
    if (!mode && !view?.input) return null;
    if (held && view?.arpInputs === undefined) return C_WHITE;
    let scale = view?.scale || 0;
    if (!view) for (let note = 0; note < 12; note++)
        if (inScaleFor(note, keyboardState.rootPc, keyboardState.scale)) scale |= 1 << note;
    const period = mode === 0 && view?.effectiveColor === undefined ? 0 : periods[settings[1]];
    const beat = seqState.playing ? visualEngineTick() / 96 : Date.now() * seqState.bpmX100 / 6000000;
    // Every mask identifies INPUT keys by their effective RENDERED voices.
    const current = view?.current || 0;
    const effective = mode === 0 || mode === 2 ? (view?.effective || 0) : (mode >= 5 ? (view?.fullLookahead ?? 0) : (view?.ready ? view.lookahead : 0));
    const resolveColor = (choice: number): number => choice === 8 ? trackColor(track) : colors[choice];
    const selectedColor = mode === 0 || mode === 2 ? (view?.playColor !== undefined ? settings[3] : (view?.effectiveColor ?? 8)) : settings[4];
    if ((mode === 0 || mode === 2) && view?.input) {
        const bit = 1 << (pitch % 12), input = view.input;
        const outputScale = view.scale;
        const background = pitch % 12 === input.root ? tonicColor : (outputScale & bit) ? C_LIGHTGREY : 0;
        if (input.chord & bit) return harmonyMix(background, resolveColor(selectedColor), 0, period ? harmonyPulse(beat / period, settings[2]) : 1, 0);
        if (pitch % 12 === input.root || (outputScale & bit)) return background;
        return isPianoLayout(keyboardState.mode, keyboardState.layout) ? C_DARKGREY : 0;
    }
    return colorHarmonyPitch(pitch, keyboardState.rootPc, track, scale, current, effective,
        mode, period ? beat / period : 0, settings[2],
        resolveColor(settings[3]), resolveColor(selectedColor), period > 0, view?.tonic, view?.bothColor ? resolveColor(view.bothColor - 1) : undefined, tonicColor);
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

/** A stable neighboring shade from the hardware palette, without changing hue family. */
const adjacentShades = new Map<number, number>();
function adjacentShade(color: number): number {
    const cached = adjacentShades.get(color); if (cached !== undefined) return cached;
    const original = PAD_PALETTE[color], magnitude = Math.hypot(...original);
    if (!magnitude) return color;
    let best = color, bestError = Infinity;
    for (let candidate=1;candidate<PAD_PALETTE.length;candidate++) {
        const rgb = PAD_PALETTE[candidate], size = Math.hypot(...rgb);
        if (size < magnitude*0.35 || size > magnitude*1.25 || rgb.every((value,index)=>value===original[index])) continue;
        const similarity = rgb.reduce((sum,value,index)=>sum+value*original[index],0)/(size*magnitude);
        if (similarity < 0.94) continue;
        const error = rgb.reduce((sum,value,index)=>sum+(value-original[index]*0.82)**2,0);
        if (error < bestError) { best=candidate;bestError=error; }
    }
    adjacentShades.set(color,best);return best;
}

/** Alternate only at output changes within a same-color horizontal run. */
export function distinguishHarmonyPad(index: number, track: number, color: number): number {
    if (watchedTrack !== track || !snapshot?.outputGroups || !color) return color;
    const map=padMapFor(track), groups=snapshot.outputGroups;
    if (requestedPads.some((note,slot)=>note!==map[slot]) || groups[index]<0) return color;
    let alternate=false, previousColor=-1, previousGroup=-1;
    for(let slot=index-index%8;slot<=index;slot++) {
        const base=slot===index?color:harmonyPadColor(map[slot],track);
        if (base===null || base===0 || groups[slot]<0 || base!==previousColor) alternate=false;
        else if(groups[slot]!==previousGroup) alternate=!alternate;
        previousColor=base ?? -1;previousGroup=groups[slot];
    }
    return alternate?adjacentShade(color):color;
}
