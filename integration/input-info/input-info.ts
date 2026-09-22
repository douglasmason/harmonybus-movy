/** Quiet clip diagnostics. Poll only while Clip Parameters is open. */
import { appState, VIEW_CLIP_PARAMS, trackIsDrum } from '../app/state.js';
import { seqState, activeHasNote } from './state.js';
import { padMapFor } from '../keyboard/state.js';
import { midiNoteName } from '../keyboard/notes.js';

export type ClipInputInfo = { kind: string; source: string; target: string };
const scales = ['', 'Maj', 'Min', 'Dor', 'Phr', 'Lyd', 'Mix', 'Loc', 'HMin', 'MMin', 'Dor b2', 'Lyd Aug', 'Lyd Dom', 'Mix b6', 'Loc #2', 'Alt'];
function keyName(root: number, scale: number): string {
    return root >= 0 && root < 12 && scale > 0 && scale < scales.length
        ? midiNoteName(root).replace(/-?\d+$/, '') + ' ' + scales[scale] : '';
}
let watched = -1, lastRead = -Infinity, snapshot = '';
export function refreshClipInputInfo(): void {
    const track = appState.activeTrack.index;
    if (appState.currentView !== VIEW_CLIP_PARAMS || trackIsDrum(track)) {
        watched = -1; snapshot = ''; return;
    }
    const now = Date.now();
    if (watched === track && now >= lastRead && now - lastRead < 250) return;
    watched = track; lastRead = now;
    const next = typeof host_module_get_param === 'function' ? host_module_get_param('clip_input_info') ?? '' : '';
    if (next !== snapshot) { snapshot = next; appState.dirty = true; }
}
export function clipInputInfo(): ClipInputInfo | null {
    const fields = snapshot.split(',');
    if (watched !== appState.activeTrack.index || fields.length !== 7 || fields[0] !== 'ci1' ||
        Number(fields[1]) !== watched || !['fixed', 'mapped', 'rendered', 'mixed'].includes(fields[2])) return null;
    return { kind: fields[2], source: keyName(Number(fields[3]), Number(fields[4])),
        target: keyName(Number(fields[5]), Number(fields[6])) };
}
/** Exact pitches, like the green LEDs; never substitute a nearby scale pad. */
export function offLayoutNotes(): number[] {
    const track = appState.activeTrack.index;
    if (!seqState.playing || trackIsDrum(track)) return [];
    const visible = new Set(padMapFor(track));
    const notes: number[] = [];
    for (let pitch = 0; pitch < 128; pitch++)
        if (activeHasNote(track, pitch) && !visible.has(pitch)) notes.push(pitch);
    return notes;
}
export function offLayoutText(notes: number[]): string {
    return notes.slice(0, 3).map(midiNoteName).join(' ') + (notes.length > 3 ? ' +' + (notes.length - 3) : '');
}
