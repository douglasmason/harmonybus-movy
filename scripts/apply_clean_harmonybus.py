#!/usr/bin/env python3
"""Apply the minimal HarmonyBus-Movy integration to pinned upstream Movy.

The integration covers:
1. Fresh Sets seed all 16 Movy chains with HarmonyBus + a simple synth, locally muted.
2. Schwung PAGE mode owns hosted module parameter rendering.
3. While Schwung owns a page, knob touch/release never enters Movy's enum overlay path.
4. Upstream transport LINK defaults on for new/legacy Sets; saved explicit values still win.
5. Runtime clip metadata gives HarmonyBus actual conductor cycle lengths and phases.

Pad routing and saved chain persistence retain upstream behavior. Capture preserves HarmonyBus rendered-note identity, matching Record.
An explicit clip edit adds Quantize + Fill Gaps using shared playback timing.
"""
from __future__ import annotations

from patch_deleted_set import patch_deleted_set
from patch_follower_snapshot import patch_follower_snapshot
from patch_diagnostic_refresh import patch_diagnostic_refresh
from patch_page_latency import patch_page_latency
from patch_tap_hold import patch_tap_hold
from patch_touch_release import patch_touch_release
from patch_running_transport import patch_running_transport
from patch_movy_record_bridge import patch_record_bridge
import argparse
import subprocess
import json
import base64
from patch_loop_bridge import patch_loop_bridge
from patch_visual_beat import patch_visual_beat
from patch_pressure_recording import patch_pressure_recording
from patch_arp_pressure import patch_arp_pressure
from patch_performance_touch import patch_performance_touch
from patch_motion_controls import patch_motion_controls
from patch_performance_steps import patch_performance_steps
from patch_performance_mode import patch_performance_mode
from patch_clip_performance import patch_clip_performance
from patch_follower_input import patch_follower_input
from patch_harmony_pads import patch_harmony_pads
from patch_responsive_persistence import patch_responsive_persistence
from patch_recorded_operations import patch_recorded_operations
from patch_render_velocity import patch_render_velocity
from patch_durable_data import patch_durable_data
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
const HB_FRESH_CONDUCTOR = 'hb16,0,0,0,25,2,0,0,0,0,0,0,2,0,0,0,0,0,1,0,-3,60,0,0,0,0;cp1,1,0,0,0,0,0,0,2,1,0;ds1,0;cq1,0,0;ph1,1;np1,0';
const HB_FRESH_FOLLOWERS = [
    'hb16,1,0,0,25,2,0,0,0,0,0,0,1,0,0,0,0,0,1,0,-3,60,1,0,0,0',
    'hb16,1,0,0,25,2,0,0,0,0,0,0,2,0,0,0,0,0,1,0,-3,60,1,0,0,0',
    'hb16,1,0,0,25,2,0,0,0,0,0,0,3,0,0,0,0,0,1,0,-3,60,1,0,0,0',
];

const HB_FRESH_RECEIVERS = [
    'hb16,3,0,0,25,2,0,0,0,0,0,0,-1,0,0,0,0,0,1,0,-3,60,0,0,0,0',
    'hb16,3,0,0,25,2,0,0,0,0,0,0,-1,1,0,0,0,0,1,0,-3,60,0,0,0,0',
    'hb16,3,0,0,25,2,0,0,0,0,0,0,-1,2,0,0,0,0,1,0,-3,60,0,0,0,0',
    'hb16,3,0,0,25,2,0,0,0,0,0,0,-1,3,0,0,0,0,1,0,-3,60,0,0,0,0',
];

function freshHarmonyBusChains() {
    return Array.from({ length: TRACK_COUNT }, (_, t) => {
        const pos = t % 4;
        return {
            t,
            comp: [
                { c: 'midi_fx1', m: 'harmonybus',
                  s: t >= 12 ? HB_FRESH_RECEIVERS[pos] : pos === 0 ? HB_FRESH_CONDUCTOR : HB_FRESH_FOLLOWERS[pos - 1] },
                ...(t < 12 ? [{ c: 'synth', m: 'plaits' }] : []),
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
                if (sp2) { sp2.knobTouch(d1, true); appState.dirty = true; }
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
                if (sp2) { sp2.knobTouch(d1, false); appState.dirty = true; }
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
        "       fresh?.length, (12 * 2 + 4) * 3);\n"
        "    for (let track = 0; track < 16; track++) {\n"
        "      const offset = track < 12 ? track * 6 : 72 + (track - 12) * 3;\n"
        "      eq('fresh HB slot ' + track, fresh?.[offset + 1], 'midi_fx1');\n"
        "      eq('fresh HB module ' + track, fresh?.[offset + 2], 'harmonybus');\n"
        "      if (track < 12) eq('fresh synth module ' + track, fresh?.[offset + 5], 'plaits');\n"
        "    }\n"
        "    const { pendingPayloadFor } = await import('../../dist/esm/track/chain-payload.js');\n"
        "    const { serializeUiState, applyUiState } =\n"
        "      await import('../../dist/esm/seq/ui-state.js');\n"
        "    for (let track = 0; track < 16; track++) {\n"
        "      const saved = pendingPayloadFor(track);\n"
        "      const role = track >= 12 ? 3 : track % 4 === 0 ? 0 : 1;\n"
        "      const destination = track >= 12 ? -1 : track % 4 === 0 ? 2 : track % 4;\n"
        "      const values = saved?.comp[0]?.s?.split(';')[0].split(',');\n"
        "      eq('fresh HB state format ' + track, values?.[0], 'hb16');\n"
        "      eq('fresh HB state field count ' + track, values?.length, 26);\n"
        "      eq('fresh HB role ' + track, Number(values?.[1]), role);\n"
        "      eq('fresh HB render channel ' + track, Number(values?.[12]), destination);\n"
        "      eq('fresh HB source channel ' + track, Number(values?.[13]), track >= 12 ? track - 12 : 0);\n"
        "      eq('fresh local audio mute ' + track, saved?.mix?.split(',')[2], '1');\n"
        "    }\n"
        "    const savedSet = JSON.parse(serializeUiState());\n"
        "    eq('fresh Set saves all 16 source chains', savedSet.chains.length, 16);\n"
        "    savedSet.chains[0].comp[0].s = savedSet.chains[0].comp[0].s.replace(\n"
        "      /^hb16,0,/, 'hb16,1,');\n"
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


def patch_touch_buttons(root: Path) -> None:
    """Activate hosted HB actions once per capacitive touch gesture."""
    page_path: Path = root / "src/renderer/schwung-page.ts"
    source: str = page_path.read_text()
    source = replace_once(source,
        "    const qualify = (k: string) =>",
        "    const touchActions = new Map<number, string>();\n    const qualify = (k: string) =>",
        "touch action ownership")
    source = replace_once(source,
        "        knobTurn: (slot: number, delta: number) => {\n            const dir",
        "        knobTurn: (slot: number, delta: number) => {\n            if (touchActions.has(slot)) return;\n            const dir",
        "touch action turn deduplication")
    before: str = "        knobTouch: (slot: number, down: boolean) => { ctl.onKnobTouch(slot, down); },"
    after: str = """        knobTouch: (slot: number, down: boolean) => {
            ctl.onKnobTouch(slot, down);
            if (!down) {
                const heldKey = touchActions.get(slot);
                touchActions.delete(slot);
                if (heldKey === 'mod_chrom_below' || heldKey === 'mod_scale_above')
                    ctl.commitEnum(heldKey, 0);
                return;
            }
            if (touchActions.has(slot)) return;
            if (port.getParam(moduleReadKey(componentKey)) !== 'harmonybus') return;
            const key = ctl.keyAt(slot);
            const meta = ctl.metaAt(slot);
            if (!key || !meta || meta.readOnly) return;
            if (meta.writeOnly) {
                touchActions.set(slot, key);
                ctl.onClick(slot);
            } else if (key === 'mod_chrom_below' || key === 'mod_scale_above') {
                touchActions.set(slot, key);
                ctl.commitEnum(key, 1);
            }
        },"""
    page_path.write_text(replace_once(source, before, after, "touch button activation"))


def patch_panel_titles(root: Path) -> None:
    """Carry Schwung's current page label through Movy's header model."""
    map_path_to_replacements: dict[str, list[tuple[str, str]]] = {
        "src/renderer/schwung-page.ts": [
            ("import { mlog } from '../log.js';", "import { mlog } from '../log.js';\nimport { drawHeader } from './header.js';"),
            ("            ctl.render(ctx, { title, bands: BANDS });",
             "            ctl.render(ctx, { title, bands: BANDS });\n"
             "            // Schwung already resolves the touched parameter and current value.\n"
             "            // Restore its touch feedback in the header owned by Movy.\n"
             "            const touchHeader = ctl.describePage({ title }).header;\n"
             "            if (touchHeader.inverted) drawHeader(touchHeader.left, touchHeader.right, true);"),
            ("    readonly pageIndex: number;", "    readonly pageIndex: number;\n    readonly pageTitle: string;"),
            ("        get pageIndex() { return ctl.pageIndex; },",
             "        get pageIndex() { return ctl.pageIndex; },\n"
             "        get pageTitle() { return ctl.pageLabel(); },"),
        ],
        "src/app/tick.ts": [
            ("{ index: number; count: number } | undefined", "{ index: number; count: number; title: string } | undefined"),
            ("{ index: sp.pageIndex, count: sp.pageCount }", "{ index: sp.pageIndex, count: sp.pageCount, title: sp.pageTitle }"),
        ],
        "src/renderer/knob-view.ts": [
            ("export interface BankOverride { index: number; count: number }",
             "export interface BankOverride { index: number; count: number; title?: string }"),
            ("const rightText = vm.drumPadName || vm.bankName;",
             "const rightText = vm.drumPadName || bank?.title || vm.bankName;"),
        ],
    }
    for relative_path, replacements in map_path_to_replacements.items():
        path: Path = root / relative_path
        source: str = path.read_text()
        for before, after in replacements:
            source = replace_once(source, before, after, f"page title in {relative_path}")
        path.write_text(source)


def patch_playhead_poll(path: Path) -> None:
    source = path.read_text()
    source = replace_once(source, "let pollCountdown = 1;", "let pollCountdown = 1;\nlet lastStatusPollAt = 0;", "poll deadline clock")
    source = replace_once(source, "    if (--pollCountdown <= 0) {\n        pollCountdown = STATUS_POLL_TICKS;",
        "    const pollNow = Date.now();\n    if (--pollCountdown <= 0 || (pollNow - lastStatusPollAt >= 40 || pollNow < lastStatusPollAt)) {\n        lastStatusPollAt = pollNow;\n        pollCountdown = STATUS_POLL_TICKS;", "playhead deadline")
    path.write_text(source)


def main() -> int:
    parser: argparse.ArgumentParser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args: argparse.Namespace = parser.parse_args()
    root: Path = args.movy_root.resolve()

    patch_panel_titles(root)
    patch_touch_buttons(root)
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
    patch_loop_bridge(root)
    patch_record_bridge(root)
    patch_playhead_poll(root / "src/seq/engine.ts")
    patch_visual_beat(root)
    patch_responsive_persistence(root)
    patch_arp_pressure(root)
    poll_test = root / "browser-test/logic/seq-engine.mjs"
    poll_source = poll_test.read_text()
    poll_anchor = "    eq('bpm mirrored', seqState.bpmX100, 13350);"
    poll_extra = """
    // Heavy UI ticks must not stretch an eight-tick poll to hundreds of ms.
    const originalNow = Date.now;
    let clock = originalNow() + 100;
    Date.now = () => clock;
    try {
        seqEngineTick();
        const { statusSeq } = await import('../../dist/esm/seq/engine.js');
        const polls = statusSeq();
        for (let frame = 1; frame <= 4; frame++) {
            clock += 20; engine.status.tick = 5000 + frame; seqEngineTick();
        }
        eq('slow UI polls every 40 ms during playback', statusSeq() - polls, 2);
        eq('step clock catches up on the fourth slow frame', seqState.engineTick, 5004);
    } finally { Date.now = originalNow; }
"""
    poll_test.write_text(replace_once(poll_source,poll_anchor,poll_anchor+poll_extra,"slow UI poll regression"))

    integration_root: Path = Path(__file__).resolve().parents[1] / 'integration'
    record_patch: Path = integration_root / 'recorded-chords.patch'
    record_applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ['git', 'apply', '--reverse', '--check', str(record_patch)], cwd=root, capture_output=True)
    patch: Path = integration_root / 'clip-tools.patch'
    applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ['git', 'apply', '--reverse', '--check', str(patch)], cwd=root, capture_output=True)
    if applied.returncode != 0 and record_applied.returncode != 0:
        subprocess.run(['git', 'apply', str(patch)], cwd=root, check=True)
    record_patch: Path = integration_root / 'recorded-chords.patch'
    record_applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ['git', 'apply', '--reverse', '--check', str(record_patch)], cwd=root, capture_output=True)
    if record_applied.returncode != 0:
        subprocess.run(['git', 'apply', str(record_patch)], cwd=root, check=True)
    (root / 'browser-test/hb-touch.mjs').write_text((integration_root / 'hb-touch.mjs').read_text())
    (root / 'browser-test/hb-analysis.mjs').write_text((integration_root / 'hb-analysis.mjs').read_text())
    (root / 'browser-test/hb-clip-tools.mjs').write_text((integration_root / 'hb-clip-tools.mjs').read_text())
    map_path_to_base64: dict[str, str] = json.loads((integration_root / 'clip-baselines.json').read_text())
    for relative_path, encoded_png in map_path_to_base64.items():
        (root / relative_path).write_bytes(base64.b64decode(encoded_png))
    patch_pressure_recording(root)
    patch_performance_touch(root)
    patch_motion_controls(root)
    patch_performance_steps(root)
    patch_performance_mode(root)
    patch_clip_performance(root)
    patch_follower_input(root)
    patch_harmony_pads(root)
    patch_running_transport(root)
    patch_deleted_set(root)
    patch_follower_snapshot(root)
    patch_diagnostic_refresh(root)
    patch_page_latency(root)
    patch_tap_hold(root)
    patch_touch_release(root)
    patch_recorded_operations(root)
    patch_render_velocity(root)
    patch_durable_data(root)
    from patch_controls import patch_controls
    patch_controls(root)
    from patch_step_move import patch_step_move
    patch_step_move(root)
    from patch_capture import patch_capture
    patch_capture(root)
    from patch_input_info import patch_input_info
    patch_input_info(root)
    from patch_humanize import patch_humanize
    patch_humanize(root)
    print("HarmonyBus clean integration applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
