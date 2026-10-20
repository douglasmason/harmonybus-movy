"""Movy-local Copy tap modes and bounded parameter headers."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_step_modes(root: Path) -> None:
    """Preserve held editing gestures while selecting HB step destinations."""
    integration: Path = Path(__file__).resolve().parents[1] / 'integration/performance'
    for filename in ('hb-step-panels.ts',):
        (root / 'src/renderer' / filename).write_text((integration / filename).read_text())
    path: Path = root / 'src/renderer/header.ts'
    source: str = path.read_text()
    source = replace_once(source, 'export function drawHeader(', '''/** Fit whole glyphs inside a pixel budget, including the truncation mark. */
export function fitHeaderText(text: string, width: number): string {
    if (fontWidth(text) <= width) return text;
    const suffix = '..';
    while (text.length && fontWidth(text + suffix) > width) text = text.slice(0, -1);
    return fontWidth(suffix) <= width ? text + suffix : '';
}

export function headerText(left: string, right: string | null): [string, string] {
    const available = W - 4;
    if (!right) return [fitHeaderText(left, available), ''];
    // Both sides retain at least half the space when both are long. A short
    // label leaves the remaining width for the value (and vice versa).
    const rightBudget = available - 4 - Math.min(fontWidth(left), Math.floor((available - 4) / 2));
    const value = fitHeaderText(right, rightBudget);
    return [fitHeaderText(left, available - 4 - fontWidth(value)), value];
}

export function drawHeader(''')
    source = replace_once(source, '    fontPrint(2, 1, left, color);\n    if (right) fontPrint(W - fontWidth(right) - 2, 1, right, color);', '''    const [label, value] = headerText(left, right);
    fontPrint(2, 1, label, color);
    if (value) fontPrint(W - fontWidth(value) - 2, 1, value, color);''')
    path.write_text(source)
    path = root / 'src/seq/flags-def.ts'
    source = path.read_text().replace("labels: ['STEPS','PERFORM']", "labels: ['STEPS','HB OPS','MOTIFS']")
    source = replace_once(source, "min: 0, max: 1, def: 0, uiOnly: true, release: true,\n        hint: 'Step row: sequencer or HB effects.'", "min: 0, max: 2, def: 0, uiOnly: true, release: true,\n        hint: 'Copy tap: Steps, HB Ops, Motifs.'")
    path.write_text(source)
    path = root / 'src/seq/duplicate.ts'
    source = path.read_text()
    source = replace_once(source, 'export function dupActive()', 'export function dupUsed(): boolean { return source !== null; }\n\nexport function dupActive()')
    path.write_text(source)
    path = root / 'src/seq/router-buttons.ts'
    source = path.read_text().replace("copyButton as dupCopyButton }", "copyButton as dupCopyButton, dupUsed, dupActive }")
    source = replace_once(source, "const CC_LOOP = 58;", """import { canCycleHbStepMode, cycleHbStepMode } from '../renderer/hb-performance.js';
let copyTap: { started: number; track: number; view: number } | null = null;

const CC_LOOP = 58;""")
    source = replace_once(source, '        dupCopyButton(d2 > 0);', '''        if (d2 > 0) {
            if (!dupActive()) {
                copyTap = canCycleHbStepMode() ? { started: Date.now(), track: appState.activeTrack.index, view: appState.currentView } : null;
                dupCopyButton(true);
            }
        } else {
            const tap = copyTap;
            const used = dupUsed();
            const held = dupActive();
            copyTap = null;
            dupCopyButton(false);
            if (held && tap && !used && Date.now() >= tap.started && Date.now() - tap.started < 350 &&
                tap.track === appState.activeTrack.index && tap.view === appState.currentView && canCycleHbStepMode()) cycleHbStepMode();
        }''')
    path.write_text(source)
    path = root / 'src/renderer/hb-performance.ts'
    source = path.read_text()
    source = "import { dupActive } from '../seq/duplicate.js';\nimport { deleteActive } from '../seq/edit-ops.js';\nimport { stepRecActive } from '../seq/step-rec.js';\nimport { markUiStateDirty } from '../seq/ui-dirty.js';\n" + source
    source = source.replace('return mode === 1;', 'return mode > 0;').replace('const next = value ? 1 : 0;', 'const next = Math.max(0, Math.min(2, Math.round(value)));\n    if (motifEditing() && next !== flagValue(\'hbsteprow\')) { seqToast(\'Finish motif edit first\'); return; }')
    source = replace_once(source, 'function performanceViewAvailable(): boolean {', '''export function canCycleHbStepMode(): boolean {
    return performanceViewAvailable() && !motifEditing() && !stepRecActive() && !seqState.recording && !seqState.countingIn;
}

export function cycleHbStepMode(): void {
    if (!canCycleHbStepMode()) return;
    const page = schwungActiveFor(appState.activeTrack.index, 'midi_fx1');
    if (!page || page.moduleId !== 'harmonybus' || page.ctl.state.pickerOpen || page.ctl.state.touched >= 0) return;
    const next = (flagValue('hbsteprow') + 1) % 3;
    setHbPerformanceMode(next);
    page.reload();
    const key = next === 2 ? 'motif_slot' : next === 1 ? 'motion_control_1' : 'version';
    const index = page.ctl.pages.findIndex((candidate: any) => candidate.keys?.includes(key));
    page.goToPage(Math.max(0, index));
    appState.trackChainIndex[appState.activeTrack.index] = 0;
    appState.currentView = VIEW_KNOBS;
    markUiStateDirty();
    seqToast(['Steps', 'HB Ops', 'Motifs'][next]);
}

function performanceViewAvailable(): boolean {''')
    source = source.replace('!muteHeld() &&', '!muteHeld() && !deleteActive() &&')
    source = replace_once(source, 'if (!syncHbPerformanceMode() || !performanceViewAvailable()) return null;', 'if (!syncHbPerformanceMode() || !performanceViewAvailable() || dupActive()) return null;')
    source = source.replace("'PERFORM T' +", "(flagValue('hbsteprow') === 2 ? 'MOTIFS T' : 'HB OPS T') +")
    source = replace_once(source, '    if (motifEditing()) return false;', '    if (motifEditing()) return false;\n    if (flagValue(\'hbsteprow\') === 2) return false;')
    path.write_text(source)
    path = root / 'src/renderer/hb-motif.ts'
    source = "import { flagValue } from '../seq/flags.js';\n" + path.read_text()
    source = replace_once(source, "return !!port?.ctl?.page?.keys?.some((key: string)=>key==='motif_slot'||key==='motif_preset');", "return !!port && flagValue('hbsteprow') === 2;")
    path.write_text(source)
    path = root / 'src/renderer/schwung-page.ts'
    source = "import { hbStepHierarchy, hbPanelVisible } from './hb-step-panels.js';\n" + path.read_text()
    source = source.replace("flagValue('hbsteprow') ? 'Perform' : 'Steps'", "['Steps','HB Ops','Motifs'][flagValue('hbsteprow')]")
    source = source.replace("options:['Steps','Perform']", "options:['Steps','HB Ops','Motifs']")
    source = source.replace('v = JSON.stringify(hierarchy);', "v = JSON.stringify(hbStepHierarchy(hierarchy, flagValue('hbsteprow')));")
    source = source.replace("v === 'Perform' || v === '1' ? 1 : 0", "v === 'Motifs' || v === '2' ? 2 : v === 'HB Ops' || v === 'Perform' || v === '1' ? 1 : 0")
    source = source.replace('ctl.load({ slot: port.track.index, component: componentKey })', 'ctl.load({ slot: port.track.index, component: componentKey, visible: hbPanelVisible })')
    source = replace_once(source, '    let lastContractCheck = -Infinity;', "    let lastContractCheck = -Infinity;\n    let plannedStepMode = flagValue('hbsteprow');")
    source = replace_once(source, '        readCache.clear();', "        plannedStepMode = flagValue('hbsteprow');\n        readCache.clear();")
    source = replace_once(source, '    function tick(): void {', "    function tick(): void {\n        if (hostedModuleId === 'harmonybus' && plannedStepMode !== flagValue('hbsteprow') && ctl.state.touched < 0) reload();")
    path.write_text(source)

    path = root / 'src/track/switch.ts'
    source = path.read_text().replace("if (page.moduleId !== panel.moduleId) page.reload();", "if (page.moduleId !== panel.moduleId || panel.moduleId === 'harmonybus') page.reload();")
    path.write_text(source)
    (root / 'browser-test/hb-step-modes.mjs').write_text((integration.parent / 'hb-step-modes.mjs').read_text())
