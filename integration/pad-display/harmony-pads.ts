import { trailEnabled, trailHistory, trailStyle } from '../seq/trail-settings.js';
import { SCALES, FOLLOWER_SCALE_NAMES, FOLLOWER_KEYBOARD_SCALES } from '../scale-catalog.js';
/* Read-only pitch-class visualization. No MIDI generation or modifier consumption. */
import { keyboardState, padMapFor } from './state.js';
import { isPianoLayout, LAYOUT_APPROACH } from './layouts.js';
import { markUiStateDirty } from '../seq/ui-dirty.js';
import { appState } from '../app/state.js';
import { inScaleFor } from '../seq/scales.js';
import { trackColor, C_LIGHTGREY, C_GREEN, C_DARKGREY, C_WHITE } from '../seq/colors.js';
import { portFor } from '../track/registry.js';
import { seqState } from '../seq/state.js';
import { visualEngineTick } from '../seq/engine.js';
import { PAD_PALETTE } from './pad-palette.js';

export type HarmonySnapshot = { targets?: number[]; adjacentShading?: boolean; nextRanks?: number[]; nextPulse?: number; nextPulsePads?: number; playPads?: number; gapColors?: number[]; pianoApproach?: boolean; current: number; effective: number; lookahead: number; scale: number; ready: boolean; settings: number[]; effectiveColor?: number; playColor?: number; tonic?: number; fullLookahead?: number; bothColor?: number; tonicColor?: number; outputGroups?: number[]; arpInputs?: number[]; globalScale?: {selected: number; resolved: number}; input?: {root: number; selected: number; resolved: number; scale: number; chord: number} };
let snapshot: HarmonySnapshot | null = null;
let requestedPads: number[] = [];
let sentPreviewInputs = "";
let settings = [0,3,0,4,2];
let watchedTrack = -1;
let trailNativeEnabled: boolean | null = null, trailBeat=0, trailSampleAt=-Infinity;
let polledAt = -Infinity;
const colors = [127, 3, 7, 126, 13, 125, 22, 25];
const periods = [0, 0.25, 0.5, 1, 2, 4, 8, 16];
const mixes = new Map<string, number>();
let padFrame: {now:number;beat:number} | null = null;
function harmonyNow(): number { return padFrame?.now ?? Date.now(); }
function harmonyBeat(): number {
    if(padFrame)return padFrame.beat;
    const now=harmonyNow();
    return seqState.playing ? visualEngineTick(now) / 96 : now * seqState.bpmX100 / 6000000;
}

/** All pitches and approach pads in a paint use the same pulse phase. */
export function withHarmonyPadFrame<T>(paint: () => T): T {
    const previous = padFrame;
    if(!padFrame){
        const now=Date.now();
        padFrame={now,beat:seqState.playing?visualEngineTick(now)/96:now*seqState.bpmX100/6000000};
    }
    try { return paint(); } finally { padFrame = previous; }
}

export function parseHarmonySnapshot(raw: string | null): HarmonySnapshot | null {
    if (!raw) return null;
    const [harmony, ...sections] = raw.trim().split('|');
    const targetSection=sections.find(section=>section.startsWith('targets1,'));
    const targets=targetSection?.split(',').slice(1).map(Number);
    if(targets&&(targets.length!==32||targets.some(pitch=>!Number.isInteger(pitch)||pitch< -1||pitch>127)))return null;
    const gapSection = sections.find(section => section.startsWith('gapcolors1,'));
    const gapColors = gapSection?.split(',').slice(1).map(Number);
    if (gapColors && (gapColors.length !== 32 || gapColors.some(value => !Number.isInteger(value) || value < -1 || value > 31))) return null;
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
    const pulseSection = sections.find(section => section.startsWith('nextpulse1,'));
    let nextPulse: number | undefined, nextPulsePads: number | undefined;
    if (pulseSection) {
        const fields = pulseSection.split(',');
        nextPulse = Number(fields[1]); nextPulsePads = Number(fields[2]);
        if (fields.length !== 3 || !Number.isInteger(nextPulse) || nextPulse < 0 || nextPulse > 4095 ||
            !Number.isInteger(nextPulsePads) || nextPulsePads < 0 || nextPulsePads > 0xffffffff) return null;
    }
    const shadeSection = sections.find(section => section.startsWith('adjshade1,'));
    if (shadeSection && !['adjshade1,0','adjshade1,1'].includes(shadeSection)) return null;
    const rankSection = sections.find(section => section.startsWith('nextranks1,'));
    const nextRanks = rankSection?.split(',').slice(1).map(Number);
    if (nextRanks && (nextRanks.length !== 4 || nextRanks.some((v,i)=>!Number.isInteger(v)||v<0||v>(i%2?0xffffffff:4095)))) return null;
    const bothSection = sections.find(section => section.startsWith('both1,'));
    const bothColor = bothSection ? Number(bothSection.split(',')[1]) : undefined;
    if (bothSection && (bothSection.split(',').length !== 2 || !Number.isInteger(bothColor) || bothColor! < 0 || bothColor! > 9)) return null;
    const tonicColorSection = sections.find(section => section.startsWith('toniccolor1,'));
    const tonicColor = tonicColorSection ? Number(tonicColorSection.split(',')[1]) : 8;
    if (tonicColorSection && (tonicColorSection.split(',').length !== 2 || !Number.isInteger(tonicColor) || tonicColor < 0 || tonicColor > 9)) return null;
    const playingSection = sections.find(section => section.startsWith('playpads1,'));
    const playPads = playingSection ? Number(playingSection.split(',')[1]) : undefined;
    if (playingSection && (playingSection.split(',').length !== 2 || !Number.isInteger(playPads) || playPads! < 0 || playPads! > 0xffffffff)) return null;
    const flashSection = sections.find(section => section.startsWith('playflash1,'));
    const playFlash = flashSection ? Number(flashSection.split(',')[1]) : 0;
    if (flashSection && (flashSection.split(',').length !== 2 || !Number.isInteger(playFlash) || playFlash < 0 || playFlash > 0xffffffff)) return null;
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
        parts.slice(5).some((value,index) => value < 0 || value >= [8,8,4,9,9][index])) return null;
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
            values[0] < 0 || values[0] > 11 || values[1] < 0 || values[1] > FOLLOWER_SCALE_NAMES.length ||
            values[2] < 1 || values[2] > FOLLOWER_SCALE_NAMES.length || values.slice(3).some(v => v < 0 || v > 4095)) return null;
        input = {root: values[0], selected: values[1], resolved: values[2], scale: values[3], chord: values[4]};
    }
    let globalScale: HarmonySnapshot['globalScale'];
    if (keyRaw) {
        const fields = keyRaw.split(',');
        const selected = Number(fields[1]), resolved = Number(fields[2]);
        if (fields.length !== 3 || !Number.isInteger(selected) || selected < 0 || selected > FOLLOWER_SCALE_NAMES.length ||
            !Number.isInteger(resolved) || resolved < 1 || resolved > FOLLOWER_SCALE_NAMES.length) return null;
        globalScale = {selected, resolved};
    }
    const piano = sections.find(section => section.startsWith('piano1,'));
    if (piano && !['piano1,0','piano1,1'].includes(piano)) return null;
    return { ...(targets ? {targets} : {}), ...(shadeSection ? {adjacentShading:shadeSection==='adjshade1,1'} : {}), ...(nextRanks ? {nextRanks} : {}), ...(nextPulse !== undefined ? {nextPulse, nextPulsePads} : {}), ...(playPads !== undefined ? {playPads: (playPads | playFlash) >>> 0} : {}), ...(gapColors ? {gapColors} : {}), ...(piano ? {pianoApproach: piano === 'piano1,1'} : {}), ...(playColor !== undefined ? {playColor} : {}), ...(outputGroups ? {outputGroups} : {}), ...(tonicColorSection ? {tonicColor} : {}), ...(bothColor !== undefined ? {bothColor} : {}), ...(fullLookahead !== undefined ? {fullLookahead} : {}), ...(tonic !== undefined ? {tonic} : {}), ...(colorSection ? {effectiveColor} : {}), ...(globalScale ? {globalScale} : {}), ...(input ? {input} : {}), ...(arpInputs !== undefined ? {arpInputs} : {}), current: parts[0], effective: parts[1], lookahead: parts[4], scale: parts[2], ready: parts[3] === 1, settings: parts.slice(5) };
}

/** Poll one compact snapshot, never once per pad or once per display frame. */
export function refreshHarmonyPads(track: number, now = Date.now()): void {
    if (track !== watchedTrack) { watchedTrack = track; snapshot = null; polledAt = -Infinity; sentPreviewInputs = ""; trailNativeEnabled=null;trailHistory.clear();trailSampleAt=-Infinity; }
    // Coalesce gesture bursts too: display feedback may lag by at most 50 ms,
    // but rapid input must not increase synchronous host snapshot traffic.
    if (now >= polledAt && now - polledAt < 50) return;
    polledAt = now;
    const port = portFor(track);
    const trails=trailEnabled();
    if(trailNativeEnabled!==trails&&port.setParam('midi_fx1:trail_enable',trails?'1':'0')!==false)trailNativeEnabled=trails;
    requestedPads = Array.from(padMapFor(track));
    const request = requestedPads.map(note => (note < 0 ? 255 : note).toString(16).padStart(2, '0')).join('');
    const targets = requestedPads.map((_, index) => pianoApproachTarget(track, index));
    const suffix = targets.some(target => target >= 0)
        ? ':' + targets.map(target => (target + 1).toString(16).padStart(2, '0')).join('') : '';
    // Layout payloads belong in the value channel: host parameter keys are
    // limited to 64 bytes including routing prefixes. No playback state changes.
    const payload = request + suffix;
    if (payload !== sentPreviewInputs || (settings[0] !== 7 && !snapshot?.outputGroups)) {
        if (port.setParam('midi_fx1:pad_preview_inputs', payload) !== false) sentPreviewInputs = payload;
    }
    const raw = port.getParam('midi_fx1:pad_view');
    const next = parseHarmonySnapshot(raw || port.getParam('midi_fx1:pad_render'));
    if(trails&&next){
        const time=trailHistory.readSnapshot(raw?.split('|').find(section=>section.startsWith('th1,'))||'');
        if(time!==null){trailBeat=time;trailSampleAt=now;}
    }
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
const followerKeyboardScales = FOLLOWER_KEYBOARD_SCALES;
export function followerScaleIndices(track: number): number[] {
    return watchedTrack === track && snapshot ? followerKeyboardScales : Array.from({length:SCALES.length},(_,index)=>index);
}

/** Supported input scales for the active follower; other modules keep all scales. */
export function followerInputScaleCount(track: number): number {
    return watchedTrack === track && snapshot ? FOLLOWER_SCALE_NAMES.length : SCALES.length;
}

/** User edits write once; inferred snapshots never write back or disable Infer. */
export function setFollowerInputScale(track: number, scale: number): void {
    const labels = FOLLOWER_SCALE_NAMES;
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

/** Tone selection has its own smooth brightness pulse, independent of general shape. */
function nextTonePulse(background: number, selected: boolean, track: number, rank = 0): number {
    const period = periods[settings[1]];
    const mode = settings[0];
    if (!selected || !period || mode === 1 || ((mode === 3 || mode === 4) && !snapshot?.ready)) return background;
    const choice = mode === 0 || mode === 2 ? settings[3] : settings[4];
    const color = choice === 8 ? trackColor(track) : colors[choice];
    const peak = rank === 2 ? 0.55 : rank === 1 ? 0.75 : 1;
    const floor = 0.5 * peak;
    return paletteMix(0, color, 0, floor + (peak - floor) * harmonyPulse(harmonyBeat() / period, 0), 0);
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
export function harmonyPadColor(pitch: number, track: number, held = false, resting = false): number | null {
    if (pitch < 0) return 0;
    const mode = settings[0];
    const view = watchedTrack === track ? snapshot : null;
    const tonicChoice = view?.tonicColor ?? 8;
    const tonicColor = tonicChoice === 9 ? C_LIGHTGREY : tonicChoice === 8 ? trackColor(track) : colors[tonicChoice];
    // Older HB exposes source owners only; current HB supplies actual sounding pads.
    if (!resting && view?.arpInputs !== undefined && view.playPads === undefined) {
        if (view.arpInputs.includes(pitch)) {
            const playColor = harmonyPlayColor(track);
            if (playColor !== null) return playColor;
        }
        if (!mode && !view.input) return pitch % 12 === keyboardState.rootPc ? tonicColor :
            inScaleFor(pitch, keyboardState.rootPc, keyboardState.scale) ? C_LIGHTGREY : 0;
    }
    if (mode === 7) {
        const root=view?.input?.root ?? keyboardState.rootPc;
        const scale=view?.input?.scale;
        const background=pitch % 12 === root ? tonicColor :
            (scale !== undefined ? !!(scale & (1 << (pitch % 12))) : inScaleFor(pitch,root,keyboardState.scale)) ? C_LIGHTGREY : 0;
        return !resting && held ? (harmonyPlayColor(track) ?? background) : background;
    }
    if (!mode && !view?.input) return null;
    if (!resting && held && view?.arpInputs === undefined) return C_WHITE;
    let scale = view?.scale || 0;
    if (!view) for (let note = 0; note < 12; note++)
        if (inScaleFor(note, keyboardState.rootPc, keyboardState.scale)) scale |= 1 << note;
    // A tone selection owns animation; the underlying harmony colors stay steady.
    const period = resting || view?.nextPulse !== undefined || (mode === 0 && view?.effectiveColor === undefined) ? 0 : periods[settings[1]];
    const beat = harmonyBeat();
    // Every mask identifies INPUT keys by their effective RENDERED voices.
    const current = view?.current || 0;
    const effective = mode === 0 || mode === 2 ? (view?.effective || 0) : (mode >= 5 ? (view?.fullLookahead ?? 0) : (view?.ready ? view.lookahead : 0));
    const resolveColor = (choice: number): number => choice === 8 ? trackColor(track) : colors[choice];
    const selectedColor = mode === 0 || mode === 2 ? (view?.playColor !== undefined ? settings[3] : (view?.effectiveColor ?? 8)) : settings[4];
    const bit = 1 << (pitch % 12), ranks = view?.nextRanks;
    const rank = ranks && (ranks[2] & bit) ? 2 : ranks && (ranks[0] & bit) ? 1 : 0;
    const pulse = (color: number): number => resting ? color : nextTonePulse(color, !!((view?.nextPulse ?? 0) & bit), track, rank);
    if ((mode === 0 || mode === 2) && view?.input) {
        const bit = 1 << (pitch % 12), input = view.input;
        const outputScale = view.scale;
        const background = pitch % 12 === input.root ? tonicColor : (outputScale & bit) ? C_LIGHTGREY : 0;
        if (input.chord & bit) return pulse(harmonyMix(background, resolveColor(selectedColor), 0, period ? harmonyPulse(beat / period, settings[2]) : 1, 0));
        if (pitch % 12 === input.root || (outputScale & bit)) return pulse(background);
        return pulse(isPianoLayout(keyboardState.mode, keyboardState.layout) ? C_DARKGREY : 0);
    }
    return pulse(colorHarmonyPitch(pitch, keyboardState.rootPc, track, scale, current, effective,
        mode, period ? beat / period : 0, settings[2],
        resolveColor(settings[3]), resolveColor(selectedColor), period > 0, view?.tonic, view?.bothColor ? resolveColor(view.bothColor - 1) : undefined, tonicColor));
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

/** Store the column pattern from resting colors; animation never changes it. */
let shadeSignature = '';
let shadePattern = 0;
let shadeSnapshot: HarmonySnapshot | null = null;
let shadeLayout = '';
function updateShadePattern(track: number): void {
    if (!snapshot?.outputGroups) { shadePattern=0; return; }
    const layout=[track,keyboardState.rootPc,keyboardState.mode,keyboardState.layout,trackColor(track)].join(':');
    if (shadeSnapshot===snapshot && shadeLayout===layout) return;
    shadeSnapshot=snapshot;shadeLayout=layout;
    const map=padMapFor(track), groups=snapshot.outputGroups;
    const signature=JSON.stringify([layout,Array.from(map),groups,snapshot.current,snapshot.effective,
        snapshot.lookahead,snapshot.fullLookahead,snapshot.scale,snapshot.ready,snapshot.tonicColor,
        snapshot.bothColor,snapshot.effectiveColor,snapshot.playColor!==undefined,snapshot.input,
        snapshot.gapColors,snapshot.pianoApproach,settings[0],settings[3],settings[4]]);
    if(signature===shadeSignature)return;
    shadeSignature=signature;shadePattern=0;
    if(requestedPads.some((note,slot)=>note!==map[slot]))return;
    let alternate=false, previousColor=-1, previousGroup=-1;
    for(let slot=0;slot<32;slot++) {
        const base=map[slot]<0?harmonyApproachColor(slot,track,false,true):harmonyPadColor(map[slot],track,false,true);
        if(slot%8===0||base===null||base===0||groups[slot]<0||base!==previousColor)alternate=false;
        else if(groups[slot]!==previousGroup)alternate=!alternate;
        if(alternate)shadePattern|=1<<slot;
        previousColor=base??-1;previousGroup=groups[slot];
    }
}
export function trailPadColor(index:number,track:number,color:number):number{
    if(!trailEnabled()||track!==watchedTrack||!Number.isFinite(trailSampleAt))return color;
    const pitch=snapshot?.targets?.[index];if(pitch===undefined||pitch<0)return color;
    const style=trailStyle(),beat=trailBeat+Math.max(0,harmonyNow()-trailSampleAt)*seqState.bpmX100/6000000;
    if(!style.approachRows&&pianoApproachTarget(track,index)>=0)return color;
    let intensity=trailHistory.intensity(pitch,beat,style.settings);
    if(style.pulse&&intensity>0)intensity=Math.max((style.settings.floor??0)*style.settings.strength,intensity*(0.5+0.5*Math.cos(2*Math.PI*harmonyBeat()/style.pulse)));
    return intensity>=1?style.color:intensity>0?paletteMix(style.blend?color:0,style.color,0,intensity,0):color;
}
/** One final color order: harmony/pulse, trail, play highlight, row brightness. */
export function finishPadColor(index:number,track:number,background:number,brightness=1,includeTrail=true,input?:boolean):number{
    let color=includeTrail?trailPadColor(index,track,background):background;
    if(input!==undefined){
        const play=harmonyPlayColor(track);
        if(play!==null&&(hasHarmonyPlayback(track)?harmonyPadPlaying(track,index):input))color=play;
    }
    return brightness<1?paletteMix(0,color,0,brightness,0):color;
}
export function distinguishHarmonyPad(index: number, track: number, color: number): number {
    if(watchedTrack!==track||!snapshot?.adjacentShading||!snapshot.outputGroups||!color)return color;
    updateShadePattern(track);
    return (shadePattern>>>index)&1?adjacentShade(color):color;
}

/** Only real piano gaps become approaches; out-of-range keys remain silent. */
export function pianoApproachTarget(track: number, index: number): number {
    if (seqState.holdStep >= 0 || watchedTrack !== track || !snapshot?.pianoApproach || (!isPianoLayout(keyboardState.mode, keyboardState.layout) && keyboardState.layout !== LAYOUT_APPROACH)) return -1;
    if (index < 0 || index >= 32 || ![1,3].includes(index >> 3) || (keyboardState.layout !== LAYOUT_APPROACH && ![0,3,7].includes(index % 8))) return -1;
    const map = padMapFor(track);
    return map[index] === -1 && map[index - 8] >= 0 ? map[index - 8] : -1;
}

/** Separate onset ownership lets an approach overlap its resolving pad. */
export function pianoApproachIdentity(target: number): number {
    return target < 64 ? target + 36 : target - 36;
}

/** Use native rendered membership for explicit approaches, including scale overlaps. */
export function harmonyApproachColor(index: number, track: number, held = false, restingOnly = false): number {
    const target = pianoApproachTarget(track, index);
    if (target < 0 || watchedTrack !== track || !snapshot) return 0;
    const identity = pianoApproachIdentity(target);
    const rowBrightness = padRowBrightness(index,track);
    if (!restingOnly && snapshot.playPads === undefined && (held || snapshot.arpInputs?.includes(identity))) {
        const play = harmonyPlayColor(track);
        if (play !== null) return finishPadColor(index,track,play,rowBrightness,false);
    }
    if (settings[0] === 7) {
        return restingOnly?finishPadColor(index,track,C_DARKGREY,rowBrightness,false):harmonyPlaybackColor(C_DARKGREY,track,index,held);
    }
    const flags = snapshot.gapColors?.[index] ?? -1;
    if (flags < 0) return 0; // Older HB has no approach-membership snapshot.
    const mode = settings[0], period = restingOnly || snapshot.nextPulse !== undefined ? 0 : periods[settings[1]];
    const beat = harmonyBeat();
    const selected = mode === 0 || mode === 2 ? 2 : mode >= 5 ? 16 : 8;
    const resolve = (choice: number): number => choice === 8 ? trackColor(track) : colors[choice];
    const background = colorHarmonyPitch(0, 1, track, flags & 4 ? 1 : 0, flags & 1,
        flags & selected ? 1 : 0, mode, period ? beat / period : 0, settings[2],
        resolve(settings[3]), resolve(mode === 0 || mode === 2 ? settings[3] : settings[4]),
        period > 0, undefined, snapshot.bothColor ? resolve(snapshot.bothColor - 1) : undefined);
    if (restingOnly) return finishPadColor(index,track,background,rowBrightness,false);
    const ranks = snapshot.nextRanks;
    const rank = ranks && ((ranks[3] >>> index) & 1) ? 2 : ranks && ((ranks[1] >>> index) & 1) ? 1 : 0;
    return harmonyPlaybackColor(nextTonePulse(background, !!(((snapshot.nextPulsePads ?? 0) >>> index) & 1), track, rank), track, index, held);
}

/** Final output membership is distinct from live and recorded source input. */
export function hasHarmonyPlayback(track: number): boolean {
    return watchedTrack === track && snapshot?.playPads !== undefined;
}
export function harmonyPadPlaying(track: number, index: number): boolean {
    if (!hasHarmonyPlayback(track) || index < 0 || index >= 32) return false;
    const map = padMapFor(track);
    if (requestedPads.some((note, slot) => note !== map[slot])) return false;
    return ((snapshot!.playPads! >>> index) & 1) !== 0;
}

/** Row brightness is a final stage, including played-note highlights. */
function padRowBrightness(index:number,track:number):number{
    return (keyboardState.layout===LAYOUT_APPROACH||keyboardState.layout===3)&&pianoApproachTarget(track,index)>=0?1/3:1;
}
export function harmonyPlaybackColor(background: number, track: number, index: number, input: boolean): number {
    return finishPadColor(index,track,background,padRowBrightness(index,track),true,input);
}
