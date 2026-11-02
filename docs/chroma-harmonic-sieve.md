# Scale Finding chroma accuracy: harmonic-residual benchmark (.311)

## Decision

Keep the existing lightweight Move DSP tap and bounded Goertzel analysis
worker. Do **not** vendor Essentia, aubio or libkeyfinder into the Move
release merely to estimate twelve pitch classes. Their extra build,
licensing and distribution requirements are not justified before a
real-audio comparison demonstrates a substantial gain.

References:
- [Essentia HPCP](https://essentia.upf.edu/reference/streaming_HPCP.html)
  computes pitch-class profiles from spectral peaks; it is not a direct
  polyphonic note-transcription output.
- [Essentia licensing](https://essentia.upf.edu/licensing_information.html)
  describes AGPLv3 and separate commercial licensing.
- [aubio pitch methods](https://github.com/aubio/aubio/blob/master/src/pitch/pitch.h)
  primarily estimate fundamental frequency and are released under GPLv3+.
- [libkeyfinder](https://github.com/mixxxdj/libkeyfinder) estimates
  aggregate key, not per-pitch-class live evidence; the
  [Schwung Key Detect](https://github.com/charlesvestal/schwung-keydetect)
  module already provides an architectural reference with a demoted worker.

This patch is a **small harmonic-residual heuristic**, informed by standard
spectral analysis principles. It is **not** an implementation of Essentia's
HPCP and does not claim the same quality.

## What changed

The previous Move filter bank measured only fundamentals C3–B5. A single
harmonic-rich C3 can make G4 look independently present because G4 is
almost exactly C3's *third* harmonic; an E5 can arise from its *fifth*
harmonic. The new chroma projection subtracts bounded contributions from
those lower fundamentals **before** folding into twelve pitch classes:

```text
residual(m) = max(0, raw(m) - .28*raw(m-19) - .20*raw(m-28))
chroma(pc) = max(residual(m) for m % 12 == pc)
```

Out-of-range parent terms are zero. Raw Goertzel values (not previously
suppressed values) enter every subtraction, so errors do not cascade.
All arithmetic is in the existing **SCHED_OTHER** worker. The RT audio
callback and the host-to-UI protocol are unchanged.

The browser projection now uses each *local FFT spectral maximum* once,
mapping it to its closest semitone, then uses the same harmonic residual.
Previously, overlapping ±1-bin candidate searches could report a single
C3 peak as neighboring B2 as well. The browser still uses Web Audio's
built-in FFT, while Move remains Goertzel-based.

## Manual override knobs (Move and Remote UI)

Scale Finding's settings also expose twelve explicit pitch-class constraints:
**Auto**, **Require**, or **Exclude**. These are separate from microphone
observations and latched playing notes. Manual exclusion wins over observed
microphone evidence; a candidate scale is incompatible if it contains any
excluded note or omits any required note. A manual-only selection can be
previewed and applied with Copy.

On Move, **K5 touch** opens or closes the override settings panel. K1–K6
cycle six pitch classes on the current page; K7 turn switches between
C–F and F#–B. K8 still shifts the reference tonic. The specialized browser
Remote UI offers a collapsible twelve-note override section and an explicit
Reset Overrides button.

**X clears captured/latched evidence, not intentional override settings.**
Reset Overrides explicitly returns all twelve settings to Auto.
Neither action writes the parent key; Copy is the only commit.

## Reproducible evidence

Rust unit tests synthesize harmonic-rich C3, simultaneous C major and
D minor triads, an independent G4 above C3, an A440 pure tone, and
silence. Browser regression tests synthesize explicit FFT peaks to
exercise overtone leakage, real chords, independent upper fifths and
silence. These are controlled signal-processing fixtures, **not**
a substitute for recordings of instruments and real music.

The ignored release benchmark `chroma_cpu_comparison_benchmark` reports:
- Analysis time per 4096-sample chroma frame (worker, not RT callback).
- Legacy pitch-class projection cost versus residual projection cost.
- A deterministic checksum to prevent dead-code elimination.

It emits a reproducible log included as `chroma-benchmark.txt` in
the release. Host runner times are **not** hardware timings.

## Limitations and acceptance

The coefficients 0.28 and 0.20 are conservative static
estimates. When a genuine quiet G plays on top of a strong C, the
algorithm may undercount G if its fundamental cannot be distinguished
from C's third partial. Percussive inharmonic instruments, dense
distorted recordings, alternate tunings and bass below C3 remain hard.
This is still probabilistic evidence; the user explicitly chooses
and applies the tonic/scale with Copy.

Before claiming a definitive improvement, evaluate labeled real-Move
microphone recordings across acoustic piano, guitar, voice, bass,
drums, and ambient playback. Compare false-positive/negative pitch
classes, CPU and underruns at the native device sampling rate.
If large real-audio gains require HPCP, compare an **offline** Essentia
reference first and review its license before linking or distributing it.
