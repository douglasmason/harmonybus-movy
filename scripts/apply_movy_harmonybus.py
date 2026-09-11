#!/usr/bin/env python3
"""Apply the HarmonyBus source-bank integration to a schwung-movy checkout."""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Callable


def replace_once(source: str, before: str, after: str, seam: str) -> str:
    """Replace exactly one upstream block, or accept an already-applied block."""
    if after in source:
        return source
    count: int = source.count(before)
    if count != 1:
        raise RuntimeError(f"Movy seam {seam!r} drifted: expected 1 match, found {count}")
    return source.replace(before, after, 1)


def transform_track_mutes(source: str) -> str:
    """Make tracks 5-8 use chain audio mute while MIDI sequencing stays alive."""
    source = replace_once(
        source,
        "import { mlog } from '../log.js';\n",
        "import { mlog } from '../log.js';\n"
        "import { MIX_KEY, packMixValue, parseMixValue, readMix } from './mix-io.js';\n"
        "import { portFor } from '../track/registry.js';\n",
        "track-mutes imports",
    )
    source = replace_once(
        source,
        "const solo: boolean[] = new Array(TRACK_COUNT).fill(false) as boolean[];\n"
        "let base: boolean[] | null = null;   /* user's own mutes, held while a solo is up */\n",
        "const solo: boolean[] = new Array(TRACK_COUNT).fill(false) as boolean[];\n"
        "let base: boolean[] | null = null;   /* user's own mutes, held while a solo is up */\n"
        "const HB_SOURCE_FIRST = 4;\n"
        "const HB_SOURCE_LAST = 7;\n"
        "const sourceAudioMuted: boolean[] = new Array(TRACK_COUNT).fill(false) as boolean[];\n\n"
        "function isHbSourceTrack(track: number): boolean {\n"
        "    return track >= HB_SOURCE_FIRST && track <= HB_SOURCE_LAST;\n"
        "}\n",
        "track-mutes state",
    )
    source = replace_once(
        source,
        "export function isMuted(track: number): boolean {\n"
        "    return base ? base[track] : seqState.muted[track];\n"
        "}\n",
        "export function isMuted(track: number): boolean {\n"
        "    if (isHbSourceTrack(track)) return sourceAudioMuted[track];\n"
        "    return base ? base[track] : seqState.muted[track];\n"
        "}\n\n"
        "function setSourceAudioMute(track: number, want: boolean): void {\n"
        "    const mix = readMix(track);\n"
        "    mix.muted = want;\n"
        "    portFor(track).setParam(MIX_KEY, packMixValue(mix));\n"
        "    sourceAudioMuted[track] = want;\n"
        "    markUiStateDirty();\n"
        "}\n",
        "track-mutes isMuted",
    )
    source = replace_once(
        source,
        "export function toggleMute(track: number): void {\n"
        "    if (track < 0 || track >= TRACK_COUNT) return;\n"
        "    asOneEdit(isMuted(track) ? 'UNMUTE' : 'MUTE', trackLabel(track), () => {\n",
        "export function toggleMute(track: number): void {\n"
        "    if (track < 0 || track >= TRACK_COUNT) return;\n"
        "    if (isHbSourceTrack(track)) {\n"
        "        const next = !sourceAudioMuted[track];\n"
        "        setSourceAudioMute(track, next);\n"
        "        mlog('source audio mute t=' + track + ' -> ' + (next ? 1 : 0));\n"
        "        seqToast('T' + (track + 1) + (next ? ' SRC MUTED' : ' SRC UNMUTED'));\n"
        "        return;\n"
        "    }\n"
        "    asOneEdit(isMuted(track) ? 'UNMUTE' : 'MUTE', trackLabel(track), () => {\n",
        "track-mutes toggleMute",
    )
    source = replace_once(
        source,
        "export function resetTrackMutes(): void {\n"
        "    for (let t = 0; t < TRACK_COUNT; t++) solo[t] = false;\n"
        "    base = null;\n"
        "}\n",
        "export function resetTrackMutes(): void {\n"
        "    for (let t = 0; t < TRACK_COUNT; t++) solo[t] = false;\n"
        "    for (let t = HB_SOURCE_FIRST; t <= HB_SOURCE_LAST; t++) sourceAudioMuted[t] = false;\n"
        "    base = null;\n"
        "}\n\n"
        "export function restoreSourceAudioMutes(chains: unknown): void {\n"
        "    for (let t = HB_SOURCE_FIRST; t <= HB_SOURCE_LAST; t++) sourceAudioMuted[t] = false;\n"
        "    if (!Array.isArray(chains)) return;\n"
        "    for (const chain of chains) {\n"
        "        if (!chain || typeof chain !== 'object') continue;\n"
        "        const track = (chain as { t?: unknown }).t;\n"
        "        const rawMix = (chain as { mix?: unknown }).mix;\n"
        "        if (typeof track !== 'number' || !isHbSourceTrack(track) || typeof rawMix !== 'string') continue;\n"
        "        sourceAudioMuted[track] = parseMixValue(rawMix).muted;\n"
        "    }\n"
        "}\n",
        "track-mutes restore",
    )
    return source


def transform_focus(source: str) -> str:
    """Expose only the native quartet and the HarmonyBus source quartet."""
    source = replace_once(
        source,
        "import { GROUP_SIZE, TRACK_COUNT, trackGroup, trackRef } from './ref.js';\n",
        "import { GROUP_SIZE, trackGroup, trackRef } from './ref.js';\n\n"
        "/* HarmonyBus UI exposes exactly native 1-4 and source 5-8. */\n"
        "const HB_VISIBLE_TRACK_COUNT = 8;\n",
        "focus imports",
    )
    source = replace_once(source, "if (index < 0 || index >= TRACK_COUNT) return;", "if (index < 0 || index >= HB_VISIBLE_TRACK_COUNT) return;", "focus select")
    source = replace_once(source, "if (g < 0 || g * GROUP_SIZE >= TRACK_COUNT) return false;", "if (g < 0 || g * GROUP_SIZE >= HB_VISIBLE_TRACK_COUNT) return false;", "focus step")
    source = replace_once(source, "if (g < 0 || g * GROUP_SIZE >= TRACK_COUNT) return -1;", "if (g < 0 || g * GROUP_SIZE >= HB_VISIBLE_TRACK_COUNT) return -1;", "group step")
    return source


HB_SOURCE_CHAINS: str = """const HB_SOURCE_CHAINS = [
    { t: 4, comp: [
        { c: 'midi_fx1', m: 'harmonybus', s: 'hb15,0,0,0,25,2,0,0,0,0,0,0,2,0,0,0,1,0,0,0,20,60,0,0,0,0' },
        { c: 'synth', m: 'plaits' },
    ] },
    { t: 5, comp: [
        { c: 'midi_fx1', m: 'harmonybus', s: 'hb15,1,0,0,25,2,0,0,0,0,0,0,1,0,0,0,1,0,0,0,20,60,0,0,0,0' },
        { c: 'synth', m: 'plaits' },
    ] },
    { t: 6, comp: [
        { c: 'midi_fx1', m: 'harmonybus', s: 'hb15,1,0,0,25,2,0,0,0,0,0,0,2,0,0,0,1,0,0,0,20,60,0,0,0,0' },
        { c: 'synth', m: 'plaits' },
    ] },
    { t: 7, comp: [
        { c: 'midi_fx1', m: 'harmonybus', s: 'hb15,1,0,0,25,2,0,0,0,0,0,0,3,0,0,0,1,0,0,0,20,60,0,0,0,0' },
        { c: 'synth', m: 'plaits' },
    ] },
];
"""


def transform_ui_state(source: str) -> str:
    """Restore audio-mute mirrors and seed fresh sets with tracks 5-8."""
    source = replace_once(
        source,
        "import { mutesSnapshot, restoreMutes, resetTrackMutes } from '../mixer/track-mutes.js';\n",
        "import { mutesSnapshot, restoreMutes, resetTrackMutes, restoreSourceAudioMutes }\n"
        "    from '../mixer/track-mutes.js';\n",
        "ui-state mute import",
    )
    source = replace_once(
        source,
        "import { loadSetHostChoice } from '../track/host-mode.js';\n",
        "import { loadSetHostChoice, setMovyTracks } from '../track/host-mode.js';\n\n" + HB_SOURCE_CHAINS,
        "ui-state host import",
    )
    source = replace_once(
        source,
        "        loadSetHostChoice(o.flags && typeof o.flags === 'object' ? o.flags : {});\n",
        "        loadSetHostChoice(o.flags && typeof o.flags === 'object' ? o.flags : {});\n"
        "        restoreSourceAudioMutes(o.chains);\n",
        "ui-state restore source mutes",
    )
    source = replace_once(
        source,
        "    /* A Set with no UI blob at all is new work: it takes the shipped default,\n"
        "     * which puts tracks 1-4 on movy's own chains. */\n"
        "    loadSetHostChoice(null);\n"
        "    /* A Set with no UI blob wants no movy chains — the same clean slate schwung\n"
        "     * gives an unseen set when it seeds empty slots. */\n"
        "    restoreChains(null, null);\n",
        "    /* Dedicated HarmonyBus build: native 1-4 remain the audible/export bank;\n"
        "     * Movy hosts the pre-render source bank on 5-8. */\n"
        "    setMovyTracks(false);\n"
        "    restoreChains(HB_SOURCE_CHAINS, null);\n",
        "ui-state fresh bank",
    )
    return source


def update_file(path: Path, transform: Callable[[str], str]) -> None:
    """Apply one transform in place."""
    original: str = path.read_text()
    updated: str = transform(original)
    path.write_text(updated)
    print(f"HarmonyBus Movy integration applied: {path}")


def main() -> int:
    """Patch a clean or already-patched Movy checkout in place."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args: argparse.Namespace = parser.parse_args()
    root: Path = args.movy_root.resolve()

    update_file(root / "src/mixer/track-mutes.ts", transform_track_mutes)
    update_file(root / "src/track/focus.ts", transform_focus)
    update_file(root / "src/seq/ui-state.ts", transform_ui_state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
