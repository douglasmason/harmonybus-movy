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
    """Make tracks 5-16 use chain audio mute while MIDI sequencing stays alive."""
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
        "const HB_SOURCE_LAST = 15;\n"
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


def transform_colors(source: str) -> str:
    """Use the same role colors in each HarmonyBus source quartet."""
    source = replace_once(
        source,
        "    9, 2, 23, 95,         // G2: Bright Lime, Orange Red, Neon Pink, Azure Blue dim\n"
        "    95, 23, 3, 9,         // G3: Azure Blue dim, Neon Pink, Bright Orange, Bright Lime\n"
        "    23, 95, 9, 69,        // G4: Neon Pink, Azure Blue dim, Bright Lime, Bright Orange dim\n",
        "    9, 7, 95, 23,         // G2/HB A: conductor; followers match native T2/T3/T4\n"
        "    9, 7, 95, 23,         // G3/HB B: same four roles, same four colors\n"
        "    9, 7, 95, 23,         // G4/HB C: same four roles, same four colors\n",
        "HarmonyBus bright track colors",
    )
    source = replace_once(
        source,
        "    81, 71, 109, 103,     // Bright Lime dim, Tan dim, Neon Pink dim, Electric Violet dim\n"
        "    103, 109, 6, 81,      // Electric Violet dim, Neon Pink dim, Ochre, Bright Lime dim\n"
        "    109, 103, 81, 71,     // Neon Pink dim, Electric Violet dim, Bright Lime dim, Tan dim\n",
        "    81, 77, 103, 109,     // G2/HB A dim\n"
        "    81, 77, 103, 109,     // G3/HB B dim\n"
        "    81, 77, 103, 109,     // G4/HB C dim\n",
        "HarmonyBus dim track colors",
    )
    return source


HB_BANK_HELPERS: str = r"""
const HB_CONDUCTOR_STATE = 'hb15,0,0,0,25,2,0,0,0,0,0,0,2,0,0,0,1,0,0,0,20,60,0,0,0,0';
const HB_FOLLOWER_STATE = [
    'hb15,1,0,0,25,2,0,0,0,0,0,0,1,0,0,0,1,0,0,0,20,60,0,0,0,0',
    'hb15,1,0,0,25,2,0,0,0,0,0,0,2,0,0,0,1,0,0,0,20,60,0,0,0,0',
    'hb15,1,0,0,25,2,0,0,0,0,0,0,3,0,0,0,1,0,0,0,20,60,0,0,0,0',
];

type HbComp = { c: string; m: string; s?: string };
type HbTrack = { t: number; comp: HbComp[]; lfo?: string[]; mix?: string };

function hbStateForTrack(track: number): string {
    const pos = (track - 4) % 4;
    return pos === 0 ? HB_CONDUCTOR_STATE : HB_FOLLOWER_STATE[pos - 1];
}

function normalizeHarmonyBusBanks(raw: unknown): HbTrack[] {
    const saved = Array.isArray(raw) ? raw : [];
    const byTrack = new Map<number, HbTrack>();
    for (const entry of saved) {
        if (!entry || typeof entry !== 'object') continue;
        const t = (entry as { t?: unknown }).t;
        if (typeof t !== 'number') continue;
        byTrack.set(t, entry as HbTrack);
    }
    for (let t = 4; t < 16; t++) {
        const prior = byTrack.get(t);
        const comps = Array.isArray(prior?.comp) ? [...prior!.comp] : [];
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
        byTrack.set(t, normalized);
    }
    return [...byTrack.values()].sort((a, b) => a.t - b.t);
}

function configureNativeHarmonyBusDestinations(): void {
    if (typeof shadow_set_param !== 'function') return;
    shadow_set_param(1, 'slot:receive_channel', '2');
    shadow_set_param(2, 'slot:receive_channel', '3');
    shadow_set_param(3, 'slot:receive_channel', '4');
}
"""


def transform_ui_state(source: str) -> str:
    """Normalize all source banks and native receive channels on every Set load."""
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
        "import { loadSetHostChoice, setMovyTracks } from '../track/host-mode.js';\n\n" + HB_BANK_HELPERS + "\n",
        "ui-state host import and helpers",
    )
    source = replace_once(
        source,
        "        loadSetHostChoice(o.flags && typeof o.flags === 'object' ? o.flags : {});\n"
        "        /* Then the chains, before anything cosmetic: the loads are queued one\n"
        "         * per audio callback, so the sooner they start the sooner the set sounds\n"
        "         * like itself. One document says both what to unload and what to load —\n"
        "         * a set with no `chains` key names nothing, which is how a set written\n"
        "         * before movy hosted chains still clears the previous set's. */\n"
        "        const n = restoreChains(o.chains, o.sends);\n",
        "        /* Dedicated HarmonyBus build always leaves native tracks 1-4 on Schwung,\n"
        "         * then normalizes 5-16 into three conductor+followers quartets. */\n"
        "        setMovyTracks(false);\n"
        "        configureNativeHarmonyBusDestinations();\n"
        "        const hbChains = normalizeHarmonyBusBanks(o.chains);\n"
        "        restoreSourceAudioMutes(hbChains);\n"
        "        const n = restoreChains(hbChains, o.sends);\n",
        "ui-state loaded-set normalization",
    )
    source = replace_once(
        source,
        "    /* A Set with no UI blob at all is new work: it takes the shipped default,\n"
        "     * which puts tracks 1-4 on movy's own chains. */\n"
        "    loadSetHostChoice(null);\n"
        "    /* A Set with no UI blob wants no movy chains — the same clean slate schwung\n"
        "     * gives an unseen set when it seeds empty slots. */\n"
        "    restoreChains(null, null);\n",
        "    /* Dedicated HarmonyBus build: every new Set starts fully wired. */\n"
        "    setMovyTracks(false);\n"
        "    configureNativeHarmonyBusDestinations();\n"
        "    const hbChains = normalizeHarmonyBusBanks(null);\n"
        "    restoreSourceAudioMutes(hbChains);\n"
        "    restoreChains(hbChains, null);\n",
        "ui-state fresh-set normalization",
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
    update_file(root / "src/seq/colors.ts", transform_colors)
    update_file(root / "src/seq/ui-state.ts", transform_ui_state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
