#!/usr/bin/env python3
"""Fix HarmonyBus quartet-leader defaults without overwriting saved HB state."""
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(source: str, before: str, after: str, seam: str) -> str:
    """Replace one generated-source seam, accepting an already-applied patch."""
    if after in source:
        return source
    count: int = source.count(before)
    if count != 1:
        raise RuntimeError(f"HB leader seam {seam!r} drifted: expected 1 match, found {count}")
    return source.replace(before, after, 1)


def patch_ui_state(path: Path) -> None:
    """Seed conductor leaders to ch3 and preserve user-edited HarmonyBus state."""
    source: str = path.read_text()

    source = replace_once(
        source,
        "const HB_CONDUCTOR_STATE = 'hb15,0,0,0,25,2,0,0,0,0,0,0,-1,-1,0,0,0,0,0,0,20,60,0,0,0,0';",
        "/* Quartet leaders (T5/T9/T13) monitor/render on native Track 3 by default.\n"
        " * render_channel is zero-based, so 2 means MIDI channel 3. */\n"
        "const HB_CONDUCTOR_STATE = 'hb15,0,0,0,25,2,0,0,0,0,0,0,2,-1,0,0,0,0,0,0,20,60,0,0,0,0';",
        "conductor render channel",
    )

    before: str = """        const comps = Array.isArray(prior?.comp) ? [...prior!.comp] : [];
        const withoutHb = comps.filter((c) => c?.c !== 'midi_fx1');
        const synthExists = withoutHb.some((c) => c?.c === 'synth');
        const normalized: HbTrack = {
            ...(prior ?? { t, comp: [] }),
            t,
            comp: [
                { c: 'midi_fx1', m: 'harmonybus', s: hbStateForTrack(t) },
                ...withoutHb,
                ...(synthExists ? [] : [{ c: 'synth', m: 'plaits' }]),
            ],
        };
"""
    after: str = """        const comps = Array.isArray(prior?.comp) ? [...prior!.comp] : [];
        const existingHb = comps.find((c) => c?.c === 'midi_fx1' && c?.m === 'harmonybus');
        const withoutHb = comps.filter((c) => c?.c !== 'midi_fx1');
        const synthExists = withoutHb.some((c) => c?.c === 'synth');
        const hbComp: HbComp = existingHb
            ? { ...existingHb }
            : { c: 'midi_fx1', m: 'harmonybus', s: hbStateForTrack(t) };
        const normalized: HbTrack = {
            ...(prior ?? { t, comp: [] }),
            t,
            comp: [
                hbComp,
                ...withoutHb,
                ...(synthExists ? [] : [{ c: 'synth', m: 'plaits' }]),
            ],
        };
"""
    source = replace_once(source, before, after, "preserve saved HarmonyBus state")
    path.write_text(source)


def main() -> int:
    """Patch the generated Movy ui-state source."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args: argparse.Namespace = parser.parse_args()
    patch_ui_state(args.movy_root.resolve() / "src/seq/ui-state.ts")
    print("HarmonyBus Movy: quartet leaders default to ch3; saved HB state preserved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
