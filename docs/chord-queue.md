# Queued Chord Play: timing, depth, Hold / Loop

Install HarmonyBus 0.2.297 with Movy 0.34.1-hbclean.256.

The first Chord Play panel contains Mode, Queue Time, Anticipation, Queue End,
Next, Queue Status, Queue Depth, and Range / Tap Off. Queue controls target the
conductor even while the pads play a different track. The panel count stays at
eight. Left/Right arrows navigate the same panels as the jog dial; extended
lists retain their bounded navigation and Left-at-first-item return behavior.

Queue Depth is 1–16 (default 2), with an additional Touch Phrase choice. It is the number of choices required to start
or refill, not a limit of two future chords. A partial initial batch waits.
When filled while stopped, its first chord sounds and Play starts progression.
When filled during playback, progression begins at the next Queue Time boundary,
including Anticipation. Observed timing uses learned clip changes and otherwise
falls back to a bar. Changing timing reschedules future entries without changing
the current chord.

Touch Phrase reuses the motif entry touch-sequence helper. Keep one knob or
step held while touching the next; releasing the last held control commits the
batch. A single touch/release commits one chord. Fixed depths continue to accept
ordinary sequential touches without overlap.

Queue End has two choices:

- Hold consumes the queue, holds its last chord, and waits for Queue Depth new
  choices before resuming. Transport and the other tracks continue.
- Loop repeats the queued progression. Additional choices join its end, up to
  sixteen chords. Changing to Hold lets the pending sequence finish; changing
  back to Loop resumes the retained progression at the next boundary.

The footer shows the next chord and Fill, Ready, Hold, or Loop status. Queued
choices pulse on their knob and step LEDs, using the existing bank snapshot and
hardware animation. Sounding harmony retains its white selection color. The
shared harmony footer supplies chord names beside ordinary Roman numerals;
explicit secondary intent retains its target relationship. Live motif headers
also retain this harmony footer. Preview/editor-specific instructions remain
local to their respective views.

Harmony Off clears live choices. During playback it hands authority back to the
conductor clip and leaves Queued mode ready for another progression. While
stopped it also switches the visible mode to Immediate and shows Queue Off.
Stop, changing conductor, or loading a Set clears the transient queue. Queue
Depth and Queue End persist in the conductor's native state; queued notes do not.

Lookahead, pad prediction and motif destinations share the scheduled queue.
Partial refills are not advertised as scheduled future harmony. Recording writes
actual chord activations into the conductor's playing clip, never enqueue
choices early. Looped activations use the same input and recording path.

Turning a chord-bank knob changes that chord's register in octaves (−3 to +3).
Turning knob 8 changes the default on the track supplying the chord sound.
Shift-tap a chord knob to inherit the default; Shift-tap knob 8 resets its default
(the comping track resumes conductor inheritance). A normal knob-8 tap applies
Harmony Off on release; any turn suppresses Off. Range edits update held and
queued choices in place without enqueueing an extra attack. Per-chord overrides
travel with recorded harmony and take priority over track defaults.

The first Settings category, Sound, exposes the chord/arp controls and labels
its owner as Cond or Comp with the track number. It follows actual direct-output
routing. Harmony identity, key/scale relationships, and chord-change timing stay
with the conductor; additional attacks, gaps and playing style belong to the
renderer. The conductor's timing is a fallback for comping, not an instruction
to copy every comping attack back into the harmony progression. Raw melodic
input is not transposed by the chord range control.

Left/Right lights follow the current Chord Play panel/list bounds. Grid uses the
same bounds for its arrows and lights: Left/Right for time, +/− for rows. Other
views retain their bar, step-record, octave and group actions, with octave/group
lights dark at their limits.

Validation includes native queue and lifecycle regression tests, controller
knob routing/navigation/LED tests, shared footer tests, production QuickJS
startup, full-chain audio/recording checks, and CI builds. Physical Move
verification remains pending.
