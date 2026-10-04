/** Physical addressing and USB-MIDI encoding; musical rules live in HarmonyBus. */
export type LaunchpadModel = 1 | 2;
export type SurfaceCell = { pitch: number; target: number; row: number };

/** Index zero is bottom left on both generations. */
export function launchpadIndex(model: LaunchpadModel, note: number): number {
    if (model === 1) {
        const column = note % 16, row = Math.floor(note / 16);
        return column < 8 && row < 8 ? (7 - row) * 8 + column : -1;
    }
    const column = note % 10 - 1, row = Math.floor(note / 10) - 1;
    return column >= 0 && column < 8 && row >= 0 && row < 8 ? row * 8 + column : -1;
}

export function launchpadNote(model: LaunchpadModel, index: number): number {
    return model === 1 ? (7 - (index >> 3)) * 16 + index % 8 : ((index >> 3) + 1) * 10 + index % 8 + 1;
}

/** Convert SysEx to complete four-byte USB-MIDI packets, preserving zero data. */
export function sysexPackets(bytes: readonly number[]): number[] {
    const packets: number[] = [];
    for (let offset = 0; offset < bytes.length; offset += 3) {
        const remaining = bytes.length - offset;
        packets.push(remaining > 3 ? 4 : 4 + remaining, bytes[offset], bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0);
    }
    return packets;
}

/** Spatial intent derives from the same Movy layout, expanded to eight rows. */
export function buildSurfaceCells(notes: Int16Array, layout: number, piano: boolean): SurfaceCell[] {
    return Array.from(notes, (pitch, index) => {
        const row = index >> 3, column = index % 8;
        const targetIndex = layout === 3 ? (row & ~3) * 8 + column : index - 8;
        const approach = pitch < 0 && (layout === 3 ? row % 4 > 0 :
            row % 2 === 1 && (layout === 2 || (piano && [0, 3, 7].includes(column))));
        const target = approach ? notes[targetIndex] : -1;
        return { pitch, target: target >= 0 ? target : -1, row: target >= 0 && layout === 3 ? row % 4 : 0 };
    });
}

export function previewPayload(cells: readonly SurfaceCell[], spatial: boolean): string {
    const hex = (value: number): string => value.toString(16).padStart(2, '0');
    return cells.map(cell => hex(cell.pitch < 0 ? 255 : cell.pitch)).join('') + ':' +
        cells.map(cell => hex(cell.target + 1)).join('') + ':' + cells.map(cell => cell.row).join('') + ';' + (spatial ? '1' : '0');
}

/** The legacy red/green palette encodes semantic roles rather than approximating RGB. */
export function legacyColor(color: number, approach: boolean, target: boolean, held: boolean, sounding: boolean): number {
    if (held) return 60; // maximum green
    if (sounding) return 28; // quieter green
    if (approach) return color ? 29 : 0; // dim amber
    if (!color) return 12;
    if ([117, 118, 121, 122, 123, 124].includes(color)) return target ? 44 : 28;
    if (color === 120) return 62; // white target / input feedback
    return target ? 62 : 60; // harmony color, translated to brightness
}
