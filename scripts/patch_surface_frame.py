"""Hold external pulses steady using the canonical harmony renderer."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_surface_frame(root: Path) -> None:
    """Leave native snapshot polling unchanged and scope only external animation."""
    path: Path = root / 'src/keyboard/harmony-pads.ts'
    source: str = path.read_text()
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
