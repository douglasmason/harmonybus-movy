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


## Right-side Move button design: Copy Queue -> Conductor Clip

Reuse the **physical Copy button (CC 60)**, not Record or Sampling. Stock Move
uses Copy for clip duplication and copying musical steps, while **Sampling /
Resampling** records audio from the main output and is not an abstract
conductor-track bounce. The appropriate in-Movy terminology is **Copy Queue**
or **Commit to Clip**, not an audio bounce.

Only Chord Play and Joint's chord-bank surface may override Copy. Other input
modes retain Movy's existing `seq/duplicate.ts` handler without any changes.
A new Copy owner must intercept both press and release before the generic
duplicate handler; never leave a stuck Copy modifier or inadvertently copy the
current melody clip. No special behavior if the queue isn't a complete,
well-formed cycle: show `Queue 0/2 — choose two chords` (actual depth
may vary) without opening a modal or altering anything.

**Gesture:**
1. Tap **Copy** with an active complete queued loop. The queue is the already
   selected *source*. Open `COPY QUEUE -> CONDUCTOR CLIP` and leave audio/other
   actors playing. Copy LED breathes. On a 128×64 display show the conductor
   track, chord count/duration and chosen destination.
2. Repurpose **step buttons 1–8** within that temporary destination picker to
   select the conductor's eight clip slots; empty slots dim gray, occupied slots
   in conductor color, selected destination green. Jog can browse the same slots
   and click can confirm. Default to first empty slot.
3. Tap an **empty** slot, or click Jog, to commit the abstract clip *immediately*.
   This is not a realtime recording. On an occupied slot, require an explicit
   second confirmation before destructive replace.
4. Once a full abstract clip write succeeds, request **Commit & Play** by default.
   The live queue continues until the first phase-matched loop boundary, at
   which point the engine transfers authority to the new clip **atomically**.
   Do not restart transport, displace melody focus, or create duplicate
   conductor note-ons. If the handoff cannot be guaranteed, leave the
   original queue in control and report a visible failure.
5. **Back**, or Copy a second time while choosing a destination, cancels only
   the picker. The queue keeps playing. **Undo** undoes the clip edit through
   existing clip Undo, not the previously playing live queue. K8 **Harmony Off**
   is still the explicit live-loop cancellation gesture.

The picker is a modal input owner: while visible, it temporarily owns the
step-row destination keys, Jog/Back and Copy. Track-select, Delete, held
encoder touches, Loop, and transport must either be passed through safely or
explicitly cancel the modal before doing their original jobs. Never let a
destination key also trigger a queued chord or a clip launch.

**Other right-hand controls** retain their printed base semantics unless
that input mode owns them:
- Capture: retrospective performed MIDI/automation (not an instant
  interpretation of the deliberately assembled chord queue).
- Sampling: microphone/line/resampling audio (unrelated to abstract clip data).
- Loop: clip/bar navigation; potentially a future queue-edit submode, but not
  Copy/Commit.
- Mute: mixer mute/solo.
- Delete: destructive clip/step operation, not a substitute for K8 Off.
- Undo/Redo: the existing Undo history.
- Back: exit modal/panel; Copy picker cancel when open.
- Record/Play: transport and real-time recording; leave unchanged.

This is an **interaction specification only** until the native queue snapshot,
transactional abstract clip writer, and same-phase handoff all exist. Do not
install an apparently functioning Copy button that lacks a complete musical
write path.
