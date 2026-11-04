# Queued Chord Play: persistent conductor ownership and instant clip promotion

## Current behavior
A queued chord cycle belongs to the **native conductor**, not to Chord Play's
screen and not to the selected melody track. Switching tracks, returning to
Clips, moving to Normal/Joint/Scale Finding, and returning to Chord Play must
never send a native `chord_select=off` or `chord_route=off` for that cycle.

**Harmony Off (X or K8)** explicitly clears the native queue. Transport
Stop/Play, changing Chord Play screens, changing Queued/Immediate input
preference, and selecting another melody track do not clear it. Stop silences
rendered notes while preserving even an unfinished phrase; Play restarts a
complete queue at chord one. Queue End defaults to Loop but an explicit Hold
setting can change playback at the end without changing queue ownership.
Set unload/reset or intentionally replacing the conductor are separate hard
lifetime boundaries. No per-view or per-melody queue is added.

**Chord entry defaults to Queued** for a new Set, legacy state without a
saved choice, and Reset Chords; a saved explicit Immediate preference survives
reload. The physical **Sample** button in Chord Play toggles Queued (dim)
versus Immediate (bright), without clearing the stored progression. In Scale
Finding, Sample retains its separate microphone tap-to-latch/hold-to-listen
behavior; elsewhere it keeps stock sampling semantics.

The physical **Loop** button changes the saved queue's ending: Loop (bright)
or Hold (dim), never entry mode or musical authority. **Mute** bypasses the
queue (bright) or enables it (dim). Both buttons are unlit without a queue,
as are X and Copy; those latter two become dim only when a queue exists.
Sample alone shows the entry preference even with no queue. Queue bypass
preserves the stored progression, its cursor, and ongoing timing; adopting it
again resumes the current chord instead of chord one. These gestures do not
reset audio, mute the melody track, or erase other clips.

Only **X / K8 Harmony Off** explicitly cancels a queue. **Copy Queue to
Conductor Clip** now saves a snapshot while the live progression keeps playing.
The retained queue grows as chords are appended; Copy is bounded by Movy's
existing clip format (16 bars and 512 notes). An oversized queue remains intact
and is rejected rather than truncated. See [Copy Queue](queue-copy.md).

In the UI `Queue 0/2` means zero accepted choices toward Queue Depth 2. The
word `Fill` was confusing with our actual musical drum/motif fill operations.

The view hides only its LEDs, touches and panels; queued chord selection and
Chord Play's accompaniment route survive closing that view.
`setJointChordConductor` and the native `chord_joint` context switch must
also preserve the existing loop. Immediate auditions without a native queue
still release on mode exit. Returning to Chord Play refreshes queue text and
LED membership from the native snapshots.

Navigation sends `chord_select=leave`; the native bridge retains an owned
queue or releases the unqueued audition and route. This runs after preceding
chord commands on the same command path, without a new UI ownership flag or
status poll. Selecting the Queued preference alone is not evidence that a
native queue exists. Explicit `chord_select=off` still clears unconditionally.

## Verification and release

Release `.308` integrates this lifecycle change with `.307`'s contextual X,
Loop and Session controls. Controller tests traverse Clips, Normal, Joint,
Grid, Field, HB Settings, Scale Finding and Loop Edit while playing and paused,
then return to Chord Play and check the footer, queued LED membership and
melody focus. X/K8 still clear explicitly, and immediate-mode exit still clears
its audition and route. The production audio test changes Joint surfaces
before playback, during the 128-bar loop and while paused, asserting unchanged
queue state and no new attacks/releases from navigation.

Install using `douglasmason/harmonybus-movy`. This fixes cancellation during
navigation; it does not claim a measured improvement in device audio crackles.

## Copy Queue to Conductor Clip

Movy **0.34.1-hbclean.318** with HarmonyBus **0.2.312** implements instant
snapshot saving. In Chord Play or Joint's chord-bank surface, press **Copy**,
then an empty step-row destination **1–8**, or browse and click **Jog**. Back
or another Copy press cancels the picker. A created but empty clip counts as
occupied; this operation never overwrites it.

The native retained descriptors supply chord identity, scale, intent, register,
order and durations. The copied clip uses ordinary abstract selection actions,
not expanded MIDI voices. One Undo/Redo entry covers the edit. Melody focus,
other clips, transport and the live queue remain unchanged.

This supersedes the earlier proposed automatic **Commit & Play** default.
Copy saves; **X/K8** remains the explicit release of the live queue. The saved
clip can then be selected or launched with ordinary Clips controls. No automatic
phase-matched handoff is included. Such a handoff would be a separate operation
with its own timing/voice-ownership validation, not an implicit side effect of
Copy.

The picker owns destination presses and their matching releases, Jog, Back and
Copy. Transport, Undo, mode changes and encoder touches dismiss the picker
before retaining their usual behavior; melody pads remain playable. Recording
and count-in block Copy. Queue identity and empty destination are rechecked at
commit. Read [implementation and verification](queue-copy.md) for the supported
limits and tests.
