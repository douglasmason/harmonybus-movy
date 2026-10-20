"""Keep the empty-clip beat LEDs moving between engine status polls."""
from pathlib import Path


def patch_visual_beat(root: Path) -> None:
    """Add a bounded display clock, leaving sequencer and audio time untouched."""
    engine_path: Path = root / 'src/seq/engine.ts'
    source: str = engine_path.read_text()
    marker: str = 'let lastEnginePlay: boolean | null = null;'
    addition: str = '''
let visualClockSampleAt: number | null = null;

/** Display-only projection of the last engine sample. Never drives MIDI.
 * Bound stale extrapolation so a stalled/disconnected engine cannot leave
 * an apparently healthy metronome running indefinitely. */
export function visualEngineTick(now: number = Date.now()): number {
    if (!seqState.playing || !seqState.engineOk || visualClockSampleAt === null)
        return seqState.engineTick;
    const elapsed = Math.max(0, Math.min(100, now - visualClockSampleAt));
    return seqState.engineTick + elapsed * seqState.bpmX100 * 96 / 6000000;
}
'''
    if addition not in source:
        assert source.count(marker) == 1
        source = source.replace(marker, marker + addition, 1)
        source = source.replace("else if (key === 'tick') seqState.engineTick = Number(val) || 0;", "else if (key === 'tick') {\n            seqState.engineTick = Number(val) || 0;\n            visualClockSampleAt = Date.now();\n        }", 1)
        source = source.replace('    lastEnginePlay = null;', '    lastEnginePlay = null;\n    visualClockSampleAt = null;', 1)
        engine_path.write_text(source)
    leds_path: Path = root / 'src/seq/leds.ts'
    source = leds_path.read_text()
    if "import { visualEngineTick }" not in source:
        source = "import { visualEngineTick } from './engine.js';\n" + source
        source = source.replace('    const emptyMetro = seqState.lenSteps === 0 && seqState.playing;', '    const emptyMetro = seqState.lenSteps === 0 && seqState.playing;\n    const visualTick = emptyMetro ? visualEngineTick() : seqState.engineTick;', 1)
        source = source.replace('metronomeStep(i, seqState.engineTick)', 'metronomeStep(i, visualTick)', 1)
        leds_path.write_text(source)
    test_path: Path = root / 'browser-test/logic/seq-leds.mjs'
    source = test_path.read_text()
    test: str = '''
/* Empty-clip beat LEDs cross boundaries even without another status poll. */
{
    const { parseStatusForTest, resetSeqEngine, visualEngineTick } = await import('../../dist/esm/seq/engine.js');
    const { seqState, resetSeqState } = await import('../../dist/esm/seq/state.js');
    const { seqLedsTick, seqLedsInvalidate } = await import('../../dist/esm/seq/leds.js');
    const { C_GREEN, C_BLACK } = await import('../../dist/esm/seq/colors.js');
    const { STEP_NOTE_BASE } = await import('../../dist/esm/seq/constants.js');
    const originalNow = Date.now, originalLED = globalThis.setLED;
    const colors = new Map();
    let now = 1000;
    Date.now = () => now;
    globalThis.setLED = (note, color) => colors.set(note, color);
    try {
        resetSeqEngine(); resetSeqState(); seqLedsInvalidate();
        parseStatusForTest('play=1 tick=95 bpm=12000 len=0');
        for (let frame = 0; frame < 4; frame++) seqLedsTick();
        eq('empty clip initially shows beat one', colors.get(STEP_NOTE_BASE), C_GREEN);
        now += 6;
        seqLedsTick();
        for (let step = 0; step < 16; step++)
            eq('empty clip advances all beat LEDs without poll ' + step,
                colors.get(STEP_NOTE_BASE + step), step >= 4 && step < 8 ? C_GREEN : C_BLACK);
        eq('display interpolation does not change audio mirror', seqState.engineTick, 95);
        // Quarter-note boundaries across eight bars at several tempos.
        for (const bpm of [6000, 12000, 18000]) {
            for (let beat = 1; beat <= 32; beat++) {
                now += 1100;
                const sample = beat * 96 - 2;
                parseStatusForTest(`play=1 tick=${sample} bpm=${bpm} len=0`);
                now += 2 * 6000000 / (bpm * 96) + 1;
                seqLedsTick();
                for (let step = 0; step < 16; step++)
                    eq(`quarter-note light bpm=${bpm / 100} beat=${beat} step=${step}`,
                        colors.get(STEP_NOTE_BASE + step),
                        Math.floor(step / 4) === beat % 4 ? C_GREEN : C_BLACK);
                eq('beat display preserves engine position', seqState.engineTick, sample);
            }
        }
        parseStatusForTest('play=1 tick=383 bpm=24000 len=0');
        now += 3; seqLedsTick();
        eq('bar wrap follows updated tempo', colors.get(STEP_NOTE_BASE), C_GREEN);
        now += 1000;
        const bounded = visualEngineTick();
        now += 1000;
        eq('stale clock stops extrapolating', visualEngineTick(), bounded);
        parseStatusForTest('play=0 tick=384 bpm=24000 len=0');
        now += 50;
        eq('stopped transport never extrapolates', visualEngineTick(), 384);
        parseStatusForTest('play=1 tick=0 bpm=6000 len=0');
        eq('restart anchors at zero', visualEngineTick(), 0);
        now -= 10;
        eq('wall clock reversal cannot rewind transport', visualEngineTick(), 0);
        resetSeqEngine(); now += 100;
        eq('engine reset clears visual anchor', visualEngineTick(), 0);
    } finally {
        Date.now = originalNow; globalThis.setLED = originalLED;
        resetSeqEngine(); resetSeqState(); seqLedsInvalidate();
    }
}
'''
    marker = '/* ── the Mute button reports that something is silenced'
    if test not in source:
        assert source.count(marker) == 1
        test_path.write_text(source.replace(marker, test + '\n' + marker, 1))
