# Queued Chord Play: persistent conductor ownership and instant clip promotion

## Current behavior
A queued chord cycle belongs to the **native conductor**, not to Chord Play's
screen and not to the selected melody track. Switching tracks, returning to
Clips, moving to Normal/Joint/Scale Finding, and returning to Chord Play must
never send a native `chord_select=off` or `chord_route=off` for that cycle.

Only the explicit **Harmony Off (K8)** gesture, replacing the performance with
a new conductor's accepted chord, Set unload/reset, or an explicit destructive
operation is allowed to retire the shared queued loop. The native
`chord_queue` handler already enforces a single conductor owner and clears
the prior owner when a different conductor's selection is accepted. Do not
create per-view or per-melody queues.

In the UI `Queue 0/2` means zero accepted choices toward Queue Depth 2. The
word `Fill` was confusing with our actual musical drum/motif fill operations.

The view hides only its LEDs, touches and panels; chord selection and
accompaniment routing persist as the current musical performance.
`setJointChordConductor` and the native `chord_joint` context switch must
also preserve the existing loop. An explicit K8 Off remains the single user
cancellation gesture.

## Queue -> Conductor Clip (planned transaction)

The presently implemented live recording captures *onsets* as they occur.
That is not an instant save. An instant promotion must convert the completed
abstract native cycle into a **new conductor clip** in one transaction.

The intended operation is a previewed `Save Queue to Clip`, defaulting to the
first empty conductor clip slot. It requires an armed/complete, unambiguous
cycle; an unfinished Queue Depth or Touch Phrase is rejected.

1. Read the actual native queue's immutable chord descriptors (pitch, exact
   root/quality/parent scale/intent/register), cycle order, rhythmic boundaries
   and current cycle phase. Avoid reconstructing descriptors from names or
   the UI's 21 mutable bank slots.
2. Build an abstract clip off the audio path, one event per queued selection
   with onset/gate derived from Queue Time (and explicit irregular boundaries
   when Observed timing is available). Do not sample MIDI or replay the queue
   in realtime. Reuse the existing encoded selection actions, never expand
   generated chord voices into clip notes.
3. Validate the target empty clip, descriptor shape, capacity, Set identity,
   clip signature and all lengths *before* editing. One Undo transaction,
   no partially written clips.
4. Arm a **same-phase handoff** for the next guaranteed cycle boundary. At that
   boundary, release the live queue voice and activate the new clip's matching
   descriptor atomically; no duplicate note-ons, missing chord or rhythmic
   restart. Followers must see matching lookahead through handoff.
5. Mark the new clip as playing on the conductor while leaving the other
   actors and their clip positions alone. If validation/activation fails, keep
   the original live loop intact.
6. Confirm in the footer that the queued source was saved and transferred to
   the conductor clip. Existing saved clip contents are never overwritten
   without explicit confirmation.

These steps are **not yet a shipped implementation**. They require a native
queue-export protocol and a new atomic clip-write/phase-handoff command in
Movy's Rust clip engine. Ordinary Record remains unchanged and should not be
recommended as a substitute for instant promotion.
