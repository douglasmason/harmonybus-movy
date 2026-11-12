# Voicing Rotate — HarmonyBus 0.2.320 / Movy hbclean.346

Assign **Voicing Rotate** in **Chord / Arp**, set **Rotation Steps**, and assign
the slot to an Approach Pressure row. The range is -12 to +12, default +3,
with Auto Off. Pressure selects a number of inversion steps from zero toward
that amount, with hysteresis to resist jitter.

Positive steps move the lowest voice to the nearest octave above the highest
voice. Negative steps move the highest voice below the lowest. For C4–E4–G4:

| Rotation Steps | Voicing |
| --- | --- |
| -3 | C3 E3 G3 |
| -2 | E3 G3 C4 |
| -1 | G3 C4 E4 |
| 0 | C4 E4 G4 |
| +1 | E4 G4 C5 |
| +2 | G4 C5 E5 |
| +3 | C5 E5 G5 |

For a close-position chord, a full cycle moves it one octave. Wide voicings move the outside
voice far enough to cross the other edge. Chord tones, voice count and harmonic
identity stay intact. At MIDI 0 or 127, rotation stops at the last complete
voicing; it never clamps or drops an individual voice. Single notes are unchanged.

Momentary returns to the underlying voicing on release. Tap Latch retains its
prepared amount; Peak Latch retains the peak pressure and lets a new squeeze
replace it with a lower amount. A light tap clears the latch. Reverse begins
at the configured rotation and moves toward zero as pressure increases.
Knob touches and operation buttons retain their existing hold/latch gestures.

The operation is track-local and affects generated chords, Chord Play selections
and their arp pools. Common sounding tones remain held; changed pitches keep
their existing note ownership and release paths. Arp clock, gates and strum
deadlines continue. Rotation runs before Chord Spread, so the two operations
can select an inversion and then open that voicing. Multiple rotation slots
add within -12..+12, and opposite amounts cancel. Every change recomputes from
the underlying chord, avoiding accumulated shifts.

Raw notes and explicit bass/top bounded input are unaffected. Follower live
revoicing retains the existing valid-harmony requirement, and frozen release
tails retain their onset voicing. These are stepped MIDI inversions, not MPE
pitch bends. Settings save; runtime pressure contacts and latches clear on
Stop, role changes and reload. Existing operation-step gates can replay this
operation; per-note capture excludes it, and continuous pressure envelopes
are not recorded by this feature.

Move, Remote UI and standalone share the operation editor and pressure-row
settings. Launchpad X supplies pad pressure; Mini and operation buttons use
the prepared amount. Remote UI's X/Y cloud input remains independently usable.
Update both HarmonyBus and Movy, then restart Move.

Automated checks cover signed inversion examples, wide voicings, both MIDI
limits, generated and selected chord owners, active arps, one-message output
buffers, pressure/latch/reverse, Spread composition, saved settings and cleanup.
Physical Move/Launchpad playing feel remains a hardware check.
