# Scale Finder native input diagnostics (.315)

The physical Move microphone path is not yet validated by a microphone
measurement on actual hardware. This release makes that acceptance test
observable rather than relying solely on colored pads.

## On-device controls

In **Session → Scale Finding**, touch **K6** (its knob touch, not its turn)
to open the **Audio Input Diagnostics** screen; touch K6 again to close it.
K5 touch still opens the independent manual note override settings,
and K6 turning in the normal screen still changes the evidence window.

The on-device screen displays:
- **Host audio ready/unavailable** — whether the Schwung host supplied a
  readable mapped input buffer and the low-priority analysis worker is running
- **Sample ON/OFF; analysis sequence** — whether native capture is armed
  and the worker is publishing data
- **Input RMS and peak (dBFS)** — levels calculated from audio samples by
  the background worker, before pitch gating or harmonic suppression
- **Input diagnosis** — stopped, collecting, input quiet/below threshold,
  audible input with no reliable pitch, detectable pitch, or analysis stalled

The existing Sample button still starts and stops listening. X clears
the accumulated pitch evidence; the diagnostic pane does not record,
change a key, alter source routing, or change the active clip.

## Implementation

The Move's audio callback remains unchanged: for a 128-frame block it
performs at most 16 mono atomic writes into the same ring. All RMS,
absolute-peak and pitch measurements run in the already demoted
SCHED_OTHER worker. **No new synchronous IPC query** is introduced.

The existing `status` response is extended with a single four-digit
hex token `mcg=<rr><pp>`. These values encode `dBFS + 96` from 1 to
96; zero indicates that the worker observed no measurable signal.
The old `mca`, `mcs`, and `mcv` semantics remain unchanged. UI
code parses the values in the existing status poll and marks the
analysis **stalled** when no new result sequence is seen for 450
application ticks while Sample is on. The stall indicator clears on
a fresh analysis result.

The normal pitch detector uses a gate around -54 dBFS RMS. Raw
input level is independent of that gate: for example, RMS -60 dBFS
means the host receives weak audio, not that the input bridge is
disconnected.

## Hardware acceptance

1. Install .315 from `douglasmason/harmonybus-movy` and restart Movy
   so the new DSP handshake has loaded.
2. Enter Scale Finding; touch K6 and check **Host audio ready**.
3. Press Sample with no line-in cable connected. Confirm analysis
   sequence increments at the worker rate (after initial buffering).
4. Speak, whistle, or play an A440 tone near the built-in microphone.
   Confirm RMS/peak rise. Then confirm the pad heatmap responds. The
   microphone source is **whatever the Move codec has routed** to
   AUDIO_IN; the UI does not force mic versus line-in.
5. If raw input rises but no note registers, investigate detector
   pitch gate, harmonics or instrument frequency range. If the worker
   sequence advances but raw level stays absent, investigate routing
   or gain. If sequence stops advancing, investigate scheduling and
   host render availability rather than assuming microphone silence.
6. Stop Sample and verify no new observation frames. Check that
   playback/Chord Play remains crackle-free with Sample on and off.

This diagnostic is not an automatic hardware test. Actual input routing,
real-audio detection accuracy, physical LED brightness and crackle-free
performance still require hands-on testing on the device.

## Automated regression

The Rust unit tests verify RMS and peak quantization, weak-but-
detectable input below the pitch gate, silence and transients.
The shared Move controller tests exercise the status parser and
stale-frame timeout and confirm K6 does not emit musical commands.
The same ARM64 package and production audio-chain regression suite
runs before publication.
