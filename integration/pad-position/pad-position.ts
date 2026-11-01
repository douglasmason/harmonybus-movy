/** Horizontal placement belongs to the keyboard, independently of its key. */
import { appState, trackIsDrum } from '../app/state.js';
import { keyboardState, baseNoteFor, COLUMN_OFFSET_MIN, COLUMN_OFFSET_MAX } from '../keyboard/state.js';
import { midiNoteName } from '../keyboard/notes.js';
import { beginPositionHighlight } from '../keyboard/position-highlight.js';
import { invalidateHarmonyPadGeometry } from '../keyboard/harmony-pads.js';
import { padsPlayNotes } from './router-pads.js';
import { anyStepHeld } from './step-edit.js';
import { stepRecActive } from './step-rec.js';
import { jointActive } from './joint-play.js';
import { chordPadModalActive } from './chord-play.js';
import { inputModeSelectorOpen } from './router-buttons.js';
import { markUiStateDirty } from './ui-dirty.js';
import { seqToast } from './render.js';

/** The input dispatcher and button lights must use exactly the same owner. */
export function padPositionActive(): boolean {
    return padsPlayNotes() && (jointActive() || !trackIsDrum(appState.activeTrack.index))
        && !stepRecActive() && !anyStepHeld() && !inputModeSelectorOpen() && !chordPadModalActive();
}

export function canShiftPadPosition(direction: number): boolean {
    const next = keyboardState.columnOffset + direction;
    return (direction === -1 || direction === 1) && next >= COLUMN_OFFSET_MIN && next <= COLUMN_OFFSET_MAX;
}

export function padPositionLabel(): string {
    const offset = keyboardState.columnOffset;
    return offset === 0 ? 'Default' : Math.abs(offset) + (offset > 0 ? ' right' : ' left');
}

/** Preview the current geometry even when a navigation limit prevents movement. */
export function showPadPosition(): void {
    beginPositionHighlight();
    appState.dirty = true;
    seqToast('Pad position: ' + padPositionLabel());
}

/** Absolute tonic register, independent of the horizontally shifted left pad. */
export function showPadOctave(): void {
    if (!padPositionActive()) return;
    beginPositionHighlight();
    appState.dirty = true;
    const track = appState.activeTrack.index;
    seqToast('T' + (track + 1) + ' tonic ' + midiNoteName(baseNoteFor(track)));
}

/** One setter for arrows, settings and reset; held notes retain their owners. */
export function setPadPosition(offset: number): boolean {
    if (!Number.isFinite(offset)) return false;
    const next = Math.max(COLUMN_OFFSET_MIN, Math.min(COLUMN_OFFSET_MAX, Math.round(offset)));
    if (next === keyboardState.columnOffset) return false;
    keyboardState.columnOffset = next;
    invalidateHarmonyPadGeometry();
    markUiStateDirty();
    showPadPosition();
    return true;
}

/** Move the notes in the arrow's direction; existing note owners stay intact. */
export function shiftPadPosition(direction: number): boolean {
    return canShiftPadPosition(direction) && setPadPosition(keyboardState.columnOffset + direction);
}

/** Consume releases and blocked endpoints too, so they cannot switch panels. */
export function padPositionMidi(data: number[]): boolean {
    if ((data[0] & 240) !== 176 || ![62, 63].includes(data[1]) || !padPositionActive()) return false;
    if (data[2] && !shiftPadPosition(data[1] === 63 ? 1 : -1)) showPadPosition();
    return true;
}
