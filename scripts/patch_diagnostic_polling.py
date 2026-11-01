"""Poll shared diagnostic snapshots without forcing unchanged screen redraws."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_diagnostic_polling(root: Path) -> None:
    """Give the existing page adapter sole ownership of visible diagnostic values."""
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

    /** Keep controller retries, deferred writes and peek expiry alive at the
     * existing snapshot cadence even when no pixels changed. */
    function pollVisibleDiagnostics(): boolean {
        const previous = followerSnapshotAt;
        const active = pollDiagnostics();
        if (active && followerSnapshotAt !== previous) {
            tick(true);
            if (ctl.state.peek && !ctl.enumPeek()) appState.dirty = true;
        }
        return active;
    }

    function tick(snapshotPolled = false): void {''')
    source = replace_once(source, '    tick(): void;', '    tick(): void;\n    pollDiagnostics(): boolean;')
    source = replace_once(source, '        reload, tick,', '        reload, tick, pollDiagnostics: pollVisibleDiagnostics,')
    # Reload may replace values while leaving the same page kind selected.
    source = replace_once(source, '        rawContract.clear();', '''        followerValues = null; followerSnapshotAt = -Infinity; snapshotKind = '';
        rawContract.clear();''')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text()
    source = replace_once(source, 'let lastAnalysisPaintAt = -Infinity;\n', '')
    start = source.index("    // Analysis changes do not dirty Movy's separate control model.")
    end = source.index('    /* Whether this tick repainted the view.', start)
    source = source[:start] + source[end:]
    source = replace_once(source, '    const modelDirty  =', '''    // Performance screens already tick their page. Ordinary diagnostic pages
    // own both snapshot acquisition and the lifecycle of their controller.
    const diagnosticValues = !coveredModel && !seqState.sessionMode && sessionReady() && !schwungEditorActive() &&
        !stepPageState.selected && (appState.currentView === VIEW_KNOBS || appState.currentView === VIEW_CHAIN) &&
        !!touchPage?.pollDiagnostics();
    const modelDirty  =''')
    source = replace_once(source, 'activeModel?.tick(!coveredModel)', 'activeModel?.tick(!coveredModel && !diagnosticValues)')
    path.write_text(source)
