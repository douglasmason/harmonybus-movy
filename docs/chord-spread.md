# Chord Spread — HarmonyBus 0.2.318 / Movy hbclean.343

Assign **Chord Spread** to an operation slot in **Chord / Arp**. **Max Spread
Steps** runs from 0 to 12, defaults to 4, and Auto starts Off. Assign that slot
to an Approach Pressure row to open the chord as you squeeze.

Each step raises one upper voice by an octave, starting at the top and cycling
down through the upper voices. The lowest voiced note stays anchored. For a
C4–E4–G4 triad:

| Steps | Voicing |
| --- | --- |
| 0 | C4 E4 G4 |
| 1 | C4 E4 G5 |
| 2 | C4 E5 G5 |
| 3 | C4 E5 G6 |
| 4 | C4 E6 G6 |

Chord tones and voice count remain unchanged. The expansion stops before a
voice would exceed MIDI 127. Single notes are unchanged. This is a stepped
voicing operation, not continuous pitch bend.

Momentary returns to the original voicing on release. Tap Latch holds the
prepared amount; Peak Latch holds the greatest pressure reached, allows a new
squeeze to replace it with a lower level, and clears on a light tap. Reverse
starts expanded and closes toward the original voicing as pressure rises.
A small hysteresis band prevents pressure jitter around step boundaries.
The readout shows the current spread step.

The operation affects the owning track's generated chords, Chord Play selections
and their arp pools. Held notes retune through the existing owner/release path;
unchanged pitches remain sounding, and arp phase, gates and strum deadlines
continue. Changes recompute from the underlying voicing rather than repeatedly
adding octaves. Global Transpose can move the resulting voicing afterward.
Raw melody notes and explicit two-note bass/top bounded input stay unchanged.
Follower generation and live revoicing retain their existing requirement for a
valid harmony context. Frozen release tails retain their existing voicing.

Move, Remote UI and standalone use the shared operation editor and pressure-row
settings. Launchpad X supplies pad pressure; Launchpad Mini and operation
buttons use the prepared amount through existing hold/latch gestures. Remote
UI uses the same Z control; its X/Y cloud input is independent of this operation.
Multiple active spread slots on one track add, with a total limit of 12 steps.

Assignments, amounts and pressure settings save normally. Runtime contacts and
pressure latches clear on Stop, role changes and reload. Existing operation-step
gates can replay the operation. Per-note action capture does not bake in spread,
and this change does not record continuous pressure envelopes.

Automated coverage exercises generated and selected chord owners, pressure,
reverse, latch replacement, MIDI limits, arp timing, track isolation, state
restore and note cleanup with one-message output buffers. Physical Move and
Launchpad playing feel remains a hardware check.
