"""Install optional global harmony pad colors into pinned Movy."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_harmony_pads(root: Path) -> None:
    """Add read-only polling, palette animation and persistent public controls."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/pad-display'
    for name in ['harmony-pads.ts', 'pad-palette.ts']:
        (root / 'src/keyboard' / name).write_text((assets / name).read_text())
    path: Path = root / 'src/seq/pads.ts'
    source: str = path.read_text()
    source = "import { harmonyPadColor } from '../keyboard/harmony-pads.js';\nexport { harmonyPadColor, colorHarmonyPitch, harmonyPulse, parseHarmonySnapshot, refreshHarmonyPads } from '../keyboard/harmony-pads.js';\n" + source
    source = replace_once(source, '    if (pitch < 0) return C_BLACK;', '''    if (pitch < 0) return C_BLACK;
    const harmonyColor = harmonyPadColor(pitch, track);
    if (harmonyColor !== null) return harmonyColor;''')
    path.write_text(source)
    path = root / 'src/keyboard/handler.ts'
    source = "import { harmonyPadColor } from './harmony-pads.js';\n" + path.read_text()
    source = replace_once(source, 'setLED(padNote, C_GREEN, true); // immediate green feedback before the next poll',
        'setLED(padNote, harmonyPadColor(midiNote, track) ?? C_GREEN, true); // preserve harmony backgrounds on the immediate path')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = "import { refreshHarmonyPads } from '../keyboard/harmony-pads.js';\n" + path.read_text()
    source = replace_once(source, '        const map       = padMapFor(track);', '        refreshHarmonyPads(track);\n        const map       = padMapFor(track);')
    path.write_text(source)
    (root / 'browser-test/hb-pad-colors.mjs').write_text((assets / 'hb-pad-colors.mjs').read_text())
