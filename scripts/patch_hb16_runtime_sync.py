#!/usr/bin/env python3
"""HarmonyBus-Movy hb.16 runtime fixes.

- Hosted chain MIDI is channel 1 by construction, so seed/normalize HB Source Ch
  to channel 1 instead of Auto. This lets strict conductor instances accept the
  same isolated chain events followers already receive.
- Feed audio-thread pad routing into seq-core live_note_on/off before the hosted
  chain, so Record/Capture see the exact mapped note that is actually heard.
- Make the dedicated HarmonyBus build transport-linked by default and after set
  restore. Native Move realtime remains authoritative; Movy->Move injection is
  still gated by the host capability probe.
"""
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


def patch_ui_state(path: Path) -> None:
    source: str = path.read_text()
    source = source.replace(
        "const HB_CONDUCTOR_STATE = 'hb15,0,0,0,25,2,0,0,0,0,0,0,2,-1,0,0,0,0,0,0,20,60,0,0,0,0';",
        "const HB_CONDUCTOR_STATE = 'hb15,0,0,0,25,2,0,0,0,0,0,0,2,0,0,0,0,0,0,20,60,0,0,0,0';",
    )
    source = source.replace(
        "'hb15,1,0,0,25,2,0,0,0,0,0,0,1,-1,0,0,0,0,0,0,20,60,0,0,0,0'",
        "'hb15,1,0,0,25,2,0,0,0,0,0,0,1,0,0,0,0,0,0,20,60,0,0,0,0'",
    )
    source = source.replace(
        "'hb15,1,0,0,25,2,0,0,0,0,0,0,2,-1,0,0,0,0,0,0,20,60,0,0,0,0'",
        "'hb15,1,0,0,25,2,0,0,0,0,0,0,2,0,0,0,0,0,0,20,60,0,0,0,0'",
    )
    source = source.replace(
        "'hb15,1,0,0,25,2,0,0,0,0,0,0,3,-1,0,0,0,0,0,0,20,60,0,0,0,0'",
        "'hb15,1,0,0,25,2,0,0,0,0,0,0,3,0,0,0,0,0,0,20,60,0,0,0,0'",
    )

    seam = """function hbStateForTrack(track: number): string {
    const pos = track % 4;
    return pos === 0 ? HB_CONDUCTOR_STATE : HB_FOLLOWER_STATE[pos - 1];
}
"""
    after = seam + """
function normalizeMovyHbSourceChannel(state: string | undefined): string | undefined {
    if (!state || !/^hb(?:1[4-6]),/.test(state)) return state;
    const fields = state.split(',');
    /* Token 13 is source_channel (prefix is token 0). Hosted Movy chains feed
       their isolated MIDI-FX lane on channel 1, so Auto is unnecessarily
       ambiguous for strict conductor filtering. Preserve explicit user choices. */
    if (fields.length > 13 && fields[13] === '-1') fields[13] = '0';
    return fields.join(',');
}
"""
    source = replace_once(source, seam, after, "HB source-channel normalizer helper")

    old_existing = """        const hbComp: HbComp = existingHb
            ? { ...existingHb }
            : { c: 'midi_fx1', m: 'harmonybus', s: hbStateForTrack(t) };
"""
    new_existing = """        const hbComp: HbComp = existingHb
            ? { ...existingHb, s: normalizeMovyHbSourceChannel(existingHb.s) }
            : { c: 'midi_fx1', m: 'harmonybus', s: hbStateForTrack(t) };
"""
    source = replace_once(source, old_existing, new_existing, "existing HB Source Ch normalization")
    path.write_text(source)


def patch_dsp_pad_capture(path: Path) -> None:
    source: str = path.read_text()
    before = """                if let Some((chain, pitch, vel, on)) = i.pads.route(status, d1, d2) {
                    let m = if on { [0x90, pitch, vel] } else { [0x80, pitch, 0] };
                    i.chains.on_midi(chain, &m, MOVE_MIDI_SOURCE_INTERNAL);
                    return;
                }
"""
    after = """                if let Some((chain, pitch, vel, on)) = i.pads.route(status, d1, d2) {
                    /* The fast pad route is the authoritative live event for a
                     * Movy-hosted track. Feed seq-core from this exact resolved
                     * tuple before sounding the chain so Record and retroactive
                     * Capture store the same track/pitch/timing the player hears. */
                    if on {
                        i.engine.live_note_on(chain, pitch, vel);
                    } else {
                        i.engine.live_note_off(chain, pitch);
                    }
                    let m = if on { [0x90, pitch, vel] } else { [0x80, pitch, 0] };
                    i.chains.on_midi(chain, &m, MOVE_MIDI_SOURCE_INTERNAL);
                    return;
                }
"""
    source = replace_once(source, before, after, "audio-thread pad -> seq-core capture")
    path.write_text(source)


def patch_transport(engine_path: Path, persist_path: Path) -> None:
    engine: str = engine_path.read_text()
    engine = replace_once(
        engine,
        "            link_enabled: false,\n",
        "            link_enabled: true,\n",
        "HarmonyBus transport default",
    )
    engine_path.write_text(engine)

    persist: str = persist_path.read_text()
    persist = replace_once(
        persist,
        "    // Link defaults off; a legacy save without a `link` line loads with it off.\n    engine.link_enabled = false;\n",
        "    // Dedicated HarmonyBus build follows native Move transport by default.\n    engine.link_enabled = true;\n",
        "persist link default",
    )
    end_seam = """    // Slots that stayed empty must carry the current default so the next clip
    // recorded into them is born with it. Loaded clips keep their own value.
    engine.reseed_empty_clips();
    true
}
"""
    end_after = """    // Slots that stayed empty must carry the current default so the next clip
    // recorded into them is born with it. Loaded clips keep their own value.
    engine.reseed_empty_clips();
    /* HarmonyBus-Movy is a synchronized source-bank workflow: a stale saved
       LINK=0 must not leave its clips free-running against the native render
       tracks. The capability gate still protects the reverse MoveInject path. */
    engine.link_enabled = true;
    true
}
"""
    persist = replace_once(persist, end_seam, end_after, "force link after restore")
    persist_path.write_text(persist)


def main() -> int:
    parser: argparse.ArgumentParser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args: argparse.Namespace = parser.parse_args()
    root: Path = args.movy_root.resolve()
    patch_ui_state(root / "src/seq/ui-state.ts")
    patch_dsp_pad_capture(root / "engine/crates/movy-dsp/src/lib.rs")
    patch_transport(
        root / "engine/crates/seq-core/src/engine.rs",
        root / "engine/crates/seq-core/src/persist.rs",
    )
    print("HarmonyBus Movy hb.16 runtime sync/capture patch applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
