# Shared core / FM1 candidate

Base: current Grid Sequencer integration, not the older main branch.
The matching HarmonyBus core is pinned in both CI workflows. The preparer reads
HARMONYBUS_ROOT (default: sibling harmonybus checkout) and generates the adapter
transport file with a SHA-256 provenance record. Never edit that generated copy.

Movy consumes one installed HarmonyBus DSP for musical behavior. The core source
package lives in harmonybus/core; the portable C API and existing module API are
unchanged. No second harmony bus or JavaScript classifier is introduced.

FM1 MIDI channel defaults OFF. After hardware validation, select the stock FM1's
verified output channel. The adapter consumes note-on/off and poly pressure,
preserving pitch and velocity, and enters the existing sound/Record/Capture path.
It follows track selection at onset; releases and pressure use engine-owned onset
identity. No firmware, knob CC or feedback protocol is assumed. Launchpad reserves
channel 1 when active, so concurrent FM1 input requires another channel.

One bounded queue sends all external surface input. Rust owns note identity and
cross-source aliases. Releases/fences are source-local; stale resets cannot kill
newer notes. Remote UI has a reserved namespace in this same contract; network
session authorization and disconnect handling must remain in its existing server.
There is no new network endpoint in this candidate.

Source-aware routing adds a bounded 384-slot ownership scan (previously 128).
See tests/surface_bench.rs and the hardware test plan in HarmonyBus. A desktop
benchmark is not evidence of hardware latency, USB enumeration or crackle removal.
The entire test and approval plan is docs/shared-core-hardware-test-plan.md in the
matching HarmonyBus commit. Do not install or flash until that plan is approved.

The initial candidate CI produces downloadable ARM archives. The release workflow
for hbclean.202 verifies and publishes the module, then updates the standard
Schwung Manager installer pointer. Neither workflow installs to Move, modifies
Schwung, or flashes FM1.

## Install preparation: hbclean.202 + HarmonyBus 0.2.281

The matched releases include the published hbclean.201 / HarmonyBus 0.2.280
rhythm, Grid and effective-scale work. Use the normal Schwung Manager repository
URLs once both releases are published:

- https://github.com/douglasmason/harmonybus
- https://github.com/douglasmason/harmonybus-movy

For an approved device test: back up the current set and keep the previous module
archives; install HarmonyBus first, then Movy; restart the modules/host session so
existing instances load the new libraries. Confirm versions 0.2.281 and
0.34.1-hbclean.202. Start with FM1 MIDI channel OFF and check existing Move and
Launchpad behavior. Enable only the FM1 channel verified by stock USB capture.
The hardware test plan covers combined-source releases, disconnect recovery,
recording, callback timing and rollback. This release does not update host or
FM1 firmware, and does not claim a fix for existing audio crackles.
