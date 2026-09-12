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


def patch_upstream_expectations(root: Path) -> None:
    """Adapt upstream tests whose assumptions are intentionally changed here."""
    chain_test_path: Path = root / "browser-test/logic/tracks-chain.mjs"
    chain_test: str = chain_test_path.read_text()
    chain_test = replace_once(
        chain_test,
        "    eq('resetUiState unloads the previous set\\'s modules',\n"
        "       writes.filter((w) => w[0] === 'chains' && w[1] === '0\\n').length, 1);",
        "    const { decodeBulk } = await import('../../dist/esm/track/bulk.js');\n"
        "    const fresh = decodeBulk(writes.find((w) => w[0] === 'chains')?.[1]);\n"
        "    eq('fresh Set replaces the previous chains with 16 HB and synth pairs',\n"
        "       fresh?.length, 16 * 2 * 3);\n"
        "    for (let track = 0; track < 16; track++) {\n"
        "      eq('fresh HB slot ' + track, fresh?.[track * 6 + 1], 'midi_fx1');\n"
        "      eq('fresh HB module ' + track, fresh?.[track * 6 + 2], 'harmonybus');\n"
        "      eq('fresh synth module ' + track, fresh?.[track * 6 + 5], 'plaits');\n"
        "    }\n"
        "    const { pendingPayloadFor } = await import('../../dist/esm/track/chain-payload.js');\n"
        "    const { serializeUiState, applyUiState } =\n"
        "      await import('../../dist/esm/seq/ui-state.js');\n"
        "    for (let track = 0; track < 16; track++) {\n"
        "      const saved = pendingPayloadFor(track);\n"
        "      const role = track % 4 === 0 ? 0 : 1;\n"
        "      const destination = track % 4 === 0 ? 2 : track % 4;\n"
        "      const values = saved?.comp[0]?.s?.split(',');\n"
        "      eq('fresh HB role ' + track, Number(values?.[1]), role);\n"
        "      eq('fresh HB render channel ' + track, Number(values?.[12]), destination);\n"
        "      eq('fresh HB source channel ' + track, Number(values?.[13]), 0);\n"
        "      eq('fresh local audio mute ' + track, saved?.mix?.split(',')[2], '1');\n"
        "    }\n"
        "    const savedSet = JSON.parse(serializeUiState());\n"
        "    eq('fresh Set saves all 16 source chains', savedSet.chains.length, 16);\n"
        "    savedSet.chains[0].comp[0].s = savedSet.chains[0].comp[0].s.replace(\n"
        "      /^hb15,0,/, 'hb15,1,');\n"
        "    applyUiState(JSON.stringify(savedSet));\n"
        "    eq('saved HB role survives reload',\n"
        "      Number(pendingPayloadFor(0)?.comp[0]?.s?.split(',')[1]), 1);",
        "fresh-set chain test",
    )
    chain_test_path.write_text(chain_test)

    persist_test_path: Path = root / "engine/crates/seq-core/src/persist.rs"
    persist_test: str = persist_test_path.read_text()
    persist_test = replace_once(
        persist_test,
        "fn link_enabled_round_trips_and_defaults_off()",
        "fn link_enabled_round_trips_and_defaults_on()",
        "transport persistence test name",
    )
    persist_test = replace_once(
        persist_test,
        "// A legacy save without a `link` line loads with the link off.",
        "// A legacy save without a `link` line follows native Move by default.",
        "transport persistence test comment",
    )
    persist_test = replace_once(
        persist_test,
        "assert!(!e3.link_enabled, \"legacy save → link off\");",
        "assert!(e3.link_enabled, \"legacy save → link on\");",
        "transport persistence test assertion",
    )
    persist_test = replace_once(
        persist_test,
        "        e3.link_enabled = true; // pre-set to prove load() clears it",
        "        e3.link_enabled = false; // prove a legacy load enables the default",
        "legacy transport test initial state",
    )
    persist_test = replace_once(
        persist_test,
        "        assert!(e3.link_enabled, \"legacy save → link on\");",
        "        assert!(e3.link_enabled, \"legacy save → link on\");\n"
        "        e.link_enabled = false;\n"
        "        assert!(load(&mut e2, &serialize(&e)));\n"
        "        assert!(!e2.link_enabled, \"saved explicit link off survives reload\");",
        "saved transport opt-out persists",
    )
    persist_test_path.write_text(persist_test)

    engine_test_path: Path = root / "engine/crates/seq-core/src/engine.rs"
    engine_test: str = engine_test_path.read_text()
    before_off: str = "        let mut e = engine();"
    for name in ("link_off_movy_play_starts_without_inject",
                 "link_off_move_fa_does_not_start_movy",
                 "link_off_move_fc_keeps_movy_playing",
                 "an_external_clock_fits_the_take_to_the_existing_tempo"):
        marker: str = f"fn {name}() {{"
        start: int = engine_test.index(marker)
        stop: int = engine_test.index("\n    }", start)
        test_body: str = engine_test[start:stop]
        if "e.link_enabled = false;" not in test_body:
            test_body = replace_once(
                test_body, before_off,
                before_off + "\n        e.link_enabled = false;",
                f"explicit unlinked setup for {name}",
            )
            engine_test = engine_test[:start] + test_body + engine_test[stop:]
    for name in ("move_play_starts_movy_when_stopped", "move_stop_stops_movy"):
        marker = f"fn {name}() {{"
        start = engine_test.index(marker)
        stop = engine_test.index("\n    }", start)
        test_body = replace_once(
            engine_test[start:stop],
            "        e.link_enabled = true;",
            "        assert!(e.link_enabled, \"fresh engine follows native transport by default\");",
            f"default transport behavior in {name}",
        )
        engine_test = engine_test[:start] + test_body + engine_test[stop:]
    engine_test_path.write_text(engine_test)

    for test_file in ("abi-parity.mjs", "track-colors.mjs"):
        test_path: Path = root / "browser-test" / test_file
        test_source: str = test_path.read_text()
        fixture_names: tuple[str, ...] = (
            ("host/plugin_api_v1.h", "host/shadow_constants.h")
            if test_file == "abi-parity.mjs" else ("shared/constants.mjs",)
        )
        for fixture_name in fixture_names:
            test_source = replace_once(
                test_source,
                f"'/Users/dake/git/cld/schwung/src/{fixture_name}'",
                f"(process.env.SCHWUNG_ROOT || '/Users/dake/git/cld/schwung') + '/src/{fixture_name}'",
                f"portable Schwung fixture {fixture_name}",
            )
        test_path.write_text(test_source)


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
    patch_upstream_expectations(root)
    print("HarmonyBus clean integration applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
