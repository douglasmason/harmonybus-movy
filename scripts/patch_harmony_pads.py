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
    source = "import { harmonyPadColor } from '../keyboard/harmony-pads.js';\nexport { setFollowerInputScale, setFollowerInputRoot, harmonyPadColor, colorHarmonyPitch, harmonyPulse, parseHarmonySnapshot, refreshHarmonyPads } from '../keyboard/harmony-pads.js';\n" + source
    source = replace_once(source, '    if (pitch < 0) return C_BLACK;', '''    if (pitch < 0) return C_BLACK;
    const harmonyColor = harmonyPadColor(pitch, track, holdNotes !== null ? holdNotes.includes(pitch) : noteHeld(track, pitch));
    if (harmonyColor !== null) return harmonyColor;''')
    path.write_text(source)
    path = root / 'src/keyboard/handler.ts'
    source = "import { harmonyPadColor } from './harmony-pads.js';\n" + path.read_text()
    source = replace_once(source, 'setLED(padNote, C_GREEN, true); // immediate green feedback before the next poll',
        'setLED(padNote, harmonyPadColor(midiNote, track, true) ?? C_GREEN, true); // preserve harmony backgrounds on the immediate path')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = "import { refreshHarmonyPads } from '../keyboard/harmony-pads.js';\n" + path.read_text()
    source = replace_once(source, '        const map       = padMapFor(track);', '        refreshHarmonyPads(track);\n        const map       = padMapFor(track);')
    path.write_text(source)
    (root / 'browser-test/hb-pad-colors.mjs').write_text((assets / 'hb-pad-colors.mjs').read_text())

    path = root / 'src/seq/main-page.ts'
    source = "import { setFollowerInputScale, setFollowerInputRoot, followerInputScaleCount } from '../keyboard/harmony-pads.js';\n" + path.read_text()
    source = replace_once(source, 'if (k === K_KEY) keyboardState.scale = sel;',
        'if (k === K_KEY) { keyboardState.scale = sel; setFollowerInputScale(appState.activeTrack.index, sel); }')
    source = source.replace('        setRootPc(keyboardState.rootPc + n);', '        setRootPc(keyboardState.rootPc + n);\n        setFollowerInputRoot(appState.activeTrack.index, keyboardState.rootPc);')
    path.write_text(source)
    source = path.read_text()
    source = source.replace("import { MODE_NAMES, layoutNames } from '../keyboard/layouts.js';", "export const PAD_LAYOUT_NAMES = ['Chromatic 4ths', 'Piano', 'In Key 4ths', 'Inline'];\nexport function padLayoutIndex(): number { return (keyboardState.mode === 1 ? 2 : 0) + Math.min(keyboardState.layout, 1); }")
    source = source.replace('if (k === K_KEY) return SCALE_NAMES;', 'if (k === K_KEY) return SCALE_NAMES.slice(0, followerInputScaleCount(appState.activeTrack.index));')
    source = source.replace('const OVERLAY_KNOBS = [K_KEY, K_MODE, K_LAYOUT];', 'const OVERLAY_KNOBS = [K_KEY, K_MODE];')
    source = source.replace('    if (k === K_MODE) return MODE_NAMES;\n    return layoutNames(keyboardState.mode);', '    return k === K_MODE ? PAD_LAYOUT_NAMES : [];')
    source = source.replace('    if (k === K_MODE) return keyboardState.mode;\n    return Math.min(keyboardState.layout, layoutNames(keyboardState.mode).length - 1);', '    return padLayoutIndex();')
    source = replace_once(source, '''        keyboardState.mode = sel;
        // Chromatic and In Key both offer two layouts, so the index carries
        // over; the clamp is here so adding a third option later can't strand it.
        keyboardState.layout = Math.min(keyboardState.layout, layoutNames(sel).length - 1);
    } else keyboardState.layout = sel;''', '''        keyboardState.mode = sel >= 2 ? 1 : 0;
        keyboardState.layout = sel % 2;
    }''')
    source = source.replace('    mainPageState.touchedKnob = down ? k : -1;', '    if (k === K_LAYOUT) return;\n    mainPageState.touchedKnob = down ? k : -1;')
    source = source.replace('    mainPageState.touchedKnob = k;', '    if (k === K_LAYOUT) return;\n    mainPageState.touchedKnob = k;')
    path.write_text(source)
    path = root / 'src/seq/main-page-vm.ts'
    source = path.read_text().replace('mainPageState, overlayOptions', 'mainPageState, overlayOptions, PAD_LAYOUT_NAMES, padLayoutIndex')
    source = source.replace("import { MODE_NAMES, layoutNames } from '../keyboard/layouts.js';\n", '')
    start = source.index('    const mode = cell({')
    end = source.index('\n    // Knob-indexed', start)
    source = source[:start] + '''    const li = padLayoutIndex();
    const mode = cell({
        shortName: 'LAYOUT', fullName: 'Pad Layout', type: 'enum',
        options: PAD_LAYOUT_NAMES, isLongEnum: true,
        enumIndex: li, displayValue: PAD_LAYOUT_NAMES[li], normalizedValue: li / 3,
    });
    const layout = null;
''' + source[end:]
    path.write_text(source)
    path = root / 'browser-test/logic/params-pages.mjs'
    source = path.read_text()
    start = source.index('    // Knob 6 MODE:')
    end = source.index("    eq('close returns origin view'", start)
    source = source[:start] + '''    // One selector preserves the four existing mode/layout combinations.
    const { PAD_LAYOUT_NAMES, padLayoutIndex } = await import('../../dist/esm/seq/main-page.js');
    eq('combined layout names', JSON.stringify(PAD_LAYOUT_NAMES),
        '["Chromatic 4ths","Piano","In Key 4ths","Inline"]');
    for (let index = 0; index < 4; index++) {
        keyboardState.mode = index >= 2 ? 1 : 0; keyboardState.layout = index % 2;
        mainPageTouch(6, true);
        eq('saved layout seeds selector ' + index, mainPageState.overlaySel, index);
        mainPageRelease(6);
        eq('saved layout round trip ' + index, padLayoutIndex(), index);
    }
    mainPageTouch(6, true); mainPageKnob(6, -16); mainPageRelease(6);
    eq('Inline to Piano sets chromatic mode', keyboardState.mode, 0);
    eq('Inline to Piano sets piano layout', keyboardState.layout, 1);
    mainPageTouch(7, true); mainPageKnob(7, 8); mainPageRelease(7);
    eq('unused knob does not change layout', padLayoutIndex(), 1);
    eq('unused knob opens no overlay', mainPageState.overlayKnob, -1);

''' + source[end:]
    path.write_text(source)
    source = path.read_text()
    source = source.replace("eq('mode cell shows Chromatic', vm.rows[1][2].displayValue, 'Chromatic');", "eq('combined layout cell', vm.rows[1][2].displayValue, 'Chromatic 4ths');")
    source = source.replace("eq('layout cell shows 4th', vm.rows[1][3].displayValue, '4th');", "eq('former layout cell is empty', vm.rows[1][3], null);")
    source = source.replace("eq('in-key mode cell', vm.rows[1][2].displayValue, 'In Key');", "eq('in-key layout cell', vm.rows[1][2].displayValue, 'In Key 4ths');")
    source = source.replace("JSON.stringify(vm.rows[1][3].options), '[\"4th\",\"Inline\"]'", "JSON.stringify(vm.rows[1][2].options), '[\"Chromatic 4ths\",\"Piano\",\"In Key 4ths\",\"Inline\"]'")
    source = source.replace("JSON.stringify(vm.overlay?.options), '[\"Chromatic\",\"In Key\"]'", "JSON.stringify(vm.overlay?.options), '[\"Chromatic 4ths\",\"Piano\",\"In Key 4ths\",\"Inline\"]'")
    source = source.replace("JSON.stringify(vm.overlay?.options), '[\"4th\",\"Piano\"]'", "JSON.stringify(vm.overlay?.options), '[]'")
    path.write_text(source)
    path = root / 'src/undo/ui-fields.ts'
    source = "import { setFollowerInputScale, setFollowerInputRoot } from '../keyboard/harmony-pads.js';\nimport { appState } from '../app/state.js';\n" + path.read_text()
    source = replace_once(source, '''    if (f === 'rootPc') keyboardState.rootPc = n;
    else keyboardState.scale = n;''', '''    if (f === 'rootPc') {
        keyboardState.rootPc = n;
        setFollowerInputRoot(appState.activeTrack.index, n);
    } else {
        keyboardState.scale = n;
        setFollowerInputScale(appState.activeTrack.index, n);
    }''')
    path.write_text(source)
