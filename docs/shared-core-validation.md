# Shared core / FM1 validation, 2026-10-19

This is a software candidate. No Move or FM1 was connected, deployed or flashed.
The FM1 adapter has not been verified against a physical stock-firmware capture.

Local checks completed:
- 80 HarmonyBus native suites on the extracted main baseline, then the existing
  Grid Sequencer gate suite restored from its active feature branch. CI runs the
  resulting 82-suite manifest (including upstream rhythm generation) before publishing candidate build artifacts.
- Differential core parity: all 4,095 nonempty pitch-class sets and 1,572,480
  note-mapping combinations match the pre-extraction implementation exactly.
- 282 Movy DSP tests and 369 sequencer tests; TypeScript typecheck; complete UI
  logic checks; FM1, Launchpad, Joint Play/panels, and Grid UI checks.
- Real native Movy -> Schwung chain -> HarmonyBus -> deterministic instrument
  fixture passes Record/Capture, chords/arp, shared context, key operations,
  releases and independent PCM oracle comparison (2,644,236 stereo samples).
- Legacy rp2 prepared presets restore to current rp3 schema with local-dominant
  defaults neutral, all previous choices preserved, and stable round trips.

Desktop performance (not hardware deadlines):

| Workload | Median | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Original surface router, 32 events, run 1 | 4.04 us | 4.20 us | 11.08 us | 475.90 us |
| Shared 3-source router, 32 events, run 1 | 8.11 us | 16.45 us | 41.30 us | 2967.34 us |
| Original surface router, 32 events, run 2 | 4.04 us | 4.45 us | 18.89 us | 577.16 us |
| Shared 3-source router, 32 events, run 2 | 8.10 us | 8.85 us | 30.26 us | 1796.40 us |

10,000 preconstructed batches per run, alternating baseline/candidate, optimized
Rust on this shared Linux host. Original uses its valid address namespace; the
candidate uses FM1's source namespace with the same note/track sequence. This
captures parsing and routing only, not USB, IPC, synth rendering or recording.
The ownership table grows from 128 to 384 entries and remains allocation-free.
Median cost roughly doubles. Tail timings include OS scheduling and host load;
an earlier busy-host sample reached 76 ms and is not a device latency estimate.
Do not claim a real-time guarantee or absence of regression from these numbers.

Existing production shared-work benchmark: 16 tracks, 20,000 blocks, 45.28 us/block
mean with key travel and conductor timelines. The real native audio fixture also
emits callback/parameter timing counters for inspection. Neither substitutes for
Move callback and USB measurements. The hardware plan requires alternating
baseline/candidate runs with latency percentiles, overrun counts and audio.

The current stage extracts stable portable algorithms and the surface command
contract. Stateful key/operation/motif runtime extraction remains incremental;
there is still one production HarmonyBus owner. Remote UI's existing native
processor stays the intended integration point; no new network endpoint is added.

Candidate incorporates concurrent upstream rhythm work at HarmonyBus 346f019
and Movy integration 9966a81, preserving the existing Grid Sequencer gates.
