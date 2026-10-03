"""Add discoverable pad color pages to Shift+Step 9's Set view."""
from pathlib import Path
import shutil
from patch_responsive_persistence import replace_once


def patch_pad_settings(root: Path) -> None:
    """Keep Set controls first and navigate adjacent pages with the jog dial."""
    integration: Path = Path(__file__).resolve().parents[1] / 'integration/pad-settings'
    for baseline in (integration / 'baselines').glob('*.png'):
        shutil.copyfile(baseline, root / 'browser-test/screenshots/baseline' / baseline.name)
    (root / 'src/seq/pad-settings.ts').write_text((integration / 'pad-settings.ts').read_text())
    (root / 'src/seq/trail-settings.ts').write_text((integration / 'trail-settings.ts').read_text())
    (root / 'src/seq/trail-history.ts').write_text((integration / 'trail-history.ts').read_text())
    (root / 'browser-test/trail-history-test.mjs').write_text((integration / 'trail-history-test.mjs').read_text())
    (root / 'browser-test/hb-pad-trails.mjs').write_text((integration / 'hb-pad-trails.mjs').read_text())
    (root / 'browser-test/hb-pad-settings.mjs').write_text((integration / 'hb-pad-settings.mjs').read_text())
    path: Path = root / 'src/seq/main-page.ts'
    source: str = "import { padSettingsTurn } from './pad-settings.js';\nimport { trailSettingsTurn } from './trail-settings.js';\n" + path.read_text()
    source = replace_once(source, 'export const mainPageState = {', 'export const mainPageState = {\n    page: 0,')
    source = replace_once(source, '    mainPageState.touchedKnob = -1;', '    mainPageState.page = 0;\n    mainPageState.touchedKnob = -1;')
    source = replace_once(source, 'export function mainPageTouch(k: number, down: boolean): void {', '''export function mainPageJog(delta: number): void {
    if (mainPageState.overlayKnob >= 0 || mainPageState.touchedKnob >= 0) return;
    const next = Math.max(0,Math.min(3,mainPageState.page + Math.sign(delta)));
    if (next === mainPageState.page) return;
    clearMainPage();mainPageState.page=next;appState.dirty=true;
}

export function mainPageTouch(k: number, down: boolean): void {
    if (mainPageState.page) { mainPageState.touchedKnob=down?k:-1;return; }''')
    source = replace_once(source, 'export function mainPageKnob(k: number, delta: number): void {', '''export function mainPageKnob(k: number, delta: number): void {
    if (mainPageState.page) {
        mainPageState.touchedKnob=k;
        const steps=countDetents(accum,k,delta);if(steps){if(mainPageState.page===1)padSettingsTurn(k,steps);else trailSettingsTurn(mainPageState.page,k,steps);}
        return;
    }''')
    path.write_text(source)
    path = root / 'src/seq/main-page-vm.ts'
    source = "import { padSettingsCells } from './pad-settings.js';\nimport { trailSettingsCells } from './trail-settings.js';\n" + path.read_text()
    source = replace_once(source, '    const layout = null;', "    const layout = cell({shortName:'MORE',fullName:'Turn dial: more panels',renderStyle:'preset',displayValue:'DIAL >',normalizedValue:0});")
    source = replace_once(source, '    return {\n        moduleName:', '''    const padCells = mainPageState.page===1 ? padSettingsCells(tk) : mainPageState.page>1 ? trailSettingsCells(mainPageState.page,tk) : null;
    if (padCells && tk >= 0 && padCells[tk]) toast={fullName:padCells[tk].fullName,value:padCells[tk].displayValue,browseHint:false};
    return {
        moduleName:''')
    source = source.replace("headerOverride: 'SET PARAMETERS'", "headerOverride: ['SET PARAMS','PAD COLORS','PAD TRAILS','TRAIL DECAY'][mainPageState.page]")
    source = source.replace("bankName: '', bankIndex: 0, bankCount: 1", "bankName: (mainPageState.page + 1) + '/4 >', bankIndex: mainPageState.page, bankCount: 4")
    source = source.replace('rows: [[tempo, sw, link, quant], [root, key, mode, layout]],', 'rows: padCells ? [padCells.slice(0,4),padCells.slice(4,8)] : [[tempo, sw, link, quant], [root, key, mode, layout]],')
    path.write_text(source)
    path = root / 'src/midi/router.ts'
    source = replace_once(path.read_text(), 'import { mainPageActive,', 'import { mainPageJog, mainPageActive,')
    source = replace_once(source, '        if (clipPageActive()) { clipPageJog(delta);', '        if (mainPageActive()) { mainPageJog(delta); appState.dirty=true; return; }\n        if (clipPageActive()) { clipPageJog(delta);')
    path.write_text(source)
    path = root / 'src/renderer/hb-step-panels.ts'
    source = replace_once(path.read_text(), "const hiddenPanels = new Set(['mixed_cadences_1'", "const hiddenPanels = new Set(['pad_display', 'mixed_cadences_1'")
    path.write_text(source)

    path = root / 'src/seq/ui-state.ts'
    source = "import { trailSettingsSnapshot, restoreTrailSettings } from './trail-settings.js';\n" + path.read_text()
    source = replace_once(source, '        oct:    keyboardState.octave.slice(),', '        oct:    keyboardState.octave.slice(),\n        padTrails: trailSettingsSnapshot(),')
    source = replace_once(source, '        const o = JSON.parse(blob);', '        const o = JSON.parse(blob);\n        restoreTrailSettings(o.padTrails);')
    source = replace_once(source, '    keyboardState.rootPc = 0;', '    restoreTrailSettings(null);\n    keyboardState.rootPc = 0;')
    path.write_text(source)

    path = root / 'build/browser.mjs'
    source = replace_once(path.read_text(), "    entryPoints: [", "    entryPoints: [\n        resolve(root, 'src/seq/trail-settings.ts'),\n        resolve(root, 'src/keyboard/harmony-pads.ts'),")
    path.write_text(source)
