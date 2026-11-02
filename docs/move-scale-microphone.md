# Native Move microphone input for Scale Finding (.310)

The `Sample` button in the Scale Finding Session mode now requests live
pitch-class observations from the physical Move's **existing Schwung AUDIO_IN**
signal. This input is whichever microphone/line source the Move audio codec
already routes to the input. The bridge does not select or configure hardware
capture, start Move's stock sampler, record a WAV, or touch clips.

The `Loop` button remains reserved for a future evidence-looping function.
`Copy` applies the *selected tonic and scale* together; `X` clears the
transient evidence; K6 adjusts the evidence EMA time constant (0.12–16 s).

## Design and realtime budget

- No Schwung host modifications, system commands, ALSA clients, file I/O,
  or additional synchronous input polling are required.
- The pinned Schwung `host_api_v1_t` already provides `mapped_memory` and
  `audio_in_offset`. Schwung's DSP contract identifies that buffer as 128
  interleaved stereo int16 input frames at 44,100 Hz. This is also the input
  used by its existing Move-input sampler and Line In modules.
- Movy's own DSP render callback copies a **mono, 8:1 decimated** view of that
  existing 128-frame block into an 8192-cell lock-free atomic ring. A block
  costs at most sixteen atomic sample stores and bounded integer additions.
- A separate worker demotes itself **as its first action** to SCHED_OTHER
  with nice +10 and affinity to cores 0–2, keeping SPI core 3 available.
  Every 160 ms while listening, it evaluates 36 fundamental Goertzel
  frequencies, C3 through B5, over a 4096-sample Hann window. No FFT,
  allocation, mutex, file I/O or string formatting runs in the audio callback.
- Results are twelve byte-valued pitch-class strengths. Their sequence and
  values are added to the **existing** `status` response as `mca`,
  `mcs` and `mcv`. The UI's pre-existing ~24 Hz status query is the
  only transport. Repeating a sequence never updates the evidence.
- Scale Finding performs the same configurable EMA aggregation and LED
  quantization as its browser listener. An explicit Sample press starts;
  a second press stops while retaining accumulated evidence. Leaving the
  input mode, switching to Session or unloading disables collection.
  When no native audio buffer or analysis worker is present, the Sample
  button is dark and capture refuses to start.

## Input limitations

- This is pitch-class *evidence*, **not** reliable polyphonic transcription.
  Goertzel harmonics, acoustic leakage and chromatic passing tones can appear
  as additional notes. The chosen tonic remains an explicit hypothesis.
- Audio source follows existing Move routing. If a line-in cable or USB-C
  input is selected, it may analyze that signal instead of the built-in mic.
- Quiet audio below the -54 dBFS RMS gate is treated as silence. The
  0.74-second analysis aperture is separate from K6's 0.12–16 second
  evidence-persistence time constant.
- Never treat a reported available pointer as proof of nonzero microphone
  signal: the user must perform a physical device capture check.

## Verification and hardware acceptance

The checked-in Rust unit tests cover A440, silence and disabled capture.
The production browser/controller regression tests cover the Sample button,
stop and clear semantics, and conservative catalog projection.
The release workflow builds the actual ARM64 DSP and runs its Rust unit
suite, production chain test, and UI bundle before publishing.

**Hardware acceptance still requires hands-on validation on an Ableton Move:**

1. Install the release and restart Movy so the new DSP is loaded (ping
   version must match). Select Session → Scale Finding.
2. Verify Sample is dim (input available). Tap Sample; it becomes bright.
   Sing/whistle A440 near the built-in mic with no input cable attached.
   The A column should brighten within the K6 aggregation time.
3. Vary K6 between 0.12 and ~4 seconds; verify fast/slow decay.
   Stop Sample; pitch evidence freezes, and X clears it.
4. Open other modes; confirm Sample returns to normal sampling and that
   no background capture survives navigation, Set load, or disconnect.
5. Run with transport/queued Chord Play and Launchpad attached, compare
   crackles, latency, CPU and missed deadlines with Sample off/on.
   Verify no audible regression. Also verify line-in selected behavior.

This work reuses the host's verified buffer ABI and avoids a new host
audio-routing dependency, but no software CI can substitute for the
physical mic/underrun measurements.
