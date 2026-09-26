"""Prioritize pad-control touch feedback without suppressing encoder edits."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_pad_control_touch(root: Path) -> None:
    """Capture pad releases and paint touch edges before polling pad previews."""
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = path.read_text()
    source = replace_once(source, '    let touchPaintPending = false;',
        '    let touchPaintPending = false;\n    const padControlTouches = new Set<number>();')
    source = replace_once(source, '''        if (performanceTouchActive()) return;
        // The first frame after touch/release is presentation only: no host I/O.
        if (touchPaintPending) { touchPaintPending = false; return; }''', '''        // Consume the presentation frame even while a captured knob is held.
        if (touchPaintPending) { touchPaintPending = false; return; }
        if (performanceTouchActive()) return;''')
    source = replace_once(source, '''            if (!down) {
                const heldKey = touchActions.get(slot);''', '''            if (!down) {
                if (padControlTouches.has(slot)) { releasePerformanceTouch(slot); return; }
                const heldKey = touchActions.get(slot);''')
    source = replace_once(source, '''            if (!key || !meta || meta.readOnly) return;
            if (key === 'approach_scale_next' ''', '''            if (!key || !meta || meta.readOnly) return;
            // These enums are presentation settings, not automation/LFO targets.
            // Capture both MIDI release formats without entering touchActions:
            // that map owns buttons and deliberately blocks encoder turns.
            if (key.startsWith('pad_') && meta.options?.length) {
                padControlTouches.add(slot);
                ownPerformanceTouch(slot, () => {
                    padControlTouches.delete(slot);
                    touchPaintPending = true;
                    touchReadOnly = true;
                    try { ctl.onKnobTouch(slot, false); } finally { touchReadOnly = false; }
                });
                return;
            }
            if (key === 'approach_scale_next' ''')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text()
    declarations: str = '''    const chainIdx    = appState.trackChainIndex[appState.activeTrack.index];
    const activeModel = appState.trackModels[appState.activeTrack.index]?.[chainIdx];'''
    touch_page: str = '    const touchPage = activeModel ? schwungActiveFor(appState.activeTrack.index, activeModel.getComponentKey()) : null;'
    assert source.count(declarations) == 1 and source.count(touch_page) == 1
    source = source.replace(declarations + '\n', '').replace(touch_page + '\n', '')
    source = replace_once(source, '    // Warm HarmonyBus before the initial paint.',
        declarations + '\n' + touch_page + '\n\n    // Warm HarmonyBus before the initial paint.')
    source = replace_once(source,
        '    if (!seqState.sessionMode && !isDrum) refreshHarmonyPads(appState.activeTrack.index);',
        '''    // A touch/release edge gets its cached display frame first. Resume
    // the bounded preview polling on the next tick, including during holds.
    if (!seqState.sessionMode && !isDrum && !touchPage?.needsTouchPaint)
        refreshHarmonyPads(appState.activeTrack.index);''')
    path.write_text(source)
