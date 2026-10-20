"""Replan Copy-mode panels using their cached contract instead of rereading DSP."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_mode_navigation(root: Path) -> None:
    """Keep layout-only navigation out of the native parameter read path."""
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = path.read_text()
    source = replace_once(source, '    reload(): void;', '    reload(layoutOnly?: boolean): void;')
    source = replace_once(source, '    const readCache = new Map<string, string | null>();', '''    const readCache = new Map<string, string | null>();
    const rawContract = new Map<string, string | null>();
    let layoutRead = false;''')
    source = replace_once(source, '            let v = port.getParam(qualify(k));', '''            const contract = k.endsWith(':ui_hierarchy') || k.endsWith(':chain_params');
            let v = layoutRead && (contract ? rawContract : readCache).has(k)
                ? (contract ? rawContract : readCache).get(k)!
                : port.getParam(qualify(k));
            if (contract && !layoutRead) rawContract.set(k, v);''')
    source = replace_once(source, '    function reload(): void {', '''    function reload(layoutOnly = false): void {
        if (layoutOnly && loaded && hostedModuleId === 'harmonybus' && rawContract.size) {
            plannedStepMode = flagValue('hbsteprow');
            layoutRead = true;
            try {
                ctl.load({ slot: port.track.index, component: componentKey, visible: hbPanelVisible });
                refreshLoaded();
            } finally { layoutRead = false; }
            return;
        }
        rawContract.clear();''')
    source = source.replace("plannedStepMode !== flagValue('hbsteprow') && ctl.state.touched < 0) reload();", "plannedStepMode !== flagValue('hbsteprow') && ctl.state.touched < 0) reload(true);")
    path.write_text(source)
    path = root / 'src/renderer/hb-performance.ts'
    source = replace_once(path.read_text(), '    setHbPerformanceMode(next);\n    page.reload();', '    setHbPerformanceMode(next);\n    page.reload(true);')
    path.write_text(source)
    source = replace_once(source, '    for (const owner of usedOwners) resetOwner(owner);\n    usedOwners.clear();sampledAt = -Infinity;statusMask = 0;',
        '    // Page navigation releases physical holds, not persistent musical state.\n    // Keep ownership tracked so explicit reset/stop can still clear it.\n    sampledAt = -Infinity;statusMask = 0;')
    path.write_text(source)

    # Performance mode is transient navigation, never a startup preference.
    path = root / 'src/seq/flags.ts'
    source = path.read_text()
    source = replace_once(source, '    perSet = perSetFlagsFrom(o);', "    perSet = perSetFlagsFrom(o);\n    setFlag('hbsteprow', 0);")
    source = replace_once(source, '    values = v;', "    v.hbsteprow = 0; // Ignore old persisted navigation mode.\n    values = v;")
    source = replace_once(source, '    writePrefFlag(key, next);', "    if (key !== 'hbsteprow') writePrefFlag(key, next);")
    path.write_text(source)
