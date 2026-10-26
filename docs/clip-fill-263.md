# Movy 0.34.1-hbclean.263 — Independent Clip Fill Variations

Clip Fill now offers two independent, **preview-only** rotations when composing a melodic clip from existing material.

- **Shift + knob 1:** rotate complete source pitch/chord onset groups, without splitting a chord or changing saved input-key, note-operation or harmonic intent.
- **Shift + knob 3:** rotate the rhythm donor's attack positions by sixteenth-note steps within its loop, keeping velocity accents, gate lengths and original repeat timing.
- The screen shows **P0 R0** for the unmodified sources. Both rotations are reversible and reset when Fill is reopened. The original behavior and six-field requests are unchanged when rotations are zero.

Choose **Sequence** or **Fit** in Clips View Fill to use the rotations. Touch a knob to preview; press a destination clip pad to commit the reviewed result. The ordinary Clip Fill write and one-step Undo apply, with the existing stale-source fingerprint checks. **Original** (including drums and conductor phrase copies) intentionally retains its existing exact authored timing and kit-lane identity.

No additional playback scheduler, audio-thread work, note owner, scale/travel mapper or Source Weaving engine was added. Existing Clip Variation and Gate/Dynamics/Omissions locks remain independent. This release includes earlier Movy Chord Play features and the verified Lock & Vary system.

Verified on native sequencer, controller/browser, full MIDI/audio chain and ARM64 package CI. Physical Move testing has not been performed by the release workflow.
