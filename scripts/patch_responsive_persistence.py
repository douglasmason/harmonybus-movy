"""Save hosted edits reliably and prioritize performance controls before UI work."""
from pathlib import Path


def replace_once(source: str, before: str, after: str) -> str:
    """Apply one pinned seam, accepting an already-applied patch."""
    if after in source:
        return source
    assert source.count(before) == 1, before
    return source.replace(before, after, 1)


def patch_responsive_persistence(root: Path) -> None:
    """Retain UI-only changes and bound autosave cadence by elapsed time."""
    path: Path = root / 'src/seq/ui-dirty.ts'
    source: str = path.read_text()
    source = replace_once(source, 'let uiDirty = false;', 'let uiDirty = false;\nexport function uiStateDirty(): boolean { return uiDirty; }')
    path.write_text(source)
    path = root / 'src/seq/set-save.ts'
    source = path.read_text().replace('markUiStateDirty, takeUiDirty', 'markUiStateDirty, takeUiDirty, uiStateDirty')
    if 'export { markUiStateDirty' not in source:
        source += "\nexport { markUiStateDirty, clearUiDirty, uiStateDirty } from './ui-dirty.js';\n"
    source = source.replace('return seqState.dirty || saveRetry;', 'return seqState.dirty || saveRetry || uiStateDirty();')
    path.write_text(source)
    path = root / 'src/seq/set-session.ts'
    source = path.read_text()
    source = replace_once(source, 'let saveCountdown = SAVE_TICKS;', 'let saveCountdown = SAVE_TICKS;\nlet lastSaveAt = Date.now();')
    source = replace_once(source, '    saveCountdown = SAVE_TICKS; pollCountdown = 1;', '    saveCountdown = SAVE_TICKS; pollCountdown = 1; lastSaveAt = Date.now();')
    source = replace_once(source, '    if (--saveCountdown > 0) return;\n    saveCountdown = SAVE_TICKS;', '    const saveNow = Date.now();\n    if (--saveCountdown > 0 && saveNow >= lastSaveAt && saveNow - lastSaveAt < 3000) return;\n    lastSaveAt = saveNow;\n    saveCountdown = SAVE_TICKS;')
    path.write_text(source)
    path = root / 'src/renderer/schwung-page.ts'
    source = path.read_text()
    if "import { markUiStateDirty }" not in source:
        source = "import { markUiStateDirty } from '../seq/ui-dirty.js';\n" + source
    source = replace_once(source, 'setParam: (k: string, v: string) => { port.setParam(qualify(k), v); },', 'setParam: (k: string, v: string) => { if (port.setParam(qualify(k), v) !== false) markUiStateDirty(); },')
    # Release the owned action before controller bookkeeping or unrelated reads.
    source = source.replace('''            ctl.onKnobTouch(slot, down);
            if (!down) {''', '''            if (!down) {''', 1)
    source = replace_once(source, '''                    ctl.commitEnum(heldKey, 0);
                return;
            }
            if (touchActions.has(slot)) return;''', '''                    ctl.commitEnum(heldKey, 0);
                ctl.onKnobTouch(slot, false);
                return;
            }
            ctl.onKnobTouch(slot, true);
            if (touchActions.has(slot)) return;''')
    source = replace_once(source, '            if (meta.writeOnly) {', '''            if (key === 'next_reset') {
                touchActions.set(slot, key);
                ctl.commitEnum(key, 1);
            } else if (meta.writeOnly) {''')
    path.write_text(source)
    path = root / 'src/midi/router.ts'
    source = path.read_text()
    source = replace_once(source, '''        } else {
            const info = knobInfoFor(d1);
            {
                const m2 = knobModel();''', '''        } else {
            {
                const m2 = knobModel();''')
    source = replace_once(source, '            if (info) automationKnobReleased(appState.activeTrack.index, d1, info);', '            const info = knobInfoFor(d1);\n            if (info) automationKnobReleased(appState.activeTrack.index, d1, info);')
    path.write_text(source)
    # The early paint only owns the empty-clip beat row; normal painting
    # remains after session/view transitions. At most 16 extra packets fit
    # alongside the normal 40-packet budget inside the hardware's 64 slots.
    path = root / 'src/seq/leds.ts'
    source = path.read_text()
    early: str = """export function seqBeatLedsTick(): void {
    if (!seqState.playing || seqState.lenSteps !== 0 || seqState.sessionMode ||
        seqState.loopMode || seqState.trackSelectHold || muteHeld() || stepRecActive()) return;
    const tick = visualEngineTick();
    for (let step = 0; step < NUM_STEP_BUTTONS; step++)
        cachedSetLED(STEP_NOTE_BASE + step, metronomeStep(step, tick) ? C_GREEN : C_BLACK);
}

"""
    source = replace_once(source, 'export function seqLedsTick(', early + 'export function seqLedsTick(')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text().replace('import { seqLedsTick,', 'import { seqBeatLedsTick, seqLedsTick,')
    source = replace_once(source, '    sessionTick();\n    /* A phase change is a view change', '    seqBeatLedsTick();\n    sessionTick();\n    /* A phase change is a view change')
    path.write_text(source)
    path = root / 'browser-test/logic/set-session.mjs'
    source = path.read_text()
    marker: str = '    /* R1 — a Set that names itself late'
    regression: str = '''    /* UI-only edits and recordings must survive a fresh session, even when
     * three seconds contain only one expensive UI tick rather than 600. */
    {
        const originalNow = Date.now;
        let now = originalNow();
        Date.now = () => now;
        try {
            const { markUiStateDirty } = await import('../../dist/esm/seq/set-save.js');
            const { readUiBlob } = await import('../../dist/esm/seq/persist-store.js');
            const { fs, eng } = boot({ [ACTIVE]: 'SLOW-SAVE\\nSaved Set\\n', [uuidToStatePath('SLOW-SAVE')]: SAVED });
            keyboardState.rootPc = 5; markUiStateDirty();
            seqState.dirty = false; eng.status.dirty = 0;
            sessionFlush();
            eq('UI-only flush persists without engine edits', JSON.parse(readUiBlob('SLOW-SAVE')).rootPc, 5);
            eng.stateBlob = EDITED; eng.status.dirty = 1;
            now += 3100; seqEngineTick(); sessionTick();
            eq('slow UI still saves recorded notes after three seconds', readBestState('SLOW-SAVE').payload, EDITED);
            const files = { ...fs.files };
            teardown();
            const restarted = boot(files);
            eq('recorded notes reload in a fresh session', restarted.eng.stateBlob, EDITED);
            eq('UI settings reload in a fresh session', keyboardState.rootPc, 5);
            teardown();
        } finally { Date.now = originalNow; }
    }

'''
    if regression not in source:
        assert source.count(marker) == 1
        path.write_text(source.replace(marker, regression + marker, 1))
