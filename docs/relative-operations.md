# Relative operations and eight-note scales — Movy hbclean.271 / HB 0.2.304

Update HarmonyBus to **0.2.304**, then Movy to **0.34.1-hbclean.271**.
Movy loads the separately installed HB DSP.

**Half-Whole Diminished / Whole-Half Diminished** are available in the shared
Follower Scale and Parallel Scale menus. Keyboard labels are Dim H-W / Dim W-H.
An eight-pad target row plays all eight scale degrees. Six-note rows retain
1–6 followed by degrees 1 and 2 in the next octave.

**Smart Below / Smart Above** now work in ordinary operation lanes as well as
Harm Play banks. They choose complete LT or Upper Dim operations using the
effective target scale. Leading Tone and Connector Below keep their distinct
harmonic meanings. Live recordings retain the choice made at onset.

In **Motif Edit > Motif Tools > Relative Operation**, choose Captured, Smart Below
or Smart Above. This edits a selected note step and sets the choice for new
steps. Smart authored motifs adapt when played against another target or key.
Undo restores the previous step. Existing motifs keep their captured behavior.

**Motif to Clip freezes the selected choices.** The preview shows the resulting
LT / Upper Dim progression and “Smart choices fixed on write.” Polyphonic steps
keep simultaneous timing and receive a separate choice for each target. The
source motif remains adaptive.

This release generates the Rust recording/projection scale table from the same
HB catalog as the keyboard menus, removes duplicate hard-coded scale limits,
and carries the eighth degree through the native input bridge. Saved IDs are
preserved. Adaptive motif libraries use the versioned mf3 format; older mf1/mf2
libraries still load.

See the [shared design and compatibility contract](https://github.com/douglasmason/harmonybus/blob/main/docs/relative-operations.md).
