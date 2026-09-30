import { appState } from '../app/state.js';
import { setNativeTrackColors } from './colors.js';
import { PAD_PALETTE } from '../keyboard/pad-palette.js';

// Optional since Schwung 1.6. Older hosts keep the bounded Song.abl fallback.
declare function host_get_move_info(): {
    valid: boolean | number;
    tracks: { colorId: number }[];
} | null;

// Move Song.abl color IDs are NOT MIDI palette indices. Reference RGB values:
// https://github.com/charlesvestal/extending-move/blob/main/core/pad_colors.py
const SONG_RGB: readonly (readonly number[] | null)[] = [null,
    [255,25,23],[255,142,12],[255,98,41],[255,186,115],[215,74,9],
    [231,231,127],[255,233,94],[192,255,112],[135,255,109],[93,219,32],
    [161,206,47],[106,237,196],[0,206,197],[0,212,198],[29,247,243],
    [113,167,231],[34,133,240],[125,87,229],[34,171,240],[150,139,233],
    [178,139,233],[223,139,233],[199,90,214],[247,35,141],[227,95,200],
];
// Native lime/green IDs must stay in the hardware's green family. Raw RGB
// distance picked Muted Teal (13) for green and unrelated dim hues for lime.
const NATIVE_GREENS: Readonly<Record<number, readonly [number, number]>> = {
    8: [9, 81],   // light lime -> Bright Lime / its dim partner
    9: [10, 83],  // light green -> Dull Green / its dim partner
    10: [11, 85], // green -> Neon Green / its dim partner
    11: [9, 81],  // yellow-green -> Bright Lime / its dim partner
};
let loadedIdentity = '';
let retryIndex = 0, refreshStartedAt = 0, nextReadAt = Infinity;
let loadedColors = '';
const RETRY_DELAYS = [1000, 3000, 8000, 20000];

function nearest(rgb: readonly number[], brightness: number): number {
    let best = 1, distance = Infinity;
    for (let index = 1; index < 117; index++) {
        const candidate = PAD_PALETTE[index];
        const score = candidate.reduce((sum, value, channel) => sum + (value - rgb[channel] * brightness) ** 2, 0);
        if (score < distance) { best = index; distance = score; }
    }
    return best;
}

/** Validate the complete four-track assignment before replacing any colors. */
export function songTrackColors(raw: string): [number, number][] | null {
    try {
        const song = JSON.parse(raw);
        if (!Array.isArray(song.tracks) || song.tracks.length !== 4) return null;
        const ids = song.tracks.map((track: any) => track?.color);
        if (!ids.every((id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0 && id < SONG_RGB.length)) return null;
        return ids.map((id: number) => {
            const green = NATIVE_GREENS[id];
            if (green) return [green[0], green[1]];
            const rgb = SONG_RGB[id]!;
            return [nearest(rgb, 1), nearest(rgb, 0.35)];
        });
    } catch (_) { return null; }
}

/** Prefer Move's live colors; fall back to bounded saved-file refresh. */
export function syncNativeTrackColors(uuid: string, name: string, force = false): void {
    if (!uuid || uuid.startsWith('_') || !/^[A-Za-z0-9_-]+$/.test(uuid)) return;
    const identity = uuid + '\n' + name;
    const now = Date.now();
    const changedSet = identity !== loadedIdentity;
    if (changedSet) {setNativeTrackColors(null);loadedColors='';appState.dirty=true;}
    try {
        const info = typeof host_get_move_info === 'function' ? host_get_move_info() : null;
        if (info && (info.valid === true || info.valid === 1) && Array.isArray(info.tracks)) {
            const colors = songTrackColors(JSON.stringify({tracks: info.tracks.map(track => ({color: track.colorId}))}));
            if (colors) {
                const signature = JSON.stringify(colors);
                if (signature !== loadedColors) {setNativeTrackColors(colors);loadedColors=signature;appState.dirty=true;}
                loadedIdentity = identity;
                // If live data later disappears, allow a fresh bounded fallback.
                nextReadAt = 0; retryIndex = 0; refreshStartedAt = now;
                return;
            }
        }
    } catch (_) { /* Missing/temporarily unavailable host data uses the saved file. */ }
    if (!force && !changedSet && now < nextReadAt) return;
    if (force || changedSet) {retryIndex=0;refreshStartedAt=now;}
    nextReadAt = retryIndex < RETRY_DELAYS.length ? refreshStartedAt + RETRY_DELAYS[retryIndex++] : Infinity;
    loadedIdentity = identity;
    if (typeof host_read_file !== 'function') return;
    const root = '/data/UserData/UserLibrary/Sets/' + uuid;
    const paths = [root + '/Song.abl'];
    if (name && !/[\\/\x00-\x1f]/.test(name) && name !== '.' && name !== '..') paths.unshift(root + '/' + name + '/Song.abl');
    for (const path of paths) {
        const raw = host_read_file(path);
        if (!raw) continue;
        const colors = songTrackColors(raw);
        if (colors) {
            const signature = JSON.stringify(colors);
            if(signature!==loadedColors){setNativeTrackColors(colors);loadedColors=signature;appState.dirty=true;}
            return;
        }
    }
}
