# Scale Finder: conservative harmonic-function timeline

This is an **optional browser Remote UI analysis**, not a new Move
performance mode and not a second key-detection engine.

## Interaction

Open **Scale Finder → Piano/Inline**, collect live microphone evidence,
select a compatible seven-note scale candidate, and expand **Harmonic
function · advanced**. Click **Pin selected tonic + scale** to lock a
tonal hypothesis *for analysis only*. The ranker's live candidate order
can change as new audio arrives; pinning avoids the functional analysis
silently shifting from one tonic to another.

The interface exposes a bounded timeline of:
- **T** — tonic function;
- **PD** — predominant function;
- **D** — dominant function;
- **?** — unknown/insufficient evidence.

**Chromatic** is an independent flag applied to the region, not a
replacement for its function. When a chromatic note weakens a diatonic
chord fit, Unknown is an appropriate result. The timeline does not
attempt chord inversion, borrowed quality, secondary-dominant naming,
bass transcription, or auto-generated T–PD–D–T cadences.

**Unpin** discards the analyzer's history and hypothesis. **Clear
timeline** discards history but keeps the current pinned hypothesis.
Stopping Sample retains the last timeline without adding segments.
The normal X evidence clear also clears the timeline. Leaving Scale
Finder releases the pin and resets the history.

The pinned hypothesis is separate from the actual live HarmonyBus key.
**Only the existing Copy action applies a tonic and scale**. No chord
queue or recorded clip is created.

## Signal and inference contract

The analyzer receives the browser microphone's existing **12-element
raw chroma** output, before the longer K6 evidence window smooths the
signal. It does not request audio samples or add a second FFT.

Given an explicitly pinned seven-note scale, it builds a small
diatonic *triad-template* set:
- T: degree I (and VI as a tonic substitute in major);
- PD: degrees II and IV;
- D: degree V, with VII included only when its root is a raised leading tone (a semitone below the tonic). Modal flat-VII is not automatically dominant.

Unknown is a full output state, not a failure to pick a chord.
The model refuses to label one- or two-note input and rejects noisy,
ambiguous or insufficiently pure matches. It requires a new stable
classification over at least **350 ms** before recording a region;
adjacent identical regions coalesce. Stalled timestamps reset the
dwell window. A maximum of 24 recent regions is retained in memory.

This small deterministic model should not be mistaken for calibrated
probabilities or general-purpose chord transcription. The underlying
chroma has no reliable bass/root information. Tritone substitutions,
modal loops, non-tertian harmony and deceptive resolutions can make
a tonal-function reading unreliable.

## Deployment and limitations

The advanced timeline is a browser-only specialized Remote UI pane
using `dev/local/harmonic-function.mjs`; the connected Move mirror
remains **read-only**. There is no claim that an iPad viewing a
physical Move automatically receives native microphone chroma, or
that the physical Move display can show the timeline.

The existing Move source bridge, Goertzel worker, button mappings,
manual overrides, and native DSP remain unchanged in this milestone.

CI runs browser microphone and harmonic-function regression fixtures
alongside the pinned native/controller suite and ARM64 package build.
The synthetic sequence tests cover I–IV–V–I, incomplete dyads,
major/minor tonic ambiguity, chromatic flags, silence, 350 ms dwell,
nonmonotonic timestamps, and bounded memory. Physical microphone
verification and real-music evaluation still require recordings.
