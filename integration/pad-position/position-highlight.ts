/** A brief geometry cue, shared by Move and external surfaces. No MIDI or host reads. */
import { keyboardState } from './state.js';
import { appState } from '../app/state.js';
import { currentSetUuid, currentGen } from '../seq/set-session.js';

export const POSITION_HIGHLIGHT_MS = 1200;
let expires = 0;
let started = 0;
let owner = -1;
let set = '';
let generation = -1;
let root = -1, scale = -1, mode = -1, layout = -1, offset = 0;

export function beginPositionHighlight(now = Date.now()): void {
    started = now;
    expires = now + POSITION_HIGHLIGHT_MS;
    owner = appState.activeTrack.index;
    set = currentSetUuid();
    generation = currentGen();
    ({rootPc: root, scale, mode, layout, columnOffset: offset} = keyboardState);
}

/** Approach targets extend the tonic cue through its column; other layouts
 * highlight actual tonic pads, so a fourths grid never marks unrelated notes. */
export function positionHighlight(pitch: number, target = -1, now = Date.now()): boolean {
    if (!expires) return false;
    if (now < started || now >= expires || owner !== appState.activeTrack.index ||
        set !== currentSetUuid() || generation !== currentGen() || root !== keyboardState.rootPc || scale !== keyboardState.scale ||
        mode !== keyboardState.mode || layout !== keyboardState.layout || offset !== keyboardState.columnOffset) {
        expires = 0;
        return false;
    }
    const note = target >= 0 ? target : pitch;
    return note >= 0 && note % 12 === root;
}
