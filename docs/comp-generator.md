# Comp generator and automation overdubbing — hbclean.278

Chord Play now has **Comp Tn Generator**. It is a temporary performance source:
choosing a family/style or changing controls does not fill, replace, launch, or
save a clip. Tap Explore, then use the ordinary transport to hear it against the
conductor. Explore can also start while transport is already running.

| Knob | Control |
| --- | --- |
| 1 | Family: Pulse or Sync (syncopated phrases) |
| 2 | Style within the selected family |
| 3 | Complexity: optional authored rhythmic detail, 0–100% |
| 4 | Intensity: velocity and accents, 0–100% |
| 5 | Seed: repeatable variation of optional-attack thresholds |
| 6 touch | Start/stop temporary exploration |
| 7 touch | Bake the selected recorded generator clip |
| 8 | Existing Range / tap Harmony Off |

Pulse contains Quarters and Offbeats; Sync contains Sparse and 3-3-2. The
essential attacks come from the existing Comp catalog. Optional attacks are
explicitly authored for each style. Increasing complexity retains the core and
adds detail; intensity independently scales accents. The fixed seed repeats its
four-bar variation. A repaint, audio block boundary or idle tick cannot reroll it.
Genre tags are authored metadata for a later browser/filter; there is no genre
selector or Bass generator in this increment.

## Explore, then Record

Select an **empty clip on the Comp track** before exploring. This is the normal
Clips selection, not the conductor's or melody track's slot. The generator panel
identifies the Comp track; its exploring footer shows the recording destination.
Existing clips may be auditioned over temporarily, but Record refuses to replace
an occupied clip. Incoming Source Weaving must be set to Own to record a generator
take. Three ordinary automation lanes must be available; existing lanes are never
stolen. Explore itself allocates no lanes and changes no saved clip content.

While exploring, physical Record targets the Comp actor through the usual Record
and Undo path. From stopped it uses the normal count-in; from running it uses the
normal bar-quantized empty-clip launch. Complexity and intensity are accepted on
step boundaries; style changes are accepted on bar boundaries. Those accepted
values are saved as named `generator:complexity`, `generator:intensity`, and
`generator:style` automation locks. The seed is fixed during a take.

Record saves a generator recipe, its captured Comp rendering defaults and the
accepted control curves. It does not immediately fill the note editor with a
static pattern. The take grows through the existing recording clock, up to the
normal sixteen-bar clip limit. Stopping mid-bar preserves silence after the last
recorded tick. Save/reopen retains the recipe and curves; playback evaluates the
same source definition against the conductor's current harmony.

Tap Record again to end the take and continue its recorded playback. Tap Explore
Stop, Harmony Off, stop transport, or leave Chord Play to end temporary exploration
and release its notes. Cancelling during count-in also cancels the armed recording.
Existing persistent content is preserved. Other actors continue normally. The
Comp actor's existing clip clock is paused during unrecorded exploration, then
resumes when exploration ends.

## Revisit a recorded generator clip

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

Exploration uses the Comp rendering settings captured when it starts, including
its voicing and mapping; it does not install a stock voicing. Use Follower with
Relative or Closest Split input. Temporary and recorded generation suppress new
derived follower attacks to this actor while retaining their original release
owners. Recorded/baked generator clips own that route only while transport runs.

## Bake and editing

End exploration/recording, then tap Bake on the generator page. Bake turns the
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

`generator.rs` is a bounded source adapter. It reuses static Comp catalog attacks,
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
