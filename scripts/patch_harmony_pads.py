"""Install optional global harmony pad colors into pinned Movy."""
import base64
import json
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_harmony_pads(root: Path) -> None:
    """Add read-only polling, palette animation and persistent public controls."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/pad-display'
    for name in ['harmony-pads.ts', 'pad-palette.ts']:
        (root / 'src/keyboard' / name).write_text((assets / name).read_text())
    path: Path = root / 'src/seq/pads.ts'
    source: str = path.read_text()
    source = "import { harmonyPadColor } from '../keyboard/harmony-pads.js';\nexport { colorHarmonyPitch, harmonyPulse, parseHarmonySnapshot, refreshHarmonyPads } from '../keyboard/harmony-pads.js';\n" + source
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
    path = root / 'src/seq/flags-def.ts'
    source = path.read_text()
    controls: str = '''
    { key: 'padDisplay', name: 'Pad Colors', min: 0, max: 3, def: 0,
      labels: ['Standard', 'Current', 'Effective', 'Both'], hint: 'Harmony pad colors.', release: true, uiOnly: true },
    { key: 'padPulseRate', name: 'Pad Pulse Rate', min: 0, max: 7, def: 3,
      labels: ['Off', '1/16', '1/8', '1/4', '1/2', '1 Bar', '2 Bars', '4 Bars'], hint: 'One color pulse cycle.', release: true, uiOnly: true },
    { key: 'padPulseShape', name: 'Pad Pulse Shape', min: 0, max: 2, def: 0,
      labels: ['Smooth', 'Triangle', 'Square'], hint: 'Harmony pulse shape.', release: true, uiOnly: true },
    { key: 'padCurrentColor', name: 'Current Color', min: 0, max: 7, def: 4,
      labels: ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink'], hint: 'Current chord color.', release: true, uiOnly: true },
    { key: 'padEffectiveColor', name: 'Lookahead Color', min: 0, max: 7, def: 2,
      labels: ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink'], hint: 'Effective chord color.', release: true, uiOnly: true },
'''
    source = replace_once(source, '\n];\n\nexport function flagDef', controls + '\n];\n\nexport function flagDef')
    path.write_text(source)
    path = root / 'browser-test/logic/flags.mjs'
    source = path.read_text().replace("relKeys(), 'chtracks,chtrackset'", "relKeys(), 'chtracks,chtrackset,padDisplay,padPulseRate,padPulseShape,padCurrentColor,padEffectiveColor'")
    path.write_text(source)
    (root / 'browser-test/hb-pad-colors.mjs').write_text((assets / 'hb-pad-colors.mjs').read_text())

    baselines: dict[str, str] = json.loads((assets / 'baselines.json').read_text())
    for relative_path, encoded_png in baselines.items():
        (root / relative_path).write_bytes(base64.b64decode(encoded_png))
