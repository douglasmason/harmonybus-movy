# Hands-off callback isolation (.192)

Open Step 12 CPU and click the jog twice. The test automatically stops playback,
waits for acknowledgment, settles for one second, then runs for 65 seconds. Keep
all pads released and leave the track/settings unchanged. No prepared clip,
recording, or attached Launchpad is needed. Keep the current loaded set.

| Time | Native callback workload |
| --- | --- |
| 0–20 s, A NORMAL | Normal stopped-set processing plus test tone |
| 20–40 s, B TONE ONLY | Tone and instrumentation only; bypass sequencer advancement, metadata, HarmonyBus preparation, chain rendering and module loading |
| 40–60 s, C NORMAL | Normal stopped-set processing plus the same continuous tone |
| 60–65 s, RESTORING | Normal processing; tone finished |

The loaded set and settings are not edited. Playback stays stopped afterward;
press Play when ready. Back may leave the diagnostic running; jog click cancels.
New musical input aborts isolation before being forwarded normally. Set load,
other diagnostics, cancellation and the native deadline restore normal callback
work. Realtime clock packets alone do not invalidate the test; transport start does.

Download one `idle-test-*.json` from Manager → Files → schwung. Writing happens
after collection. Whole-run thread CPU metrics and PCM checks accompany:

- Three phase rows: block/interval counts, intervals longer than one or 1.5 nominal
  periods, maximum gap, mean/max callback work, maximum time outside the callback.
- Twelve largest intervals, each with elapsed time, current and previous phases,
  prior callback work, time outside that callback, and instrumented request work
  between callback starts. Request work is contained in the interval; do not sum
  it with idle time. Phase-boundary intervals are explicitly identifiable.

All per-phase durations are wall-clock measurements, not CPU utilization. A gap
longer than one block is not proof of an underrun: host buffering/batching may
absorb it. The PCM check sees only the final Movy callback buffer, not subsequent
host mixing, buffering, DAC or speaker output. **A clean report is not proof of
crackle-free audio.** Actual output analysis would require an external recording
or a verified host loopback, neither provided by this diagnostic.

UI previews/parameter requests, host-native instruments, host scheduling, and
other threads continue during B. This is deliberately callback isolation, not a
claim to suspend the whole device. A/B/C order is not randomized. Stopped-state
results cannot exclude bugs exclusive to playing clips. Deferred module work
may resume in C and is part of its measured workload. A pre-existing latched host
voice can remain audible; stop/reset that voice before repeating if necessary.

The pressure diagnostic command `tcapture` and its recording semantics remain
available in the engine; the CPU jog now starts `icapture`. Build identification
is generated from release.json rather than the old hard-coded .189 label.
