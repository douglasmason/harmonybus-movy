# Actor generator browser and automation — hbclean.289

Chord Play's **Libraries** category now contains a shared Comp/Bass generator.
Choose an actor first; each actor uses its configured track and keeps its own
unrecorded controls. Both pages show the actor and track; the footer also shows
the selected recording slot. The same controls work on Move and in the browser.

| Browse page knob | Control |
| --- | --- |
| 1 | Actor: Comp or Bass |
| 2 | Genre filter: All or one of this actor's authored tags |
| 3 | Family: Pulse, Sync, Phrase or User (matching the genre filter) |
| 4 | Style within the family and filter |
| 8 | Existing Range / tap Harmony Off |

| Generator page knob | Control |
| --- | --- |
| 1 | Complexity: optional authored rhythmic detail, 0–100% |
| 2 | Intensity: velocity and accents, 0–100% |
| 3 | Seed: repeatable variation of optional-attack thresholds |
| 4 touch | Start/stop temporary exploration |
| 5 touch | Bake the selected recorded generator clip |
| 6 touch | Restore the saved recipe's controls without restarting its phrase |
| 7 | Style: perform any authored pattern for this actor inside the current recipe |
| 8 | Existing Range / tap Harmony Off |

Comp retains Quarters, Offbeats, Sparse and 3-3-2. Bass adds Root / Fifth and
Sustain under Pulse, plus Sparse and Syncopated under Sync. All reuse the existing
actor catalog; optional attacks are explicitly authored. Complexity retains the
core attacks and adds detail; Intensity independently scales velocity. The seed
repeats its four-bar variation and never rerolls on repaint or audio blocks.

The Phrase family adds Pop Answer, Funk Pocket and Bossa (two bars), plus Soul
Space (four bars), for both actors. Later bars have authored responses and rests.
See [phrase styles and timing](actor-phrases.md).

Genre is a browser filter, not a recorded musical parameter. Changing it sends
no engine command and never changes the sounding style. The current style/family
remains visible even if it falls outside the filter, until another is chosen.
Style itself is recordable at the existing bar boundary. Complexity is a continuous
control, not another level of folders or a set of duplicated presets.

Generator knob 7 edits the actual Style inside a User recipe while the Browse
page retains its selected User slot. All styles for the actor remain available
here, independently of the browser genre filter. It uses the same Style control
for stock exploration and recorded clips. See [performing Style](generator-style-performance.md).

Comp and Bass can explore together on separate tracks. Switching actors recalls
the other actor's controls while both keep playing, including during recording
and count-in. The existing Record button remains bound to the actor and clip
chosen at punch-in; its next press ends that take even after switching actors.
The footer identifies the recording track when editing the other actor. A generator clip belonging to the other actor cannot be edited
through the selected actor's controls. Walking-bass anticipation is not included.

Bass emits mapped single-note patterns. Its temporary rendering disables chord
expansion, arp playback/latching and the additional rhythm generator, while
retaining the actor's captured mapping and expression. Stopping restores the
original rendering settings. Recorded/Baked Bass clips retain that articulation.
A new Bass attack closes the previous generated gate through the existing release
owner; manually added notes keep their own gates. Bake materializes those release
lengths, including the current swing and speed.

## Explore, then Record

Select an **empty clip on the selected actor track** before exploring. This is the normal
Clips selection, not the conductor's or melody track's slot. The generator panel
identifies the actor track; its exploring footer shows the recording destination.
Existing clips may be auditioned over temporarily, but Record refuses to replace
an occupied clip. Incoming Source Weaving must be set to Own to record a generator
take. Three ordinary automation lanes must be available; existing lanes are never
stolen. Explore itself allocates no lanes and changes no saved clip content.

While exploring, physical Record targets the selected actor through the usual Record
and Undo path. From stopped it uses the normal count-in; from running it uses the
normal bar-quantized empty-clip launch. Complexity and intensity are accepted on
step boundaries; style changes are accepted on bar boundaries. Those accepted
values are saved as named `generator:complexity`, `generator:intensity`, and
`generator:style` automation locks. The seed is fixed during a take.

Record saves a generator recipe, its captured actor rendering defaults and the
accepted control curves. It does not immediately fill the note editor with a
static pattern. The take grows through the existing recording clock, up to the
normal sixteen-bar clip limit. Stopping mid-bar preserves silence after the last
recorded tick. Save/reopen retains the recipe and curves; playback evaluates the
same source definition against the conductor's current harmony.

Tap Record again to end the take and continue its recorded playback. Tap Explore
Stop to end only the selected actor's temporary exploration and release its notes.
Harmony Off, transport Stop and leaving Chord Play end all temporary exploration.
Cancelling the recording actor during count-in also cancels its armed recording;
stopping the other actor does not affect the take.
Existing persistent content is preserved. Other actors continue normally. The
selected actor's existing clip clock is paused during unrecorded exploration, then
resumes when exploration ends.

## Revisit a recorded generator clip

Recorded recipes can also be saved without Bake in the existing actor User slots.
Their library review and Generator → User selection start temporary exploration.
Record copies the complete saved loop at its original length, then overdubs moved
controls. See [saved generator recipes](generator-user-library.md) for the workflow
and supported edits.

User entries now have names, genre tags, phrase length and a summary of changing
controls. Their names are shared with the ordinary actor library, where the
existing review supports renaming and metadata-only saves. See
[named actor recipes](actor-library-names.md).

Selecting a recorded generator clip recalls its family, style, seed and current
control values. During playback, untouched controls follow their recorded curves.
Turn Complexity, Intensity or Style to audition a temporary override; there is no
need to press Explore first. The selected clip must already be playing when the
transport is running. Its clock, loop, speed, transpose, voicing and manually
added notes continue normally. Stop Explore or transport to discard the override.

Use the **existing physical Record button** to punch in. It also works directly
from the Generator page without first moving a knob. From stopped it uses the
normal count-in. A recorded recipe counts as existing content even when it has
no ordinary notes, so overdubbing never auto-extends or restarts its loop.

To discard temporary edits in place, **touch knob 6 — Revert**. Complexity and
Intensity resume saved automation at the next step; Style resumes at the next
bar or trimmed-loop start. It also works when exploring a User recipe. Finish
that actor's recording/count-in first. See [Restore controls](generator-restore.md).

Only controls moved during the preview or recording are latched and written.
Complexity and Intensity enter on step boundaries; Style enters on bar boundaries
or the loop start for a trimmed loop. Untouched curves and other automation remain
intact. Press Record again to finish. The old curve resumes at the next control
boundary after punch-out; a style change therefore lasts through its accepted bar.
The whole Record-button pass has one Undo, including repeated loop traversals.
Recording without moving a control leaves the recipe unchanged.

The saved seed and original recorded span stay fixed. Clip selection, launch or
deletion ends the preview/overdub before another clip can receive its changes.
Cancelled count-ins write nothing. If automation capacity is exhausted, the
boundary edit is refused atomically and recording stops; earlier captured changes
remain available to Undo. Generator lanes must still be assigned, and incoming
Source Weaving must be Own, as for the first take.

Exploration uses the actor rendering settings captured when it starts, including
its voicing and mapping; Bass applies only the articulation overrides above. Use Follower with
Relative or Closest Split input. Temporary and recorded generation suppress new
derived follower attacks to this actor while retaining their original release
owners. Recorded/baked generator clips own that route only while transport runs.

## Bake and editing

End the selected actor's exploration and all recording, then tap Bake on the generator page. Bake turns the
selected recorded recipe and control curves into ordinary mapped notes, with one
Undo. It preserves the clip's loop, speed, transpose, rendering settings and other
parameter automation, materializing held values at new note starts where necessary.
Unused generator lanes are freed only when no other clip uses them. Bake never
replaces another slot or launches a clip. Bake before editing generated notes,
using them as pitch/rhythm donors, or saving a conventional user-library style.

This first source supplies its own authored timing. It does not interpret incoming
Source Weaving, clip rhythm transformations or Humanize timing while generating.
Bake therefore refuses active Humanize, clip rhythm transformations, Grid gates,
operation intervals or trig conditions that would make its ordinary-note playback
different. Turn those off before baking; they can then be applied to the ordinary
clip. Full rendering of arbitrary woven/operated performances is separate work.

## Implementation and checks

`generator.rs` is a bounded source adapter. It reuses static actor catalog attacks,
existing input-key mapping, the native transport, gate countdown, note emitter,
named automation storage, Set serialization and Undo. There is no second audio
player, UI sequencer, random reroll on draw, or temporary donor clip. Commands that
only configure exploration bypass the persistent-edit path. Move and browser use
the same controller and engine code.

Regression coverage includes byte-identical saved state after exploration,
occupied destinations, lane exhaustion, count-in cancellation, seed locking,
bar-aligned style changes, eight-bar recorded/reloaded/Baked MIDI trace equality,
mid-bar recording stops, swing and speed, preservation of other automation holds,
64/257/1024-frame audio blocks, shared physical Record routing, and production
Movy → Schwung chain → HarmonyBus MIDI/audio with exclusive routing and paired
releases. Automated verification does not replace a physical Move audition.

Overdub checks also cover recalled control values, transparent preview with manual
notes and speed/swing, bounded punch intervals, no-op recording, repeated loops,
trimmed lengths, capacity refusal, clip-change cancellation, physical Record
routing, a single Undo group, and native Undo/Redo through the production chain.

Actor coverage adds stable legacy Comp IDs, all four Bass patterns, independent
Comp/Bass automation, Bass monophony under control changes, manual overlay
ownership, swing/speed Bake identity, temporary setting restoration, physical
actor/genre navigation, non-default Bass destinations, both harmonic mapping
modes and production outgoing MIDI channel verification.

Simultaneous actor behavior and release validation are described in
[Comp and Bass exploration together](actor-duet.md).
