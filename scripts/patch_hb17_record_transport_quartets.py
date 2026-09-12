#!/usr/bin/env python3
"""hb.17: restore normal recording, force four identical HB quartets, hard-follow native transport."""
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(source: str, before: str, after: str, label: str) -> str:
    if after in source:
        return source
    count: int = source.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: expected one seam, found {count}")
    return source.replace(before, after, 1)


def patch_quartets(path: Path) -> None:
    source: str = path.read_text()
    old = """function normalizeMovyHbSourceChannel(state: string | undefined): string | undefined {
    if (!state || !/^hb(?:1[4-6]),/.test(state)) return state;
    const fields = state.split(',');
    /* Token 13 is source_channel (prefix is token 0). Hosted Movy chains feed
       their isolated MIDI-FX lane on channel 1, so Auto is unnecessarily
       ambiguous for strict conductor filtering. Preserve explicit user choices. */
    if (fields.length > 13 && fields[13] === '-1') fields[13] = '0';
    return fields.join(',');
}
"""
    new = """function normalizeMovyHbRouting(track: number, state: string | undefined): string | undefined {
    if (!state || !/^hb(?:1[4-6]),/.test(state)) return state;
    const fields = state.split(',');
    if (fields.length <= 13) return state;
    const pos = track % 4;
    /* Dedicated HarmonyBus-Movy has four identical source quartets.  Role,
       Render To Ch and Source Ch are structural routing, not per-set musical
       choices, so normalize them on load even for sets created by older hb builds. */
    fields[1] = pos === 0 ? '0' : '1';                    // conductor / follower
    fields[12] = String(pos === 0 ? 2 : (pos === 1 ? 1 : pos)); // ch3 / ch2 / ch3 / ch4
    fields[13] = '0';                                    // hosted chain MIDI = ch1
    return fields.join(',');
}
"""
    source = replace_once(source, old, new, "quartet routing helper")
    source = source.replace(
        "? { ...existingHb, s: normalizeMovyHbSourceChannel(existingHb.s) }",
        "? { ...existingHb, s: normalizeMovyHbRouting(t, existingHb.s) }",
    )
    path.write_text(source)


def patch_capture_only(engine_path: Path, dsp_path: Path) -> None:
    engine: str = engine_path.read_text()
    seam = """    pub fn live_note_on(&mut self, track: usize, pitch: u8, vel: u8) {
        self.capture_push(track, pitch, vel, true);
"""
    after = """    /// Feed retroactive Capture without touching the armed-recording ledger.
    /// Movy's fast audio-thread pad path uses this; normal Record keeps its
    /// original UI/command path and therefore cannot double-write notes.
    pub fn capture_live_note(&mut self, track: usize, pitch: u8, vel: u8, on: bool) {
        self.capture_push(track, pitch, if on { vel } else { 0 }, on);
    }

    pub fn live_note_on(&mut self, track: usize, pitch: u8, vel: u8) {
        self.capture_push(track, pitch, vel, true);
"""
    engine = replace_once(engine, seam, after, "capture-only API")
    engine_path.write_text(engine)

    dsp: str = dsp_path.read_text()
    old = """                    if on {
                        i.engine.live_note_on(chain, pitch, vel);
                    } else {
                        i.engine.live_note_off(chain, pitch);
                    }
"""
    new = """                    i.engine.capture_live_note(chain, pitch, vel, on);
"""
    dsp = replace_once(dsp, old, new, "fast-pad capture-only feed")
    dsp_path.write_text(dsp)


def patch_native_transport(engine_path: Path) -> None:
    source: str = engine_path.read_text()
    source = source.replace(
        "if self.link_enabled && !self.playing {\n                    self.pending_play = false;\n                    self.play();\n                }",
        "if !self.playing {\n                    self.pending_play = false;\n                    self.play();\n                }",
    )
    source = source.replace(
        "if self.link_enabled && self.playing {\n                    self.stop(out);\n                }",
        "if self.playing {\n                    self.stop(out);\n                }",
    )
    engine_path.write_text(source)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args = parser.parse_args()
    root: Path = args.movy_root.resolve()
    patch_quartets(root / "src/seq/ui-state.ts")
    patch_capture_only(
        root / "engine/crates/seq-core/src/engine.rs",
        root / "engine/crates/movy-dsp/src/lib.rs",
    )
    patch_native_transport(root / "engine/crates/seq-core/src/engine.rs")
    print("hb.17 quartet/record/native-transport patch applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
