/* Beat LEDs must reach the device before potentially slow automation reads. */
{
    resetApp();
    const { requestLabelSync, parseStatusForTest } = await import('../dist/esm/seq/engine.js');
    const { seqLedsInvalidate } = await import('../dist/esm/seq/leds.js');
    const originalRead = globalThis.host_module_get_param;
    const originalLED = globalThis.setLED;
    const originalNow = Date.now;
    let now = originalNow() + 100;
    let readAt = null, beatAt = null;
    Date.now = () => now;
    globalThis.host_module_get_param = (key) => {
        if (key === 'alabels') { readAt = now; now += 180; }
        return originalRead(key);
    };
    globalThis.setLED = (note, color, ...rest) => {
        if (note === STEP_NOTE_BASE + 4 && color === 11 && beatAt === null) beatAt = now;
        originalLED(note, color, ...rest);
    };
    try {
        engine.status.play = 1; engine.status.tick = 96; engine.status.bpm = 12000;
        engine.status.len = 0;
        parseStatusForTest('play=1 tick=96 bpm=12000 len=0');
        seqLedsInvalidate(); requestLabelSync(); advance();
        eq('slow automation read exercised', readAt !== null, true);
        eq('beat two LED precedes slow automation read', beatAt !== null && beatAt <= readAt, true);
    } finally {
        globalThis.host_module_get_param = originalRead;
        globalThis.setLED = originalLED; Date.now = originalNow;
        resetApp();
    }
}
