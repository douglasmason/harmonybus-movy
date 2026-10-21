# Weave continuity — Movy hbclean.204-dev.1

Requires the already published HB 0.2.282-dev.2. No HB binary change is needed.
Install from the usual `douglasmason/harmonybus-movy` repository after the tested
archive has been published and `main/release.json` has advanced.

## Musical behavior

Clip Weave now uses the same quantization and scaled-sixteenth swing calculation
as ordinary donor playback. Donor pitches, velocity, probability, humanization and
recorded operations are not imported. The destination keeps its own notes,
velocity, input roles, recorded actions and trig conditions. Playback still uses
the destination's clip speed; it does not synchronize to the donor playhead.

Donor edits and changes to quantization, swing or loop length enter at the next
borrowed-loop boundary. A shortened/extended loop finishes its previous cycle
before adopting the new length. Source material is fingerprinted at boundaries;
unchanged loops reuse their sorted snapshot. No per-block scan, new timer or
additional playback engine is introduced. The cache remains fixed-capacity.

A temporary Repeat/Reverse/Shift/Speed override no longer restarts Weave on release.
The operation's existing age continues underneath the override. If the override
crosses a boundary, the source is checked when Weave resumes. Changes made during
an inactive interval are reflected then; historical edits are not replayed.
Donor slot changes and newly selected readers use their existing gesture age.
Stop/restart and a new Conditions window start a new phrase normally.

## Joint Play shortcut

Open **Comp Weave / Operations** from Joint Setup, Comp Track or Comp Rhythm.
The eight controls edit the comp track's actual operation lane:

1. Lane — choose an unused lane or your existing Weave lane.
2. Operation — choose Clip Weave.
3. Amount — the 1-based donor track number.
4. Auto — On for automatic use.
5. Cycle — 1 Bar for bar-based Conditions.
6. Every — 2 for alternating bars.
7. From — 2 for even bars.
8. Through — 2 for even bars.

Use Probability 100 in the ordinary operation editor for deterministic alternation.
The shortcut does not allocate, reserve, copy or silently replace a lane. Edits in
the ordinary track editor and Joint Play address the same HB settings. Switching
quartets targets that quartet's comp actor. Joint Play live operation gestures are
unchanged; this page configures the comp clip reader explicitly.

## Verification and device check

Regression coverage compares borrowed onsets against normal donor playback at
multiple quantization strengths and clip speeds. It checks delayed edit refresh,
cache reuse, loop-length edits, phase after a manual override across a loop,
stop/restart, recorded-note actions, chord grouping and native-track panel routing.
The candidate CI also runs the full Rust/browser suites and full-chain audio check,
then builds the ARM archive. Publish only that successful archive.

On Move, try a swung donor, edit its second attack while playing, and hold Reverse
across a loop before releasing. Confirm the borrowed rhythm resumes in phase and
listen for stuck notes or crackles. Hardware performance is not established by
the desktop tests. No device deployment or FM-1 flash is part of publication.
