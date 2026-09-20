"""Keep hosted page drawing and touch feedback off blocking metadata reads."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_page_latency(root: Path) -> None:
    """Cache touch readbacks, bound contract checks, and retain atomic frames."""
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = path.read_text()
    source = replace_once(source, '    let snapshotKind = "";', '''    let snapshotKind = "";
    const readCache = new Map<string, string | null>();
    let touchReadOnly = false;
    let touchPaintPending = false;
    let hostedModuleId: string | null = null;
    let lastContractCheck = -Infinity;''')
    source = replace_once(source, '            const v = port.getParam(qualify(k));', '''            if (touchReadOnly) return readCache.get(k) ?? null;
            const v = port.getParam(qualify(k));
            if (v !== null && v !== undefined) readCache.set(k, v);''')
    source = replace_once(source, '    function reload(): void {', '''    function reload(): void {
        readCache.clear();
        hostedModuleId = port.getParam(moduleReadKey(componentKey));
        lastContractCheck = Date.now();''')
    source = replace_once(source, '        ctl.reloadIfChanged();', '''        // The first frame after touch/release is presentation only: no host I/O.
        if (touchPaintPending) { touchPaintPending = false; return; }
        const contractNow = Date.now();
        if (ctl.state.touched < 0 && (contractNow < lastContractCheck || contractNow - lastContractCheck >= 1000)) {
            lastContractCheck = contractNow;
            const moduleId = port.getParam(moduleReadKey(componentKey));
            if (moduleId !== null && moduleId !== hostedModuleId) reload();
            else if (hostedModuleId !== 'harmonybus') ctl.reloadIfChanged();
        }''')
    source = replace_once(source, '            if (now - followerSnapshotAt >= 40) {', '''            // Never let a failed snapshot fall back to a left-to-right cell sweep.
            if (!followerValues) {
                followerValues = {};
                followerKeys.forEach((key: string) => { followerValues![key] = String(ctl.state.values[key] ?? '--'); });
            }
            if (now < followerSnapshotAt || now - followerSnapshotAt >= 40) {''')
    source = replace_once(source, '        knobTouch: (slot: number, down: boolean) => {', '''        knobTouch: (slot: number, down: boolean) => {
            touchPaintPending = true;''')
    source = replace_once(source, '            ctl.onKnobTouch(slot, true);', '''            touchReadOnly = true;
            try { ctl.onKnobTouch(slot, true); } finally { touchReadOnly = false; }''')
    source = replace_once(source, "            if (port.getParam(moduleReadKey(componentKey)) !== 'harmonybus') return;", "            if (hostedModuleId !== 'harmonybus') return;")
    source = replace_once(source, '    readonly ready: boolean;', '    readonly ready: boolean;\n    readonly needsTouchPaint: boolean;')
    source = replace_once(source, '        performanceTrack: port.track.index,', '        get needsTouchPaint() { return touchPaintPending; },\n        performanceTrack: port.track.index,')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text()
    source = replace_once(source, '    const modelDirty  = performanceTouchActive() ? false : (activeModel?.tick() ?? false);', """    const touchPage = activeModel ? schwungActiveFor(appState.activeTrack.index, activeModel.getComponentKey()) : null;
    const modelDirty  = performanceTouchActive() || touchPage?.needsTouchPaint ? false : (activeModel?.tick() ?? false);""")
    path.write_text(source)
