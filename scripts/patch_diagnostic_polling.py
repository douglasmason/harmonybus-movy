"""Poll visible HB controls and diagnostics without repainting unchanged values."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_diagnostic_polling(root: Path) -> None:
    """Give the existing page adapter sole ownership of visible HB values."""
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = path.read_text()
    start: int = source.index('        const pageKeys = ctl.page?.keys;')
    end: int = source.index('        const gestureNow=Date.now();', start)
    body: str = source[start:end]
    body = replace_once(body, '        if (nextKind) {', '''        // A touch gets its cached presentation frame before further host work.
        if (touchPaintPending || performanceTouchActive()) return !!nextKind;
        if (nextKind) {''')
    body = replace_once(body, '                    followerValues = snapshot;', '''                    const changed = followerKeys.some((key: string) => ctl.state.values[key] !== snapshot[key]);
                    followerValues = snapshot;
                    if (changed) appState.dirty = true;''')
    source = source[:start] + '        if (!snapshotPolled) pollDiagnostics();\n' + source[end:]
    source = replace_once(source, '    function tick(): void {', '''    /** Return whether this page owns a complete diagnostic snapshot. The app
     * can pause its covered value model while preserving that model's lifecycle. */
    function pollDiagnostics(): boolean {
        if (!loaded || hostedModuleId !== 'harmonybus') return false;
''' + body + '''        return !!nextKind;
    }

    /** The visible HB knob page owns polling, independently of paint/model dirtiness.
     * Keep the upstream controller's value/modulation cursor and write lifecycle. */
    function pollVisibleValues(): boolean {
        if (!loaded || hostedModuleId !== 'harmonybus' || ctl.page?.kind !== 'knobs') return false;
        if (touchPaintPending) { tick(true); return true; }
        if (performanceTouchActive()) return true;
        const now = Date.now(), page = ctl.page;
        if (page === visiblePollPage && now >= visiblePollAt && now - visiblePollAt < 40) return true;
        visiblePollAt = now; visiblePollPage = page;
        const state = ctl.state;
        const visibleValues = () => page.keys.flatMap((key: string) =>
            [state.values[key], state.modValues[key], state.modCache[key], state.autoCache[key]]);
        const before = visibleValues(), touched = state.touched, presetName = state.presetName;
        pollDiagnostics();
        tick(true);
        if (page !== ctl.page || touched !== state.touched || presetName !== state.presetName ||
            visibleValues().some((value: unknown, index: number) => value !== before[index])) appState.dirty = true;
        if (state.peek && !ctl.enumPeek()) appState.dirty = true;
        return true;
    }

    function tick(snapshotPolled = false): void {''')
    source = replace_once(source, '    tick(): void;', '    tick(): void;\n    pollVisibleValues(): boolean;')
    source = replace_once(source, '        reload, tick,', '        reload, tick, pollVisibleValues,')
    # Reload may replace values while leaving the same page kind selected.
    source = replace_once(source, '        rawContract.clear();', '''        followerValues = null; followerSnapshotAt = -Infinity; snapshotKind = '';
        visiblePollAt = -Infinity; visiblePollPage = null;
        rawContract.clear();''')
    source = replace_once(source, '\n    reload();\n', '\n    let visiblePollAt = -Infinity;\n    let visiblePollPage: any = null;\n    reload();\n')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text()
    source = replace_once(source, '    sp.tick();', '    if (!sp.pollVisibleValues()) sp.tick();')
    source = replace_once(source, 'let lastAnalysisPaintAt = -Infinity;\n', '')
    start = source.index("    // Analysis changes do not dirty Movy's separate control model.")
    end = source.index('    /* Whether this tick repainted the view.', start)
    source = source[:start] + source[end:]
    source = replace_once(source, '    const modelDirty  =', '''    // Performance screens already tick their page. Ordinary HB knob pages
    // own both snapshot acquisition and the lifecycle of their controller.
    const sharedValues = !coveredModel && !seqState.sessionMode && sessionReady() && !schwungEditorActive() &&
        !stepPageState.selected && (appState.currentView === VIEW_KNOBS || appState.currentView === VIEW_CHAIN) &&
        !!touchPage?.pollVisibleValues();
    const modelDirty  =''')
    source = replace_once(source, 'activeModel?.tick(!coveredModel)', 'activeModel?.tick(!coveredModel && !sharedValues)')
    path.write_text(source)
