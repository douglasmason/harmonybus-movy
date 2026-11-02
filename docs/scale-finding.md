# Scale Finding: families, piano evidence, and microphone-assisted matching

Scale Finding is the silent Session view after HB Settings. The 4×8 pad
surface never emits instrument notes or records clip data. Copy commits the
**tonic AND the scale** together by calling conductor track 1's existing
HarmonyBus `key_center_tonic`, `key_center_explicit_scale`, and
`key_center_apply=Apply` operations. It never changes follower input scale.
X clears only transient preview and listening evidence, not the committed key.

## Layouts and controllers

- **K5:** switch Family → Piano → Inline, keeping evidence when changing layouts.
- **Family:** four seven-note families and their modes; K1–K4 change families,
  K8 changes the reference tonic, K7 arms a one-shot pad-to-key commit.
  The white tonic *column* persists regardless of focused track and the
  selected pad is play-green. Unmapped native rotations are refused.
- **Piano:** two pairs of rows laid out like a piano, lower pair for temporary
  held-note evidence and upper pair for toggled persistent-note evidence.
  Black-key gaps are inert. Repeated C serves as octave reference.
- **Inline:** twelve chromatic pitch classes over two rows, repeated in
  upper/lower live/latch pairs; extra cells are inert.
- **K7 + pitch pad:** designate that pitch as the tonic for piano/inline.
  K8 turns the tonic directly. White indicates tonic, green indicates selected
  note evidence. The manual octave repeat does not infer the tonic.
- **K6:** set the microphone accumulation window, 0.12–16 seconds.
- **K7 turn:** choose the next/previous matching scale in Piano/Inline.
- **Sample:** listen/stop pitch-class collection, without recording or saving audio.
  The Sample LED is bright while listening, dim when the provider is ready,
  and dark when microphone input is unavailable. Stopping retains the
  accumulated chroma for review before choosing a key.
- **Loop:** reserved for possible evidence replay/looping. It does not toggle
  microphone collection or enter the old bar Loop Edit view in Scale Finding.
- **Copy:** apply selected **tonic + scale**. A candidate must be compatible
  with the selected notes; no background detector can change a key on its own.
- **X:** clear transient note evidence (and candidate selection). Global
  Capture, Shift, Undo/Redo, Play, Record are not reassigned.

## Candidate matching

The ranker uses the checked-in HarmonyBus scale catalog and restricts to
native-supported scale names, rather than inventing a mode. With tonic
declared, it scores coverage of selected pitch classes, penalizes extra notes
and shows compatible matches ahead of approximate ones. If no candidate is
compatible, Copy refuses the operation. This remains an aid to listening:
music may modulate, include chromatic approaches or contain non-diatonic
chord tones, so a selected scale is a hypothesis rather than a certainty.

## Microphone acquisition and privacy

**Browser studio** can analyze its local microphone after the user explicitly
presses Sample or the on-page Start Listening button and grants permission.
The analyzer uses bounded 8192-point FFT frames on its own analyzer node,
maps harmonic evidence to twelve pitch-class values, and sends only a
12-number normalized chroma snapshot to the *local* Movy browser engine
approximately 11 times/second. Raw microphone samples are not persisted,
sent to HarmonyBus, or forwarded to an external device/service. The mic
source is never connected to speaker output.

An exponential accumulator is weighted by the K6 aggregation window.
Five stable palette levels are used to avoid overwhelming Move's LED queue;
white tonic and manually selected green notes take priority over intensity.
The window is an aggregation time constant, not a hard-cutoff buffer size.
A long window helps with sparse melodies but can retain earlier key material.
The analyzer is not a guaranteed polyphonic chord transcriber: loud harmonics,
room noise, speaker bleed and percussive transients can create false positives.

The browser immediately disconnects and closes its microphone stream on
Stop, mode exit, browser engine suspension, tab hiding, page unload or
disconnect. The production sequencer refuses microphone chroma when it is
not listening or Scale Finding is inactive. The Sample LED also indicates
unavailability when no microphone provider exists.

**On-device limitation:** Schwung's published JavaScript UI API currently
does not expose a verified, nonblocking microphone audio buffer to Movy's
UI. The physical Move runs manual Family/Piano/Inline Scale Finding, but
its microphone listening action remains unavailable until a dedicated
native audio-input bridge is provided and real-device underrun tests pass.
No unverified system sampler polling or realtime DSP hook is installed.

## Verification

`hb-scale-finding.mjs` validates the silent pad surface, persistent family
tonic colors, key application, pitch-class evidence, ranked preview,
aggregation-window EMA, microphone stop retention, clearing, and mode exit.
Browser and production integration tests must pass before a release is
published. Device microphone streaming remains explicitly out of scope.
