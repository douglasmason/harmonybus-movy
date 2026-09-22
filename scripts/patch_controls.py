"""Consolidate HarmonyBus page feedback and expose the existing step-row flag."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_controls(root: Path) -> None:
    """Preserve held peeks, snapshot mixed pages, and share the performance flag."""
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = path.read_text()
    source = "import { flagValue } from '../seq/flags.js';\nimport { setHbPerformanceMode } from './hb-performance.js';\n" + source
    source = replace_once(source, '        getParam: (k: string) => {', '''        getParam: (k: string) => {
            if (k.endsWith(':hb_step_row') || k === 'hb_step_row') return flagValue('hbsteprow') ? 'Perform' : 'Steps';''')
    source = replace_once(source, '            const v = port.getParam(qualify(k));', '''            let v = port.getParam(qualify(k));
            if (hostedModuleId === 'harmonybus' && k.endsWith(':ui_hierarchy') && v) {
                try {
                    const hierarchy = JSON.parse(v), operation = hierarchy.levels?.motion_operation;
                    if (operation) {
                        operation.params = operation.params.filter((parameter: any) => parameter.key !== 'motion_punch');
                        operation.params.push({key:'hb_step_row', name:'Step Row', type:'enum', options:['Steps','Perform'], options_as_string:true});
                        operation.knobs = operation.knobs.map((key: string) => key === 'motion_punch' ? 'hb_step_row' : key);
                        v = JSON.stringify(hierarchy);
                    }
                } catch (_) { /* Keep the original contract on failed parsing. */ }
            }''')
    source = replace_once(source, '        setParam: (k: string, v: string) => { if', '''        setParam: (k: string, v: string) => {
            if (k.endsWith(':hb_step_row') || k === 'hb_step_row') { setHbPerformanceMode(v === 'Perform' || v === '1' ? 1 : 0); markUiStateDirty(); return; }
            if''')
    source = replace_once(source, '        const followerKeys = ctl.page?.keys;', '''        const pageKeys = ctl.page?.keys;
        const harmonyKeys = Array.isArray(pageKeys) ? pageKeys.filter((key: string) => /^hpath_[0-3]$/.test(key)) : [];
        const followerKeys = harmonyKeys.length === 4 ? harmonyKeys : pageKeys;''')
    # Duplicate capacitive note-ons must not dismiss an active enum peek.
    source = replace_once(source, '        knobTouch: (slot: number, down: boolean) => {\n            touchPaintPending = true;', '''        knobTouch: (slot: number, down: boolean) => {
            if (down && ctl.state.touchOrder?.includes(slot)) return;
            touchPaintPending = true;''')
    source = replace_once(source, '            ctl.renderOverlays(ctx, { clearScreen: () => clear_screen() });', '''            // Keep an enum list stable while its knob is physically held.
            if (ctl.state.peek && ctl.state.touchOrder?.some((slot: number) => ctl.keyAt(slot) === ctl.state.peek.key))
                ctl.state.peek.at = Date.now();
            ctl.renderOverlays(ctx, { clearScreen: () => clear_screen() });''')
    # Expiry can be queried before render; refresh there too, before ctl.tick.
    source = replace_once(source, '        ctl.tick();', '''        if (ctl.state.peek && ctl.state.touchOrder?.some((slot: number) => ctl.keyAt(slot) === ctl.state.peek.key))
            ctl.state.peek.at = Date.now();
        ctl.tick();''')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text().replace("keys.some((key: string) => key === 'fpath_0_0_0' || key === 'hpath_0')", "keys.some((key: string) => key === 'fpath_0_0_0' || key === 'hpath_0')")
    source = replace_once(source, '    const isFullScreenView = isBrowseView || appState.currentView === VIEW_CPU;', '''    const activePageOverlay = !!touchPage?.ctl.enumPeek?.();
    const isFullScreenView = isBrowseView || appState.currentView === VIEW_CPU || activePageOverlay;''')
    source = replace_once(source, '&& !captureOverlayActive()) {\n        songBandTick', '&& !captureOverlayActive() && !activePageOverlay) {\n        songBandTick')
    source = replace_once(source, '!leaveModalActive() && !undoToastActive() && !quantOverlayActive()) drawHbPerformanceMode();', '!leaveModalActive() && !undoToastActive() && !quantOverlayActive() && !activePageOverlay) drawHbPerformanceMode();')
    path.write_text(source)
