# Automatic audio check — Movy hbclean.185

This replaces the default long ABC workflow with one 35-second capture and one
results screen. It runs a 30-second known stereo test tone while normal sequencing,
HarmonyBus, instruments, sends and UI processing continue. No listening comparison,
Launchpad connection, prepared clip, or recorded notes are required for the tone.
A loaded musical set supplies the realistic workload; an empty set tests an idle
workload and is not equivalent to the problematic set.

## Use

1. Keep the affected set loaded. Open diagnostics with **Shift + Step 12**.
2. Click the jog for instructions, then click again to start.
3. The test starts playback if stopped. Stay on the screen, or press **Back** to
   keep capturing in the background while playing notes, changing tracks or using
   Key Center. Return with Shift + Step 12; this does not reset the capture.
4. After 35 seconds, photograph the **one saved results screen**. No A/B comparison
   or recollection of which phase crackled is needed.

Clicking the jog on the running diagnostic screen cancels the check. Cancellation,
module unload, set changes, recording/count-in, lost engine status or unexpected
transport stop end the check without reporting completion. Normal playback stays
running if it was running initially; otherwise the test stops what it started.
The earlier song position is not restored. Nothing is saved into clips or settings.
The native measurement stops itself after 35 seconds of callback wall time even if
the UI is stalled. The tone ends after 30 seconds of generated samples; a severely
stalled render can therefore report an incomplete tone rather than a false pass.

The tone temporarily **replaces Movy's local stereo audio output**, using 10 ms
crossfades at its start and end. It does not bypass the normal processing workload,
change track mutes, change instrument presets, or silence native Move instruments
receiving rendered MIDI. Those instruments may remain audible alongside it. It
uses a quiet 220 Hz triangle, with different left/right amplitudes and polarity.
The last five seconds normally capture the original local output again.

## What is checked automatically

The source uses a persistent phase accumulator. It passes through the actual
`mixer::mix_into_gains` core used by track and send summation. An independent
absolute-frame reference verifies every full-tone sample at the final Movy buffer
before the callback returns; crossfade samples are excluded. This checks phase
continuity, stereo layout, mixing gains, rounding and the generated PCM handoff.
There is no allocation, file I/O, logging, lock or per-sample clock in this path.
Its work is included in the instrumented chain-render stage.

This does **not** test a user instrument's waveform, HarmonyBus pitch correctness,
the whole chain/send routing path, the host's subsequent mix, native Move audio,
USB/audio driver, DAC or speakers. It cannot detect a buffer replayed or dropped
*after* the handoff. Automatic end-to-end physical-audio verification would need
an audio loopback. The integration regression separately calls the actual Movy
plugin ABI and checks returned samples with a C oracle outside Movy's checker.
Fault-injection tests demonstrate detection of corruption, repeated buffers,
zeroed buffers and channel swapping.

## One-screen fields

- **PCM OK / FAIL / INCOMPLETE**: tone oracle result only. OK requires a completed
  tone, checked samples and zero mismatches. It does not certify clean hardware audio.
- **GAP / BUD**: largest render-start interval and nominal audio-block duration, µs.
- **LATE**: intervals over 1.5 nominal block periods. These are not underrun counts.
- **GROUP / MAX**: groups of late intervals, and most late intervals in one group.
  Successive late observations within 100 ms belong to the same group.
- **SHORT**: intervals below half a nominal block period, potentially useful for
  recognizing callback catch-up/batching. This is not proof of a fault.
- **WORK / O**: largest measured callback work in µs and work-over-budget count.
- **AT GAP R / Q**: preceding render duration and measured request work from the
  actual largest-gap interval. Do not add these to unrelated peak rows.
- **Request name**: largest individual measured request within that same gap;
  it is not the unrelated global request maximum. A name alone does not prove causation.
- **PCM BAD / N**: mismatched and checked interleaved samples. K means thousands.

The native `cpulog` report is emitted once when the result is received. It retains
full counters, the largest group's span, exact sample counts and maximum error,
stage/request maxima and block attribution. Normal status polling is reused.
Results remain frozen while navigating away and back. Clicking the result opens
instructions for a fresh run.

No late calls or sample mismatches means **no measured problem in this window**,
not that intermittent crackling is fixed. Host buffering can tolerate uneven
callback cadence. The sustained tone makes an optional audio recording easier to
interpret, but a listening report is not required to capture these measurements.

## Previous diagnostic

The 3 × 20-second preview isolation test remains available: on the ordinary CPU
meter, hold **Shift while clicking the jog** to open its instructions. See
[preview isolation protocol](preview-ab-test.md). Its Back-to-cancel and five-page
results behavior are unchanged. Use the new automatic check first.
