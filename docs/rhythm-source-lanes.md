# Follow one lane from a mixed drum clip

An actor can now borrow just the kick, snare or another note lane from its
Rhythm Source. The donor can keep its complete drum pattern; no separate kick-only
clip is needed. Different receiving actors can choose different lanes from the
same playing clip.

On the receiving actor's existing **Sources** page:

1. Turn Source Weaving on and select Rhythm Source and Rhythm Clip.
2. Turn **knob 7, Rhythm Lane**, from **All** to **Kick 36**, **Snare 38**, or
   another lane. Common drum assignments appear first; every note from 0 to 127
   is available for custom kits. The labels are conventional assignments, not
   detection of the sound loaded into a pad.
3. Keep Pitch Source on Own to retain the actor's own pitches. Expression Source
   and Clip are together on the existing **Source Expression** page; their
   duplicate shortcuts were removed from the Sources page to make room.

The same parameter and native state are used by Move, Remote UI and the browser.
The source overview adds the selected note number to its rhythm readout. All is
the default, including for existing sets and older route messages.

Only accepted matching onsets advance the receiver's pitch sequence. Skipped
probability/conditional hits, zero-velocity notes, suppressed notes and other
lanes are rests. Simultaneous matching notes produce one attack with their longest
gate; an unrelated longer snare cannot extend a kick-only note. Live filter edits
preserve sounding releases and continue the pitch sequence on the next match.
Swing, clip speed, pressure and stop/mute cleanup retain their existing owners.

The filter matches the raw source note number, before pitch mapping or transpose.
It also works on the recorded generator rhythm sources introduced previously.
It does not analyze outgoing MIDI or make temporary drum-fill gestures into new
source events. Generated receivers and free generator auditions retain their
previous source limitations; this change adds neither follow strength nor fills.
Recording a receiver still uses its Own material rather than flattening weaving.

Implementation retains per-note gate durations in one bounded, stack-resident
attack summary, created only when a source note is accepted. It is discarded at
the end of that clip tick. There is no heap allocation for the summary, retained
event cache, extra clock, source rescan or additional generator evaluation.
The new optional route field persists through Set save/load and Undo; invalid
values reject the complete edit, and default All keeps the older serialized form.

Regression checks cover mixed-lane selection, simultaneous gate lengths, live
changes, probability/suppression, raw-note boundaries, opposite clip speeds,
swing, generated sources, two receivers, reload/Undo, block sizes, Record and
source loss. Shared-controller tests exercise the actual knob mapping and legacy
readback. The production Movy → Schwung → HB harness verifies All/Kick/Snare with
the receiver's own pitches and velocity, audible PCM and balanced releases.
