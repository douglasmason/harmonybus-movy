# Chord loop and automatic touch phrases — hbclean.260

Requires the pinned HarmonyBus 0.2.299 source included in this build.

The shared performance footer shows short chord loops in full, with the sounding chord in brackets. Long loops follow the current position, showing neighboring chords and a position such as L3/8. Wraparound and repeated identical chords use the native playback cursor. If a newly appended chord has not yet joined the current pass, an explicit >Next label preserves the already scheduled next chord.

Chord names no longer show stray pluses from an internal pitch flag. Real chord qualities and bass inversions remain visible.

Numeric Queue Depth is the start/refill threshold, with a default of 2 and capacity of 16. Separate taps use that threshold. Overlapping knob and/or step-button touches automatically commit their connected phrase on the final release, without changing the chosen numeric depth. Touch Phrase is the first option for explicitly using release-to-commit entry even for single taps.

While holding a knob, jog or arrows can browse other panels without adding a chord. Touch another knob or its matching step button to continue the phrase. For the same physical knob on a new panel, press its matching step button before lifting the old knob; the step carries the overlap. Releasing all controls ends the phrase.

A new batch arms when the entry touch releases, so Depth 1 also recognizes overlap. Already-running playback keeps its clock. Stop and Harmony Off clear the gesture and queue. Recording captures actual scheduled chords. No panels were added.

Validation: shared footer and controller regressions, native scheduling and label checks, production MIDI/recording bridge, browser typecheck and build, QuickJS startup, native/WASM parity and ARM package verification. Includes previously merged Euclidean Fill native rhythm controls.
