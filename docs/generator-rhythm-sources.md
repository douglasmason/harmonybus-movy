# Generated rhythm in Source Weaving

Recorded Comp and Bass recipes can now supply rhythm without Bake. On the
receiving actor's existing Source Weaving panel, enable Source Weaving, choose
the generator's track under Rhythm Source and its playing slot under Rhythm Clip.
Leave Pitch Source and Expression Source at Own to keep the receiving clip's
musical material. Both source and destination clips must be playing and unmuted.
The [Rhythm Lane filter](rhythm-source-lanes.md) can select one raw source note;
leave it at All to follow the complete generated rhythm.

This also follows temporary previews of a recorded recipe's Complexity and Style,
with the existing step/bar acceptance boundaries. Changing the donor's intensity
does not replace the receiver's expression. No new mode, knob mapping, stored
field or controller-specific command is introduced; the same source controls
serve Move, Remote UI and the browser.

The donated rhythm is the recipe's accepted abstract attack pattern, at its
swung clip-clock positions. The generator makes each density/seed decision once.
Coincident generated and authored attacks form one rhythm event with their
longest source gate. The existing donor clock owns the receiving gates, including
when the two clips have different playback speeds. Source routes do not recurse.

As with ordinary raw-note donors, this is source rhythm, not a transcription of
rendered MIDI: donor-specific variation, section shaping, chord/arp expansion,
recipe gate scaling and Bass's monophonic note cutoff do not become the receiving
actor's performance settings. Its own rendering and expression still apply.

The scope is deliberately the existing clip contract:

* A recorded recipe or its live preview can donate; free Explore and an in-progress
  first take do not impersonate a selected clip. Finish the take to use it as a
  rhythm source. Saved-library auditions become donors once recorded to a clip.
* Recorded Comp/Bass/Euclidean receivers can now borrow these attacks through
  [generated rhythm following](generated-rhythm-receivers.md). Cloud and free
  exploration retain their own timing; no automatic rhythmic affinity is inferred.
* Generated pitch and expression donation still require Bake. Rhythm donation
  does not silently materialize or modify the donor recipe.
* Recording on the receiver retains the established Own-material behavior. It
  does not capture a flattened copy of the woven performance.
* A muted, stopped or unavailable donor cannot generate new borrowed attacks;
  existing gate cleanup handles release ownership.

The implementation returns an optional source duration from the existing
generator tick and merges it into the ordinary clip's source-attack dispatch.
There is no second scheduler, random draw, generator evaluation, event cache or
per-tick source scan. Ordinary source emission still uses its established note
and gate handling; this is not a claim that that entire path is allocation-free.

Regression coverage includes all sixteen styles, both track orders, opposite
playback speeds, swing, simultaneous manual notes, unchanged source-evaluation
counts, live previews, reload/Undo, block sizes, partial-take silence, cyclic
routes, mute/stop, Record ownership and free-audition exclusion. The production
Movy → Schwung chain → HB harness checks unbaked Comp/Bass donors, destination
pitches/velocity, audible PCM and balanced MIDI releases.
