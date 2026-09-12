#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(source: str, before: str, after: str, label: str) -> str:
    if after in source:
        return source
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: expected one seam, found {count}")
    return source.replace(before, after, 1)


def patch_router(path: Path) -> None:
    source = path.read_text()
    before = """            knobModel()?.handleKnobTouch(d1);
            {   /* Schwung shows the held param's full name and value in the
                 * header strip, and a dive is a click WITH a knob held — both
                 * need the same finger movy just saw. */
                const m2 = knobModel();
                const sp2 = m2 ? schwungActiveFor(appState.activeTrack.index,
                                m2.getComponentKey ? m2.getComponentKey() : 'synth') : null;
                if (sp2) sp2.knobTouch(d1, true);
            }
"""
    after = """            {   /* A hosted Schwung page owns knob touch completely. Calling
                 * Movy's model too opens Movy's independent enum overlay on top
                 * of Schwung's correct transient peek. */
                const m2 = knobModel();
                const sp2 = m2 ? schwungActiveFor(appState.activeTrack.index,
                                m2.getComponentKey ? m2.getComponentKey() : 'synth') : null;
                if (sp2) sp2.knobTouch(d1, true);
                else m2?.handleKnobTouch(d1);
            }
"""
    source = replace_once(source, before, after, "knob touch ownership")

    before_release = """            const info = knobInfoFor(d1);
            if (knobModel()?.handleKnobRelease(d1)) seqToast('Wrong preset type');
            {
                const m2 = knobModel();
                const sp2 = m2 ? schwungActiveFor(appState.activeTrack.index,
                                m2.getComponentKey ? m2.getComponentKey() : 'synth') : null;
                if (sp2) sp2.knobTouch(d1, false);
            }
"""
    after_release = """            const info = knobInfoFor(d1);
            {
                const m2 = knobModel();
                const sp2 = m2 ? schwungActiveFor(appState.activeTrack.index,
                                m2.getComponentKey ? m2.getComponentKey() : 'synth') : null;
                if (sp2) sp2.knobTouch(d1, false);
                else if (m2?.handleKnobRelease(d1)) seqToast('Wrong preset type');
            }
"""
    source = replace_once(source, before_release, after_release, "knob release ownership")
    path.write_text(source)


def patch_ui_state(path: Path) -> None:
    source = path.read_text()

    before_normalized = """        const normalized: HbTrack = {
            ...(prior ?? { t, comp: [] }),
            t,
            comp: [
"""
    after_normalized = """        const normalized: HbTrack = {
            ...(prior ?? { t, comp: [], mix: '1,0,1,0,0,0' }),
            t,
            comp: [
"""
    source = replace_once(source, before_normalized, after_normalized, "Movy-track default audio mute")
    path.write_text(source)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args = parser.parse_args()
    root = args.movy_root.resolve()
    patch_router(root / "src/midi/router.ts")
    patch_ui_state(root / "src/seq/ui-state.ts")
    print("HarmonyBus Movy defaults/overlay patch applied: all Movy sources audio-muted; native tracks untouched")


if __name__ == "__main__":
    main()
