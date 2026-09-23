"""Record editable input gestures and make track selection visible."""
from pathlib import Path
from patch_movy_stock_schwung_pages import replace_once


def patch_input_recording(root: Path) -> None:
    """Preserve raw capture while retaining legacy rendered-note playback."""
    path: Path = root / "engine/crates/movy-dsp/src/lib.rs"
    source: str = path.read_text()
    start: int = source.index("                // The UI's non/nof capture is raw input.")
    end: int = source.index("                apply_batch(&mut self.engine, &filtered, &mut self.out);", start)
    end += len("                apply_batch(&mut self.engine, &filtered, &mut self.out);")
    source = source[:start] + """                // Normal Record and retrospective Capture retain the gesture.
                // Legacy rendered notes still bypass generation on playback.
                apply_batch(&mut self.engine, val, &mut self.out);""" + source[end:]
    start = source.index("        hb_record::QUEUE.drain(|track,status,pitch,velocity|{")
    end = source.index("        });", start) + len("        });")
    source = source[:start] + """        // Cable 3 carries the old automatic conductor-output recording feed.
        // Drain it without recording a second copy or releasing raw input owners.
        // Explicit routed output capture uses the receiver's normal MIDI input.
        hb_record::QUEUE.drain(|_,_,_,_|{});""" + source[end:]
    path.write_text(source)

    path = root / "src/seq/leds.ts"
    source = path.read_text()
    start = source.index("// Track buttons: sounding note")
    end = source.index("/* Four buttons, always", start)
    source = source[:start] + """// Selection has a stable white marker independent of sounding notes and pads.
// Muted selection alternates white/dim track color; Mute retains its own LED.
export function trackButtonColor(track: number, selected: boolean, muted: boolean, blink = true): number {
    if (selected && (!muted || blink)) return C_WHITE;
    return muted ? trackColorDim(track) : trackColor(track);
}

""" + source[end:]
    source = replace_once(source,
        "trackButtonColor(t, trackHasActiveNote(t), seqState.muted[t])",
        "trackButtonColor(t, t === appState.activeTrack.index, seqState.muted[t], blinkPhase())",
        "selected track button")
    path.write_text(source)
    path = root / "browser-test/logic/seq-leds.mjs"
    source = path.read_text().replace("active = white pulse", "selected = steady white").replace("muted+active still white", "muted selection white phase")
    anchor: str = "    eq('muted selection white phase', trackButtonColor(2, true, true), 120);"
    source = replace_once(source, anchor, anchor + "\n    eq('muted selection dim phase', trackButtonColor(2, true, true, false), trackColorDim(2));", "muted selected cue")
    path.write_text(source)
