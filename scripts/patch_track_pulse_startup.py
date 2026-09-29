"""Protect track pulse base colors during initial LED ownership handoff."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_track_pulse_startup(root: Path) -> None:
    """Let CC base writes drain and repair the initial native LED clear."""
    path: Path = root / 'src/seq/led-cache.ts'
    source: str = path.read_text()
    source = replace_once(source, 'interface AnimState { base: number; anim: number; animColor: number; }', 'interface AnimState { base: number; anim: number; animColor: number; baseAt: number; }')
    source = source.replace('{ base, anim: ANIM_NONE, animColor: base }', '{ base, anim: ANIM_NONE, animColor: base, baseAt: Date.now() }')
    source = replace_once(source, '    if (prev.anim === channel && prev.animColor === animColor) return;', '''    if (prev.anim === channel && prev.animColor === animColor) return;
    // The host coalesces CC writes by address, including animation channels.
    // A second JS frame is not proof that a startup base reached the device.
    if (button && note >= 40 && note <= 43 && Date.now()-prev.baseAt < 60) return;''')
    source = source.replace('{ base, anim: channel, animColor }', '{ base, anim: channel, animColor, baseAt: prev.baseAt }')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text()
    source = replace_once(source, 'let ledRepeatTicks = -1;\nconst LED_REPEAT_TICKS = 45;', 'const LED_REPEAT_TICKS = 45;\nlet ledRepeatTicks = LED_REPEAT_TICKS;')
    path.write_text(source)
    path = root / 'browser-test/logic/seq-leds.mjs'
    source = path.read_text()
    source = replace_once(source, '    const savedSend = globalThis.move_midi_internal_send;\n    const packets = [];', '''    const savedSend = globalThis.move_midi_internal_send;
    const realPulseClock = Date.now;let pulseNow=1000;Date.now=()=>pulseNow;
    const packets = [];''')
    source = replace_once(source, "        ledFrameReset();cachedSetAnimButtonLED(43,77,118,ANIM_PULSE_SLOW);\n        packetIs('muted track uses", """        ledFrameReset();cachedSetAnimButtonLED(43,77,118,ANIM_PULSE_SLOW);
        eq('track base is not overwritten on the next fast frame',packets.length,1);
        pulseNow+=60;ledFrameReset();cachedSetAnimButtonLED(43,77,118,ANIM_PULSE_SLOW);
        packetIs('muted track uses""")
    source = replace_once(source, "        ledFrameReset();cachedSetAnimButtonLED(43,7,120,ANIM_PULSE_SLOW);\n        packetIs('unmuted smooth", "        pulseNow+=60;ledFrameReset();cachedSetAnimButtonLED(43,7,120,ANIM_PULSE_SLOW);\n        packetIs('unmuted smooth")
    source = source.replace('globalThis.move_midi_internal_send=savedSend;seqLedsInvalidate();ledFrameReset();', 'Date.now=realPulseClock;globalThis.move_midi_internal_send=savedSend;seqLedsInvalidate();ledFrameReset();')
    path.write_text(source)
    path = root / 'browser-test/app-loop.mjs'
    source = path.read_text()
    source = replace_once(source, '    // Time passing sends nothing further: the pulse is not redrawn per frame.', '''    // Allow the track CC base to drain before checking steady-state traffic.
    t += 60;advance(2);
    // Time passing sends nothing further: the pulse is not redrawn per frame.''')
    path.write_text(source)
