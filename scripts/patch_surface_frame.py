"""Allow the external adapter to supply one canonical Move/Launchpad frame."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_surface_frame(root: Path) -> None:
    """Share the existing parser, trail bookkeeping and bounded poll cadence."""
    path: Path = root / 'src/keyboard/harmony-pads.ts'
    source: str = path.read_text()
    source = replace_once(source, 'let snapshot: HarmonySnapshot | null = null;', '''let snapshot: HarmonySnapshot | null = null;
let surfaceFrameReader: ((track: number, now: number) => string | null | undefined) | null = null;
/** Undefined declines ownership; null retains the last frame after a failed read. */
export function setSurfaceFrameReader(reader: typeof surfaceFrameReader): void { surfaceFrameReader = reader; polledAt = -Infinity; }
''')
    source = replace_once(source, "    const raw = port.getParam('midi_fx1:pad_view');", '''    const shared = surfaceFrameReader?.(track, now);
    const raw = shared === undefined ? port.getParam('midi_fx1:pad_view') : shared;''')
    source = replace_once(source, "    const next = parseHarmonySnapshot(raw || port.getParam('midi_fx1:pad_render'));", "    const next = parseHarmonySnapshot(raw || (shared === undefined ? port.getParam('midi_fx1:pad_render') : null));")
    source = replace_once(source, 'let padFrame: {now:number;beat:number} | null = null;', '''let padFrame: {now:number;beat:number} | null = null;
let steadySurface = false;
/** External surfaces keep pulse peaks steady without altering Move settings. */
export function withSteadyHarmonyLights<T>(paint: () => T): T {
    const previous = steadySurface;
    steadySurface = true;
    try { return paint(); } finally { steadySurface = previous; }
}''')
    source = replace_once(source, '    if (shape === 3) return 1;', '    if (steadySurface || shape === 3) return 1;')
    source = replace_once(source, 'if(style.pulse&&intensity>0)', 'if(!steadySurface&&style.pulse&&intensity>0)')
    path.write_text(source)
