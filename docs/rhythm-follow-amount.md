# Blend own rhythm with a selected source

Follow Amount extends the existing Source Weaving route. Bass, Comp or Melody can
retain some of its own attacks while borrowing kick, snare or other accepted
onsets from a playing clip. No new Session mode or generator framework is added.

On the receiving actor's **Sources** page:

1. Enable Source Weaving and choose Rhythm Source and Rhythm Clip.
2. Use **knob 7, Rhythm Lane**, to follow All or one raw note from the donor.
3. Use **knob 8, Follow Amount**, to blend from **0 = Own rhythm** to
   **100 = selected source rhythm**. Intermediate amounts make a repeatable blend.

Pitch Source, Expression Source, operations and rendering retain their existing
settings. This control changes attack selection, not velocity or volume. At zero,
Source Weaving still applies those other dimensions; it is not an Off switch.
When Rhythm Source itself is Own, the amount has no effect and its lane filter
retains the existing behavior. The native/shared controller serves Move, Remote
UI and the browser. Source Preview and diagnostics include the amount.

## Musical behavior

At each captured phase of the receiving loop, a fixed selection mask chooses its
own rhythm or the configured donor. Both accepted-note paths use the same choice.
If both have a matching attack then, it fires once, without depending on track
order. Own-only attacks gradually leave and donor-only attacks gradually enter as
the amount increases. The selected attack keeps its own source clock and gate;
the pitch sequence advances only when an attack is actually accepted.

The mask depends on actor, playing slot and relative loop phase. It repeats for
the same transport/clip phases, survives reload and does not consume shared RNG
state. It does not quantize, move, regenerate or write either clip's notes. Source
swing, probability, conditions and suppression are evaluated by their existing
schedulers; different clip rates retain their existing clocks. A different
actor/slot has its own mask. Changing the amount does not reset the pitch cursor
or cancel sounding notes. Shared pitches at two distinct times can still retrigger
under the established note lifecycle.

A source rest remains a rest when its side is selected. A stopped/muted/missing
donor therefore removes its contribution; it does not suddenly restore the full
Own pattern. Zero remains independent of that donor. The lane filter affects only
the donor contribution when blending independent sources. Record still bypasses
weaving for the recording actor and records its Own material.

## Why this increment

Keeping exact following alone is simpler and remains best when every kick must
be matched. Independently adding probabilistic donor notes could double coincident
attacks, advance pitch groups twice, and create order-dependent gate ownership.
Complementary deterministic masks provide a small extension to the accepted-note
dispatcher, with no retained event cache, clip rescan, second scheduler or new
heap allocation. Endpoints avoid hashing. The existing deterministic seed helper
is reused at intermediate amounts.

The tradeoff is that blending can remove a characteristic own-only accent, and
50 does not promise half the audible notes came from each source: density and
overlap matter. This is rhythmic crossfading, not accent weighting, proximity
matching, automatic counterpoint, fills or protected-motif regeneration. Generated
receivers still own their timing; recorded generator donors remain supported.
Those broader behaviors need separate musical policies, not extra hidden work
inside this control. Follow Amount is saved/undoable route state, not a newly
recordable automation lane or a temporary generator audition.

## Compatibility and verification

Older sets and routes default to 100, preserving exact following. Optional route
field 23 stores 0..100; invalid edits reject atomically. Canonical default routes
retain the older encoding, including the existing optional lane field.

Tests cover endpoints and intermediate musical traces, every amount's overlap
and monotonic-selection behavior, track order, nonzero loops, opposing speeds,
swing, probability, generated donors, independent receivers and cyclic routes,
live edits, pressure/gates, source loss, Off/Record, save/load/Undo and block sizes.
Shared-controller tests exercise knob 8 and external readback. The production
Movy → Schwung → HB harness checks 0/50/100, audible PCM, destination pitches and
velocity, and paired releases. Release benchmarks include 0/50/100. These checks
do not establish physical Move crackle or latency performance.
