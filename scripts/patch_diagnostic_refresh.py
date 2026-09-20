"""Refresh analysis pages independently of ordinary parameter polling."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_diagnostic_refresh(root: Path) -> None:
    """Cover Movy's fallback model and drive the page renderer at 25 Hz."""
    path: Path = root / 'src/model/store.ts'
    source: str = path.read_text()
    addition: str = '''const analysisRefresh = new WeakMap<ModelState, { page: number; at: number }>();

/** Diagnostic strings are one frame, never eight independent control values. */
function refreshAnalysisPage(s: ModelState): boolean {
    const base = s.knobPage * KNOBS_PER_PAGE;
    const keys = s.knobParams.slice(base, base + KNOBS_PER_PAGE).map(p => p?.key);
    const follower = keys.length === 8 && keys.every((key, i) => key === `fpath_0_${Math.floor(i / 4)}_${i % 4}`);
    const harmony = keys.slice(0, 4).every((key, i) => key === `hpath_${i}`) && keys.length >= 4;
    if (!follower && !harmony) { analysisRefresh.delete(s); return false; }
    const now = Date.now(), previous = analysisRefresh.get(s);
    if (previous?.page === s.knobPage && now >= previous.at && now - previous.at < 40) return true;
    analysisRefresh.set(s, { page: s.knobPage, at: now });
    const count = follower ? 8 : 4;
    const raw = s.port.getParam(s.componentKey + ':' + (follower ? 'follower_snapshot' : 'harmony_snapshot'));
    const fields = typeof raw === 'string' ? raw.split('|') : [];
    if (fields.length === count + 1 && fields[0] === (follower ? 'fp1' : 'hp1') && fields.slice(1).every(Boolean)) {
        for (let index = 0; index < count; index++) applyRefreshed(s, base + index, fields[index + 1]);
    }
    // A failed read retains the previous whole frame instead of mixing ages.
    return true;
}

'''
    source = replace_once(source, 'export function refreshOneParam(s: ModelState, tickCount: number): void {', addition + 'export function refreshOneParam(s: ModelState, tickCount: number): void {\n    if (refreshAnalysisPage(s)) return;')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text()
    source = replace_once(source, 'function tickBody(): void {', 'let lastAnalysisPaintAt = -Infinity;\n\nfunction tickBody(): void {')
    marker: str = '    /* Whether this tick repainted the view.'
    addition = '''    // Analysis changes do not dirty Movy's separate control model. Give the
    // visible diagnostic page its own bounded repaint cadence, including when
    // the user holds a note and no knobs or controls are changing.
    if (!seqState.sessionMode && sessionReady() && !schwungEditorActive() &&
        (appState.currentView === VIEW_KNOBS || appState.currentView === VIEW_CHAIN) &&
        !stepPageState.selected && activeModel && schwungGridMode() === 'page') {
        const page = schwungActiveFor(appState.activeTrack.index, activeModel.getComponentKey());
        const keys = page?.ctl.page?.keys;
        const analysis = Array.isArray(keys) && keys.some((key: string) => key === 'fpath_0_0_0' || key === 'hpath_0');
        const now = Date.now();
        if (analysis && (now < lastAnalysisPaintAt || now - lastAnalysisPaintAt >= 40)) {
            lastAnalysisPaintAt = now;
            appState.dirty = true;
        } else if (!analysis) lastAnalysisPaintAt = -Infinity;
    } else lastAnalysisPaintAt = -Infinity;

'''
    source = replace_once(source, marker, addition + marker)
    path.write_text(source)
    # String readouts use the existing textual-value storage; no numeric parse.
    path = root / 'src/model/store.ts'
    source = path.read_text()
    source = replace_once(source, "    if (p.type === 'file') {\n        if (raw !== s.fileValues[i])", "    if (p.type === 'file' || (p.readOnly && String(p.type) === 'string')) {\n        if (raw !== s.fileValues[i])")
    path.write_text(source)
    path = root / 'src/model/viewmodel.ts'
    source = path.read_text()
    source = replace_once(source, "        const dv = p.type === 'file'", "        const dv = p.readOnly && String(p.type) === 'string'\n            ? (s.fileValues[gi] ?? '--')\n            : p.type === 'file'")
    source = replace_once(source, "            if (p.type === 'file') {\n                tv =", "            if (p.readOnly && String(p.type) === 'string') {\n                tv = s.fileValues[gi] ?? '--';\n            } else if (p.type === 'file') {\n                tv =")
    path.write_text(source)
