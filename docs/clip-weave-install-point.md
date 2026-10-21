# Clip Weave install point

Candidate pair: HB **0.2.282-dev.2** and Movy **0.34.1-hbclean.203-dev.2**.
The candidate workflow pins HB `d8a8ee1a0192e299dcdb7005e7f9393220c9fa4d`.
The existing conductor inversion and surface fixes are included.

On the destination's operation lane choose **Clip Weave** and set **Rhythm Track**
(Amount on compact controls) to the donor's 1-based track number. Launch clips on
both tracks. The donor can be muted. Hold the lane to borrow its stored rhythm.
For even-bar weaving: Auto On, Cycle 1 Bar, Every 2, From 2, Through 2,
Probability 100. Normal destination playback returns on odd bars. A second lane
with From 1 / Through 1 can choose another donor instead.

Destination pitches, velocities, chord groups and recorded note actions remain
its own. Donor simultaneous attacks are deduplicated and use the longest gate.
The snapshot repeats the donor loop at the destination clip speed, cycling through
destination note groups. Reciprocal assignments use original stored material.
There is one bounded allocation-free snapshot cache per track and no new scheduler
or periodic UI polling. Manual priority and phrase windows are the existing ones.

Snapshots refresh on activation, donor slot change and after a manual interruption.
Edits to active source clips apply at the next activation. Donor timing is raw
stored timing, without donor swing, quantization, humanization or trig conditions.
Destination timing transforms are replaced, but pitch rendering and trig conditions
remain. Missing/stopped/empty donors fall back to normal playback. Recording the
destination disables weave; weave itself is not recorded into operation intervals.

The push workflows produce ARM archives and SHA256SUMS. Both candidate workflows
must pass before installation. Download their artifacts from the branch's Actions
runs. Stable installer pointers remain unchanged. This is an installable Movy/HB
candidate, not a claim of complete LOOM/FM-1 parity or a hardware-validated release.

Device acceptance at this checkpoint: verify ordinary playback and bass-follow-root;
then two clips with clearly different rhythms, hold/release, even-bar Auto, manual
Reverse overriding Auto, muted and stopped donor, reciprocal assignment, recording
and stop/restart. Listen for hanging notes or truncated retriggers. Retain the
previous working package for rollback. No device deployment or firmware flash is
performed by the build workflow.
