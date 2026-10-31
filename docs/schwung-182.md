# Schwung 1.7.3–1.8.2 integration

The physical Move is still assumed to run 1.7.3. No installation or device
upgrade is part of this work. The browser session owns connectivity, emulator
composition and transport UI; their interfaces are unchanged here.

## Verified upstream changes

Compared exact release commits `a6f7ec9e5cf4d0df172a1dbc00b29d0b5eb67124`
(1.7.3) and `35f401c3876557606ee44fbc9f3e363a6e39fb84` (1.8.2), including the
official [1.8.0](https://github.com/charlesvestal/schwung/releases/tag/v1.8.0),
[1.8.1](https://github.com/charlesvestal/schwung/releases/tag/v1.8.1) and
[1.8.2](https://github.com/charlesvestal/schwung/releases/tag/v1.8.2) notes.

| Area | Source evidence and effect | HB/Movy consequence |
| --- | --- | --- |
| Knobs and grid | `src/shared/knob_engine.mjs`: integer spans 17–48 use four detents; numeric presentation remains numeric. `page_controller.mjs`: unchanged gates skip replanning, visibility replans reuse trailing menus, inset lists respect caller rectangles. `page_plan.mjs`: null knob holes survive. | Bundle this existing controller for both device and browser. Host upgrade alone cannot replace Movy's packaged controller. |
| External MIDI | `src/schwung_shim.c:midi_monitor` filters cable 0 before updating held steps, pads, Shift and Delete. | Fixes host p-lock/control contamination from USB MIDI. Does not change Movy's source ownership, Launchpad protocol or repeated-note rendering. Cannot repair the old shim from a module. |
| Native automation | `move_model.c` retries resolution indefinitely at a one-minute tail and searches more mappings; stale song recovery refreshes maps. `move_model_sync.c` exposes diagnostic reasons; `step_plock.h` separates no clip from no model. | Host-native lanes/p-locks recover independently of Movy's abstract clips. Do not copy the memory reader or use song readiness to gate abstract recording. |
| Tempo | `shadow_sampler.c` uses exact Move tempo when available, otherwise the held transport estimate; `shadow_transport.c` measures an external clock over 16 beats. | Same optional `get_bpm` API. Native callback accuracy improves on 1.8.x, but neither module nor browser should smooth it again or infer phase from BPM. |
| Module loading | Manager `remote_ui_chain.go`, `slot_modules.go`, and `remote_ui.go` advertise legal module choices and wait for native load completion; unsupported choices are refused. | Reuse advertised commands in the connection owner. Do not invent commands from host version or treat command submission as completed loading. Existing TrackPort contract retries retain state on null and release it on resolved empty metadata. |
| Tool lifecycle | `src/launch-standalone.sh` uses a `/dev/shm` launch lock and clears boot-watchdog markers; `shadow_ui.js` routes `open_tool_cmd` through normal tool launch. | Remains host-owned; no second process launcher or session lock in Movy. |
| Presets | `shadow_ui_presets.mjs` and `shadow_ui.js` maintain per-position Master/Send FX presets and remap records as positions change. | Keep module state serialization and chain ownership unchanged. Presets are not abstract clip automation. |
| Mirror | Manager `static/mirror.html` tracks control-use indicators. | Presentation feedback only; not evidence of improved input/audio timing. |
| ABI | `plugin_api_v1.h` changes only the tempo comment; no function fields were added/reordered. Chain source and MIDI FX ABI are unchanged across these tags. | Use existing optional callbacks and shared parameter contracts. A callback being present does not prove the host has internal 1.8.x bug fixes. |

## Existing ownership and implementation

`scripts/patch_settings_case.py` already provides the single packaged settings
framework and `schwung-lib.ts` its entry point. It now normalizes either supported
source checkout to the exact 1.8.2 shared modules before applying existing
mixed-case typography. `integration/schwung-host/shared-ui-1.8.2.patch` is the
unmodified upstream `.mjs` delta, not a second implementation. Keeping this delta
allows existing offline 1.7.3 build inputs and browser preparation contracts to
continue working. `test_schwung_shared_source.py` checks every module against the
actual 1.8.2 tree. Runtime code contains no host version checks.

Movy's existing `schwung-page.ts` supplies TrackPort I/O and the shared metadata
used by its parameter automation. Controller changes do not renumber automation:
targets use component-qualified parameter keys, not page or knob indices. HB's
module metadata remains the authority for musical controls; no descriptor copy
or new renderer is introduced.

Chord Play's range gesture in `integration/chord-play/chord-play.ts` deliberately
uses four detents and `hb_chord_range_mask` to find audible voicing changes. It
already bounds accelerated input to one change per packet and discards partial
motion on direction/target changes. The upstream numeric knob rule does not
replace that musical operation. Existing `hb-chord-range` tests cover it.

Launchpad X/Mini input is owned by `integration/launchpad`, `surface-input` and
the native surface route. Key-center/relative operations and abstract automation
remain in the shared HB core and Movy clip engine. Existing ordered input batches,
release ownership, pressure coalescing, bounded feedback and persistence tests
continue to apply; no host-native p-lock representation is added to them.

The grid update has no LED brightness algorithm. Move pulses still depend on
palette quantization and UI/transport delivery; external pulses intentionally
remain steady in the current implementation. Audio crackling, physical knob-to-
sound latency and LED cadence require hardware measurements. Simulation results
are not claims of an audible fix.

## Verification

The existing native `host.rs` is the compatibility boundary for transport.
Its adapter now checks optional callbacks and their actual return values.
Unavailable clock status (0) is not confused with stopped (1); invalid beat/BPM
readings keep attachment pending. BPM validation uses the sequencer's existing
20–300 limits, so attachment cannot disagree with its clamped internal clock.
After valid attachment, or while Link is off, this path makes zero host callback
calls. Set load rearms it; existing MIDI-clock timing and lookahead own subsequent
playback. The regression counts three calls total over 1,001 attachment attempts
instead of three per audio block. This is a work-count reduction, not a measured
audio latency improvement. Diagnostics may still explicitly request a snapshot.

HarmonyBus independently centralizes all its optional tempo reads; see its
[host contract](https://github.com/douglasmason/harmonybus/blob/main/docs/schwung-182.md).
Both boundaries reuse their native ABI rather than sharing incompatible language
bindings or introducing a new clock abstraction.

- Complete Movy browser logic suite plus Chord Play/range, mixed-case rendering,
  ownership, polling, Launchpad, FM-1 and Grid regressions.
- `hb-schwung-host.mjs`: the production bundled controller, empty knobs, numeric
  sensitivity, visibility changes, no preset-state reads during gating, and no
  planning on repeated gate values.
- Rust/C ABI parity against both exact upstream host headers.
- Device bundle evaluation in actual QuickJS with host shared pages available
  and unavailable; the packaged controller supplies both cases.
- Native transport mocks cover absent pointers, unavailable/invalid status,
  invalid numeric data, stopped/running snapshots, skipped reads, user Stop and
  reattachment at the new Set's absolute phase and tempo.
- `schwung-host.yml` compiles and tests Movy with **each exact host revision**:
  native sequencer/DSP/automation tests, production chain audio, ABI, shared
  controls, external surfaces, and device startup. Its separate upstream job
  tests song-reader retry/sync, loader refusal/completion/cancellation, presets,
  standalone tools and the native BPM implementation.

No change to the single-conductor policy, browser protocol, Move firmware,
private trial audience, or released installer pointer is required by this update.
