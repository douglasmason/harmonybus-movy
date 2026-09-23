"""Expose the existing shared transport tempo in the HB tools panel."""
from pathlib import Path
from patch_movy_stock_schwung_pages import replace_once


def patch_hb_tempo(root: Path) -> None:
    """Handle HB tempo writes through the same route as the main tempo knob."""
    path: Path = root / 'src/seq/tempo-override.ts'
    source: str = path.read_text()
    source = "import { seqCmd } from './engine.js';\nimport { seqState } from './state.js';\n" + source
    source += '''
/** Return true when this is the shared HB tempo control. */
export function writeHbTempo(key: string, value: string): boolean {
    if (!key.endsWith(':hb_tempo') && key !== 'hb_tempo') return false;
    const bpm = Number(value);
    if (!Number.isFinite(bpm)) return true;
    const next = Math.round(Math.max(20, Math.min(300, bpm)) * 100);
    seqState.bpmX100 = next;
    seqCmd('bpm ' + next);
    scheduleTempoOverride(next);
    return true;
}
'''
    source = source.replace('let countdown = 0;', 'let countdown = 0;\nlet retryValue = 0;\nlet retryAt = 0;')
    source = source.replace('    countdown = DEBOUNCE_TICKS;', '    countdown = DEBOUNCE_TICKS;\n    retryValue = 0;')
    source = source.replace('    if (!pending) return;', '''    if (!pending) {
        // Older sidecars compare whole-second mtimes. Repeat the final value
        // once in a later second so rapid knob edits cannot be lost.
        if (retryValue && Date.now() >= retryAt) {
            if (typeof host_write_file === 'function') host_write_file(PATH, (retryValue / 100).toFixed(4) + '\\n');
            retryValue = 0;
        }
        return;
    }''')
    source = source.replace('    pending = 0;\n}', '    retryValue = pending;\n    retryAt = Date.now() + 1100;\n    pending = 0;\n}')
    path.write_text(source)
    path = root / 'src/chain/set-param.ts'
    source = "import { writeHbTempo } from '../seq/tempo-override.js';\n" + path.read_text()
    source = source.replace('    return port.setParam(key, value);', '    return writeHbTempo(key, value) || port.setParam(key, value);')
    path.write_text(source)
    path = root / 'src/undo/apply.ts'
    source = "import { writeHbTempo } from '../seq/tempo-override.js';\n" + path.read_text()
    source = replace_once(source, '    portFor(slot).setParam(key, value);', '    if (!writeHbTempo(key, value)) portFor(slot).setParam(key, value);', 'tempo undo')
    path.write_text(source)

    path = root / 'browser-test/logic/seq-engine.mjs'
    source = path.read_text()
    anchor: str = "    eq('value is the LAST bpm, 4 decimals', writes[0][1], '126.0000\\n');"
    extra: str = """
    const oldNow = Date.now;
    const retryTime = oldNow() + 1200;
    Date.now = () => retryTime;
    tempoOverrideTick();
    Date.now = oldNow;
    eq('whole-second host gets final tempo retry', writes.length, 2);
    eq('retry preserves final tempo', writes[1][1], '126.0000\\n');
    const { writeHbTempo } = await import('../../dist/esm/seq/tempo-override.js');
    eq('ordinary param is untouched', writeHbTempo('midi_fx1:chord_form', 'Triad'), false);
    eq('HB tempo is handled', writeHbTempo('midi_fx1:hb_tempo', '137'), true);
    const { seqState: tempoState } = await import('../../dist/esm/seq/state.js');
    eq('HB tempo updates sequencer mirror', tempoState.bpmX100, 13700);
"""
    source = replace_once(source, anchor, anchor + extra, 'HB shared tempo regression')
    path.write_text(source)
