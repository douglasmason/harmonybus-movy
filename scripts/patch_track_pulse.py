"""Use Move's native smooth CC pulse for the selected track button."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_track_pulse(root: Path) -> None:
    """Share the existing native animation cache across note and CC LEDs."""
    path: Path = root / 'src/seq/led-cache.ts'
    source: str = path.read_text()
    source = replace_once(source, '    lastButtonLed.set(cc, color);', '    lastAnimLed.delete(cc + 128);\n    lastButtonLed.set(cc, color);')
    source = replace_once(source, 'function emitLed(note: number, color: number, channel: number): void {', 'function emitLed(note: number, color: number, channel: number, button = false): void {')
    source = replace_once(source, '        move_midi_internal_send([0x09, 0x90 | channel, note, color]);', '''        move_midi_internal_send([button ? 0x0B : 0x09, (button ? 0xB0 : 0x90) | channel, note, color]);''')
    source = replace_once(source, '    } else {\n        setLED(note, color, true);', '    } else if (button) {\n        setButtonLED(note, color, true);\n    } else {\n        setLED(note, color, true);')
    source = replace_once(source, '    // move_midi_internal_send is a shadow_ui global;', '    if (button) lastButtonLed.delete(note);\n    // move_midi_internal_send is a shadow_ui global;')
    source = replace_once(source, 'channel: number): void {\n    const prev = lastAnimLed.get(note);', 'channel: number, button = false): void {\n    const cacheKey = note + (button ? 128 : 0);\n    const prev = lastAnimLed.get(cacheKey);')
    source = source.replace('emitLed(note, base, ANIM_NONE);', 'emitLed(note, base, ANIM_NONE, button);').replace('emitLed(note, animColor, channel);', 'emitLed(note, animColor, channel, button);').replace('lastAnimLed.set(note,', 'lastAnimLed.set(cacheKey,')
    source += '''\n/** Native CC animation uses the same two-frame handshake as pad LEDs. */
export function cachedSetAnimButtonLED(cc: number, base: number, animColor: number, channel: number): void {
    cachedSetAnimLED(cc, base, animColor, channel, true);
}
'''
    path.write_text(source)
    path = root / 'src/seq/leds.ts'
    source = path.read_text()
    source = replace_once(source, 'ANIM_NONE, ANIM_PULSE,', 'ANIM_NONE, ANIM_PULSE, ANIM_PULSE_SLOW,')
    source = replace_once(source, 'cachedSetLED, cachedSetButtonLED,', 'cachedSetLED, cachedSetButtonLED, cachedSetAnimButtonLED,')
    source = replace_once(source, '        cachedSetButtonLED(cc, trackButtonColor(t, t === appState.activeTrack.index, seqState.muted[t], blinkPhase()));', '''        const base = trackButtonColor(t, false, seqState.muted[t]);
        cachedSetAnimButtonLED(cc, base, trackButtonColor(t, true, seqState.muted[t]),
            t === appState.activeTrack.index ? ANIM_PULSE_SLOW : ANIM_NONE);''')
    source = source.replace('// Selected track alternates white with its own color, independent of notes.', '// Track color and selection target; the hardware fades smoothly between them.')
    path.write_text(source)

    source = path.read_text().replace('if (selected && blink) return C_WHITE;', 'if (selected && blink) return muted ? C_LIGHTGREY : C_WHITE;')
    path.write_text(source)
    path = root / 'browser-test/logic/seq-leds.mjs'
    source = path.read_text().replace("trackButtonColor(2, true, true), 120)", "trackButtonColor(2, true, true), 118)")
    test: str = r"""
{
    const { cachedSetAnimButtonLED, cachedSetAnimLED, cachedSetButtonLED, ledFrameReset, seqLedsInvalidate } = await import('../../dist/esm/seq/led-cache.js');
    const { ANIM_PULSE_SLOW, ANIM_NONE } = await import('../../dist/esm/seq/colors.js');
    const savedSend = globalThis.move_midi_internal_send;
    const packets = [];
    globalThis.move_midi_internal_send = packet => packets.push(packet);
    const packetIs = (label, expected) => eq(label, JSON.stringify(packets.at(-1)), JSON.stringify(expected));
    try {
        seqLedsInvalidate();ledFrameReset();
        cachedSetAnimButtonLED(43, 77, 118, ANIM_PULSE_SLOW);
        packetIs('muted track establishes dim CC base', [0x0B,0xB0,43,77]);
        ledFrameReset();cachedSetAnimButtonLED(43,77,118,ANIM_PULSE_SLOW);
        packetIs('muted track uses native smooth pulse to dim white', [0x0B,0xBA,43,118]);
        ledFrameReset();cachedSetAnimButtonLED(43,77,118,ANIM_PULSE_SLOW);
        eq('hardware pulse needs no repeated writes',packets.length,2);
        cachedSetAnimLED(43,7,120,ANIM_PULSE_SLOW);
        packetIs('note and CC caches are independent', [0x09,0x90,43,7]);
        ledFrameReset();cachedSetAnimButtonLED(43,77,118,ANIM_NONE);
        packetIs('deselection cancels native pulse', [0x0B,0xB0,43,77]);
        ledFrameReset();cachedSetAnimButtonLED(43,7,120,ANIM_PULSE_SLOW);
        packetIs('unmute restores full base before target', [0x0B,0xB0,43,7]);
        ledFrameReset();cachedSetAnimButtonLED(43,7,120,ANIM_PULSE_SLOW);
        packetIs('unmuted smooth pulse targets full white', [0x0B,0xBA,43,120]);
        cachedSetButtonLED(43,7);
        ledFrameReset();cachedSetAnimButtonLED(43,7,120,ANIM_PULSE_SLOW);
        packetIs('solid button writes invalidate animation cache', [0x0B,0xB0,43,7]);
    } finally { globalThis.move_midi_internal_send=savedSend;seqLedsInvalidate();ledFrameReset(); }
}
"""
    before, closing = source.rsplit('}', 1)
    path.write_text(before + test + '}' + closing)
