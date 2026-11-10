# Pressure note repeat — Movy hbclean.338 / HarmonyBus 0.2.315

Two operations repeat held notes and chords at a pressure-controlled rate:

| Operation | Divisions of one quarter-note beat |
| --- | --- |
| Note Repeat | 1, 2, 4, 8, 16 — quarter notes through sixty-fourths |
| Repeat Divisions | Every integer from 1 through 16, including triplets and 5, 7, 9, 11 or 13 per beat |

Choose one in an existing operation slot. **Max Repeats / Beat** sets the upper
limit (default 16). Note Repeat rounds that limit down to a power of two; Repeat
Divisions uses it directly. Leave **Auto Off** for pressure-only performance.
Assign the slot to an approach row on **Approach Pressure**, then choose Momentary,
Tap Latch or Peak Latch. Pressure settings default to Off for existing sets.

Light positive pressure starts at one repeat per beat; increasing pressure moves
through the divisions up to the limit. Zero pressure stops repeats. The original
pad attack remains immediate, and repeats start on the next division boundary.
Changing rate while holding a pad needs no new note-on. A small hysteresis band
prevents pressure jitter from repeatedly crossing the same rate boundary.

Reverse makes harder pressure slow the repeat. Peak Latch retains the fastest
rate reached; with Reverse it retains the slowest. Each new press starts afresh,
so a new squeeze can replace the latched rate with a lower peak. Tap Latch uses
the existing prepared percentage. The page shows the resulting division, such as
`Repeat 1/32` or `Repeat 5/beat`, rather than only a pressure percentage.

The row controls its assigned operation for the track. Held output notes repeat
together, retaining their pitches and attack velocities; pressure changes timing,
not loudness. Multiple pads in a row retain the existing maximum-pressure rule.
This is distinct from Ratchet, which produces a finite burst from each attack.
Repeat gates use 50% of the current interval. Scheduling follows tempo and drops
missed repetitions after a stalled callback instead of emitting a catch-up burst.

Releasing a source note ends its repeats, including when a pressure amount is
latched. A latched rate remains ready for subsequent notes; it does not latch a
released note indefinitely. Stop, channel changes and state restore clear runtime
pressure. An operation's automatic or separately held contribution can still own
it after pressure releases. The source-note owner and existing repeat scheduler
handle all note-offs, including shared-pitch owners and pool exhaustion.

The same native operation metadata supplies Move, Remote UI and standalone panels.
Move and Launchpad X can supply pressure; ordinary buttons/knob touches can activate
the operation at its configured rate. Continuous fractional rates (for example
5.4 per beat) and recording pressure-rate envelopes are not part of this release.
Saved settings survive reload; live pressure and running repeat voices do not.

## Related pressure gestures

Pitch dips/scoops, voicing expansion, and fourth/fifth walks are separate upcoming
operations. They should reuse these pressure/latch/reverse controls and remain
local to the played note/chord. Chromatic walks use fixed semitone intervals;
parent-scale walks use scale-degree motion. Voicing spread should preserve chord
tones while changing register. These gestures are not implemented by Note Repeat.

Automated tests cover both rate sets, hysteresis, live rate changes, tempo changes,
chord repetition, Reverse Peak Latch, note release, reused owner slots, Stop and
state/metadata. Physical pad calibration and performance feel require device play.
