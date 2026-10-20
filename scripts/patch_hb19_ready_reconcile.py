#!/usr/bin/env python3
"""hb.19: reconcile all HarmonyBus Movy chains once the engine is actually ready."""
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
    seam = """function configureNativeHarmonyBusDestinations(): void {
    if (typeof shadow_set_param !== 'function') return;
    shadow_set_param(1, 'slot:receive_channel', '2');
    shadow_set_param(2, 'slot:receive_channel', '3');
    shadow_set_param(3, 'slot:receive_channel', '4');
}
"""
    after = seam + """

/** Reconcile the dedicated HarmonyBus source banks after the Movy engine is live.
 * Fresh-set initialization can run before the chain host accepts writes; doing
 * one whole-document reconciliation at engine-ready makes the desired topology
 * structural rather than timing-dependent. Existing non-HB components and HB
 * musical settings survive; only the dedicated quartet routing is normalized. */
export function reconcileHarmonyBusBanksAfterReady(): void {
    setMovyTracks(true);
    configureNativeHarmonyBusDestinations();
    const current = captureChains(readChainDoc());
    const hbChains = normalizeHarmonyBusBanks(current);
    restoreSourceAudioMutes(hbChains);
    const n = restoreChains(hbChains, null);
    if (n > 0) mlog('hb ready reconcile: ' + n + ' component(s)');
}
"""
    source = replace_once(source, seam, after, "ready reconcile helper")
    path.write_text(source)


def patch_tick(path: Path) -> None:
    source: str = path.read_text()
    source = replace_once(
        source,
        "import { engineReady } from '../seq/engine.js';\n",
        "import { engineReady, engineGeneration } from '../seq/engine.js';\n"
        "import { reconcileHarmonyBusBanksAfterReady } from '../seq/ui-state.js';\n",
        "tick imports",
    )
    marker = "let jogToastShown = false;   // a bottom jog/browse toast is on screen (strip yields to it)\n"
    source = replace_once(
        source,
        marker,
        marker + "let hbReconciledGeneration = -1;\n",
        "reconcile generation state",
    )
    seam = """    // of whether we are on screen.
    seqEngineTick();
"""
    after = """    // of whether we are on screen.
    seqEngineTick();
    if (engineReady()) {
        const generation = engineGeneration();
        if (generation !== hbReconciledGeneration) {
            reconcileHarmonyBusBanksAfterReady();
            hbReconciledGeneration = generation;
        }
    }
"""
    source = replace_once(source, seam, after, "engine-ready reconcile hook")
    path.write_text(source)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args = parser.parse_args()
    root = args.movy_root.resolve()
    patch_ui_state(root / "src/seq/ui-state.ts")
    patch_tick(root / "src/app/tick.ts")
    print("hb.19 engine-ready HarmonyBus reconciliation applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
