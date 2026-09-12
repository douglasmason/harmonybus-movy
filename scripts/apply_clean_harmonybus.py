#!/usr/bin/env python3
"""Apply the minimal HarmonyBus-Movy integration to pinned upstream Movy.

Only four concerns belong here:
1. Fresh Sets seed all 16 Movy chains with HarmonyBus + a simple synth, locally muted.
2. Schwung PAGE mode owns hosted module parameter rendering.
3. While Schwung owns a page, knob touch/release never enters Movy's enum overlay path.
4. Upstream transport LINK defaults on for new/legacy Sets; saved explicit values still win.

Recording, Capture, pad routing, clip timing and saved chain persistence remain stock upstream.
"""
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(source: str, before: str, after: str, label: str) -> str:
    """Replace one exact upstream seam, accepting an already-applied result."""
    if after in source:
        return source
    count: int = source.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: expected one seam, found {count}")
    return source.replace(before, after, 1)


def patch_fresh_set(path: Path) -> None:
    source: str = path.read_text()

    marker: str = "/* Defaults match init(): C tonic, Major, Chromatic/4ths, C3 on every track. */"
    helper: str = r'''/* HarmonyBus clean-build defaults. These are used ONLY for a Set with no
 * Movy UI blob. Once saved, ordinary upstream chain persistence owns the state. */
const HB_FRESH_CONDUCTOR = 'hb15,0,0,0,25,2,0,0,0,0,0,0,2,0,0,0,0,0,0,20,60,0,0,0,0';
const HB_FRESH_FOLLOWERS = [
    'hb15,1,0,0,25,2,0,0,0,0,0,0,1,0,0,0,0,0,0,20,60,0,0,0,0',
    'hb15,1,0,0,25,2,0,0,0,0,0,0,2,0,0,0,0,0,0,20,60,0,0,0,0',
    'hb15,1,0,0,25,2,0,0,0,0,0,0,3,0,0,0,0,0,0,20,60,0,0,0,0',
];

function freshHarmonyBusChains() {
    return Array.from({ length: TRACK_COUNT }, (_, t) => {
        const pos = t % 4;
        return {
            t,
            comp: [
                { c: 'midi_fx1', m: 'harmonybus',
                  s: pos === 0 ? HB_FRESH_CONDUCTOR : HB_FRESH_FOLLOWERS[pos - 1] },
                { c: 'synth', m: 'plaits' },
            ],
            /* gain,pan,muted,send1,send2. Local audio is muted; MIDI is not. */
            mix: '1.0000,0.0000,1,0.0000,0.0000',
        };
    });
}

'''
    if helper not in source:
        source = replace_once(source, marker, helper + marker, "fresh-set helper insertion")

    before: str = (
        "    /* A Set with no UI blob at all is new work: it takes the shipped default,\n"
        "     * which puts tracks 1-4 on movy's own chains. */\n"
        "    loadSetHostChoice(null);\n"
        "    /* A Set with no UI blob wants no movy chains — the same clean slate schwung\n"
        "     * gives an unseen set when it seeds empty slots. */\n"
        "    restoreChains(null, null);\n"
    )
    after: str = (
        "    /* A brand-new Set uses the dedicated HarmonyBus source template.\n"
        "     * loadSetHostChoice(null) retains upstream's normal NEW-SET host decision,\n"
        "     * so Movy 1-4 are Movy chains without inventing another host-mode path. */\n"
        "    loadSetHostChoice(null);\n"
        "    const hbFreshCount = restoreChains(freshHarmonyBusChains(), null);\n"
        "    if (hbFreshCount > 0) mlog('hb-clean: seeded ' + hbFreshCount + ' chain component(s)');\n"
    )
    source = replace_once(source, before, after, "fresh-set chain seed")
    path.write_text(source)


def patch_schwung_page_ownership(grid_path: Path, router_path: Path) -> None:
    grid: str = grid_path.read_text()
    grid = replace_once(
        grid,
        "let override: SchwungGridMode | null = null;",
        "/* Dedicated HarmonyBus build: hosted module params use Schwung's own PAGE UI. */\nlet override: SchwungGridMode | null = 'page';",
        "force Schwung PAGE mode",
    )
    grid_path.write_text(grid)

    router: str = router_path.read_text()

    before_touch: str = '''            knobModel()?.handleKnobTouch(d1);
            {   /* Schwung shows the held param's full name and value in the
                 * header strip, and a dive is a click WITH a knob held — both
                 * need the same finger movy just saw. */
                const m2 = knobModel();
                const sp2 = m2 ? schwungActiveFor(appState.activeTrack.index,
                                m2.getComponentKey ? m2.getComponentKey() : 'synth') : null;
                if (sp2) sp2.knobTouch(d1, true);
            }
'''
    after_touch: str = '''            {   /* A Schwung page owns the gesture exclusively. Sending the same
                 * touch into Movy's model opens its unrelated/stale enum overlay. */
                const m2 = knobModel();
                const sp2 = m2 ? schwungActiveFor(appState.activeTrack.index,
                                m2.getComponentKey ? m2.getComponentKey() : 'synth') : null;
                if (sp2) sp2.knobTouch(d1, true);
                else m2?.handleKnobTouch(d1);
            }
'''
    router = replace_once(router, before_touch, after_touch, "Schwung-exclusive knob touch")

    before_release: str = '''            if (knobModel()?.handleKnobRelease(d1)) seqToast('Wrong preset type');
            {
                const m2 = knobModel();
                const sp2 = m2 ? schwungActiveFor(appState.activeTrack.index,
                                m2.getComponentKey ? m2.getComponentKey() : 'synth') : null;
                if (sp2) sp2.knobTouch(d1, false);
            }
'''
    after_release: str = '''            {
                const m2 = knobModel();
                const sp2 = m2 ? schwungActiveFor(appState.activeTrack.index,
                                m2.getComponentKey ? m2.getComponentKey() : 'synth') : null;
                if (sp2) sp2.knobTouch(d1, false);
                else if (m2?.handleKnobRelease(d1)) seqToast('Wrong preset type');
            }
'''
    router = replace_once(router, before_release, after_release, "Schwung-exclusive knob release")

    # A click while a Schwung param is touched may return an editor intent. In
    # this dedicated PAGE build we keep Schwung's own display/peek and never
    # launch Movy's separate enum/list editor over it.
    before_editor: str = '''                if (intent && intent.action === 'open' && !openSchwungEditor(intent, spc)) {
                    mlog('schwung-open unhandled ' + (intent.key || '?')
                       + ' kind=' + (intent.meta ? intent.meta.kind : '?'));
                }
'''
    after_editor: str = '''                if (intent && intent.action === 'open') {
                    mlog('hb-clean: Schwung owns editor intent ' + (intent.key || '?'));
                }
'''
    router = replace_once(router, before_editor, after_editor, "disable Movy Schwung editor open")
    router_path.write_text(router)


def patch_transport(engine_path: Path, persist_path: Path) -> None:
    engine: str = engine_path.read_text()
    engine = replace_once(
        engine,
        "            link_enabled: false,\n",
        "            link_enabled: true,\n",
        "transport link engine default",
    )
    engine_path.write_text(engine)

    persist: str = persist_path.read_text()
    persist = replace_once(
        persist,
        "    // Link defaults off; a legacy save without a `link` line loads with it off.\n    engine.link_enabled = false;\n",
        "    // HarmonyBus clean build defaults native Move transport follow on.\n    // A saved explicit `link` line is parsed below and still overrides this.\n    engine.link_enabled = true;\n",
        "transport link load default",
    )
    persist_path.write_text(persist)


def main() -> int:
    parser: argparse.ArgumentParser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args: argparse.Namespace = parser.parse_args()
    root: Path = args.movy_root.resolve()

    patch_fresh_set(root / "src/seq/ui-state.ts")
    patch_schwung_page_ownership(
        root / "src/renderer/schwung-grid.ts",
        root / "src/midi/router.ts",
    )
    patch_transport(
        root / "engine/crates/seq-core/src/engine.rs",
        root / "engine/crates/seq-core/src/persist.rs",
    )
    print("HarmonyBus clean integration applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
