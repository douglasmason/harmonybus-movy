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

CI produces downloadable ARM candidate archives; it does not publish a release,
change release.json, install to Move, modify Schwung, or flash FM1.
