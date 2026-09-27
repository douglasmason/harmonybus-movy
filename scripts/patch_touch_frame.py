"""Present captured touch edges before the main loop's synchronous host reads."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_touch_frame(root: Path) -> None:
    p = root / 'build/browser.mjs'
    p.write_text(replace_once(p.read_text(), "    entryPoints: [", "    entryPoints: [\n        resolve(root, 'src/app/tick.ts'),"))
    p = root / 'src/renderer/schwung-grid.ts'
    s = p.read_text()
    s += '''
/** Lookup only: a latency-sensitive paint must never construct/read a page. */
export function schwungCachedFor(track: number, component: string): SchwungPage | null {
    return schwungGridMode() === 'page' ? pages.get(track + ':' + component) ?? null : null;
}
'''
    p.write_text(s)
    p = root / 'src/app/tick.ts'
    s = p.read_text().replace('schwungPageFor, schwungActiveFor }', 'schwungPageFor, schwungActiveFor, schwungCachedFor }')
    s = replace_once(s, 'let lastAnalysisPaintAt = -Infinity;', '''let lastAnalysisPaintAt = -Infinity;

// Reuse the last complete module frame, including Movy's chrome. The page body
// reads live cached touch state. Do not rebuild models or poll the host here.
let touchFrame: { track: number; view: number; model: Model; page: ReturnType<typeof schwungCachedFor>; index: number; draw: () => void } | null = null;
let touchFrameYielded = false;
function rememberTouchFrame(model: Model, stepSelected: boolean, draw: () => void): void {
    const track = appState.activeTrack.index;
    const page = !stepSelected ? schwungCachedFor(track, model.getComponentKey()) : null;
    touchFrame = page ? { track, view: appState.currentView, model, page, index: page.pageIndex, draw } : null;
    draw();
}
function paintTouchFrame(): boolean {
    // Always run a full tick between priority frames: repeated taps must not
    // starve command flushing, transport status, pad previews or persistence.
    if (touchFrameYielded) { touchFrameYielded = false; return false; }
    const frame = touchFrame;
    if (!frame || !frame.page?.needsTouchPaint || !frame.page.ready || frame.page.moduleId !== 'harmonybus' ||
        globalThis.overtakeParked === true || !sessionReady() || seqState.sessionMode ||
        appState.activeTrack.index !== frame.track || appState.currentView !== frame.view ||
        appState.trackModels[frame.track]?.[appState.trackChainIndex[frame.track]] !== frame.model ||
        schwungCachedFor(frame.track, frame.model.getComponentKey()) !== frame.page ||
        frame.page.pageIndex !== frame.index || stepPageState.selected || schwungEditorActive() ||
        appState.shiftHeld || seqState.loopMode || seqState.trackSelectHold ||
        volumeOverlay() || assignActive() || seqToastActive() || seqHeaderActive() ||
        jogHintVisible() || quantOverlayActive() || captureOverlayActive() ||
        undoToastActive() || leaveModalActive()) return false;
    frame.page.tick(); // consumes needsTouchPaint; no host I/O
    frame.draw();
    if (!frame.page.ctl.enumPeek?.()) {
        if (engineReady()) drawLoopStrip();
        drawHbPerformanceMode();
    }
    // Leave dirty set so the next full tick reconciles values and LEDs.
    appState.dirty = true;
    touchFrameYielded = true;
    return true;
}''')
    s = replace_once(s, '    ledFrameReset();\n    perfPhase', '    ledFrameReset();\n    if (paintTouchFrame()) return;\n    perfPhase')
    s = replace_once(s, '''            renderKnobsView(vm, jogHintVisible(), appState.activeTrack.index,
                            schwungBodyFor(activeModel, stepAvail && stepPageState.selected),
                            schwungBankFor(activeModel, stepAvail && stepPageState.selected));''', '''            const body = schwungBodyFor(activeModel, stepAvail && stepPageState.selected);
            const bank = schwungBankFor(activeModel, stepAvail && stepPageState.selected);
            rememberTouchFrame(activeModel!, stepAvail && stepPageState.selected, () =>
                renderKnobsView(vm, jogHintVisible(), appState.activeTrack.index, body, bank));''')
    s = replace_once(s, '''            renderChainView(vm, chainIdx, jogHintVisible(), 'T' + (appState.activeTrack.index + 1),
                            undefined, undefined as any,
                            schwungBodyFor(activeModel, stepAvail && stepPageState.selected));''', '''            const body = schwungBodyFor(activeModel, stepAvail && stepPageState.selected);
            rememberTouchFrame(activeModel!, stepAvail && stepPageState.selected, () =>
                renderChainView(vm, chainIdx, jogHintVisible(), 'T' + (appState.activeTrack.index + 1),
                                undefined, undefined as any, body));''')
    p.write_text(s)

    # Share the normal melodic-pad painter with gesture feedback. A captured
    # release must not postpone pad LEDs behind the next full engine tick.
    s = p.read_text()
    start: int = s.index('        const track     = appState.activeTrack.index;', s.index('/* Per-tick chromatic pad update:'))
    end: int = s.index('\n    }', start)
    pad_body: str = s[start:end]
    s = s[:start] + '        paintMelodicPads();' + s[end:]
    helper: str = '''
function paintMelodicPads(): void {
''' + pad_body + '''
}
let gesturePadRevision = 0;
function paintGesturePads(): void {
    const revision = performancePreviewRevision();
    if (revision === gesturePadRevision || globalThis.overtakeParked === true ||
        !sessionReady() || seqState.sessionMode || !appState.initLedsDone ||
        (appState.trackModels[appState.activeTrack.index]?.[1]?.getDrumPadCount() ?? 0) > 0) return;
    gesturePadRevision = revision;
    // The gesture write has already reached the owning track. Read the native
    // mapping once, then send changed pad colors before unrelated host polls.
    refreshHarmonyPads(appState.activeTrack.index);
    paintMelodicPads();
}
'''
    s = replace_once(s, 'function paintTouchFrame(): boolean {', helper + '\nfunction paintTouchFrame(): boolean {')
    s = s.replace('import { performanceTouchActive }', 'import { performanceTouchActive, performancePreviewRevision }')
    s = replace_once(s, '    frame.draw();', '    frame.draw();\n    paintGesturePads();')
    s = replace_once(s, '    if (paintTouchFrame()) return;', '    if (paintTouchFrame()) return;\n    paintGesturePads();')
    p.write_text(s)
