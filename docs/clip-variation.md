# Clip Variation

Joint Play's Bass, Comp and Melody actors each have a **Clip Variation** panel.
The selected quartet determines which native track owns the settings.

| Knob | Control | Default |
| --- | --- | --- |
| 1 | Amount: how strongly to apply the selected variation | 0% |
| 2 | Gate depth: maximum proportional shortening/lengthening | 50% |
| 3 | Velocity depth: maximum proportional accent change | 30% |
| 4 | Omit depth: fraction of eligible attacks omitted at full amount | 0% |
| 5 | Reroll / Seed: turn to choose another saved variation (1–256) | 1 |

Amount zero is an exact bypass for subsequent attacks. Existing sounding gates
finish normally. Gate, velocity and omission depths can each be set to zero.
Reroll changes the seed at the next master bar while playing, immediately while
stopped; restarting uses the latest saved seed. Amount/depth edits affect the next
attack. Repeated rerolls before a boundary select the latest seed.

Notes at the same attack share a variation, preserving chord articulation. The
pattern repeats at the rhythm clip's phase and is independent for each actor.
Source Weaving resolves pitch/rhythm/expression first, then the destination's
variation is applied once. Donor variation does not change the borrowed rhythm.
Settings and seeds save with the Movy set and participate in normal Undo.
Stored notes and source clips are never rewritten.

This first version is for recorded clip playback on HB followers. Conductors,
pre-rendered notes, live pads, and actively recording tracks bypass it. Omission
preserves bar downbeats and every note carrying recorded operation metadata,
which conservatively protects imported motif targets and approaches together.
It does not add attacks, move onset timing, change pitch, or transform live
HB-generated motifs. Humanize retains its existing independent behavior.

The implementation uses the existing humanizer's deterministic hash, the shared
clip-emission function, and the existing gate/retrigger/stop ownership. It adds
no note queue or idle per-note scans. Shortened gates naturally truncate pressure
curves; their remaining points are not rescaled.

Validation covers zero bypass, repeatability, serialization/restore, conductor
and recording exclusion, bar-quantized rerolls, woven chords, unchanged source
notes, paired releases, and the real Schwung panel controller. Device feel and
audio performance require a subsequent physical-device test; no device is flashed
by this work.
