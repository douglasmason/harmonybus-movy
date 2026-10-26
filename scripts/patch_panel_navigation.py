"""Use category-scoped navigation over existing HB controllers."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_panel_navigation(root: Path) -> None:
    """Keep shared page data intact while changing its navigation and chrome."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/chord-play'
    path: Path = root / 'src/renderer/header.ts'
    source: str = path.read_text()
    source = replace_once(source, 'dottedFirst = false, groups?: number[],', 'dottedFirst = false, groups?: number[], compact = false,')
    source = replace_once(source, '    if (bankCount <= 1) return;', '    if (bankCount <= 1) return;\n    const barY = compact ? BAR_Y - 1 : BAR_Y;')
    start: int = source.index('export function drawBankBar(')
    end: int = source.find('\nexport ', start + 1)
    if end < 0:
        end = len(source)
    body: str = source[start:end].replace(', BAR_Y,', ', barY,').replace('const h    = b === bankIndex ? 2 : 1;', 'const h    = !compact && b === bankIndex ? 2 : 1;').replace('if (dottedFirst && b === 0)', 'if ((compact && b !== bankIndex) || (dottedFirst && b === 0))')
    source = source[:start] + body + source[end:]
    path.write_text(source)
    (root / 'src/renderer/panel-navigation.ts').write_text((assets / 'panel-navigation.ts').read_text())
    (root / 'src/renderer/panel-catalog.ts').write_text((assets / 'panel-catalog.ts').read_text())
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = "import { panelNavigation } from './panel-navigation.js';\n" + path.read_text()
    source = source.replace('    let plannedStepMode = harmonyMode();', "    let plannedStepMode = harmonyMode();\n    let navigationMode='Play';")
    source = replace_once(source, 'v = JSON.stringify((options.hierarchy ?? ((value:any)=>value))(hbStepHierarchy(hierarchy, harmonyMode(), motifEditorFor(port.track.index))));', 'const curated=(options.hierarchy ?? ((value:any)=>value))(hbStepHierarchy(hierarchy, harmonyMode(), motifEditorFor(port.track.index)));\n                        navigationMode=curated.levels.root.name;v=JSON.stringify(curated);')
    source = source.replace('    readonly needsTouchPaint: boolean;', '    readonly navigationTrail?: boolean;\n    readonly needsTouchPaint: boolean;')
    source = replace_once(source, '        get ready() { return loaded; },', '        get navigationTrail() { return navigation.active(); },\n        get ready() { return loaded; },')
    source = replace_once(source, '    const motifPort = {', "    const navigation=panelNavigation(ctl,()=>hostedModuleId==='harmonybus',()=>navigationMode);\n    const motifPort = {")
    source = source.replace("click: (shift = false) => lib.applyInput", "click: (shift = false) => (ctl.state.touched<0 && !shift && navigation.click()) ? null : lib.applyInput")
    source = source.replace("back: () => lib.applyInput", "back: () => navigation.back() ? null : lib.applyInput")
    source = replace_once(source, '        render(title: string, auto?: AutomationView, _touched = -1) {', '        render(title: string, auto?: AutomationView, _touched = -1) {\n            if(navigation.renderMenu())return;')
    source = replace_once(source, '            ctl.render(ctx, { title, bands: BANDS });', '            ctl.render(ctx, { title, bands: BANDS });\n            navigation.renderTrail();')
    source = replace_once(source, '        knobTurn: (slot: number, delta: number) => {', '        knobTurn: (slot: number, delta: number) => {\n            if(navigation.isMenu())return;')
    source = replace_once(source, '        knobTouch: (slot: number, down: boolean) => {', '        knobTouch: (slot: number, down: boolean) => {\n            if(down&&navigation.isMenu())return;')
    path.write_text(source)

    path = root / 'src/app/tick.ts'
    source = path.read_text().replace('const isFullScreenView = gridActive() ||', 'const isFullScreenView = !!touchPage?.navigationTrail || gridActive() ||')
    path.write_text(source)

    path = root / 'src/renderer/hb-step-panels.ts'
    source = path.read_text().replace('operations.has(key) ? mode === 1', 'operations.has(key) ? true')
    path.write_text(source)

    path = root / 'browser-test/hb-step-modes.mjs'
    source = path.read_text().replace("assert(!has(page,'motion_control_1'))", "assert(has(page,'motion_control_1'))").replace("assert(!has(page,'motion_control_1'),'Approach bank is independent of Perform')", "assert(has(page,'motion_control_1'),'Operators remain directly available beside the approach bank')")
    source = source.replace("assert(!has(page,'motion_lane'),'Motif Play excludes operation editing')", "assert(has(page,'motion_lane'),'Motif Play keeps operation editing directly accessible')")
    path.write_text(source)
    (root / 'browser-test/hb-panel-navigation.mjs').write_text((assets / 'hb-panel-navigation.mjs').read_text())

    path = root / 'src/midi/router.ts'
    source = "import { returnPreviousInputView } from '../seq/router-buttons.js';\n" + path.read_text()
    source = replace_once(source, 'if (!intent) return;         /* a layer came down; that was the press */', "if (!intent) return;         /* a layer came down; that was the press */\n                if(intent.action==='exit'&&spb.moduleId==='harmonybus'&&returnPreviousInputView())return;")
    path.write_text(source)
