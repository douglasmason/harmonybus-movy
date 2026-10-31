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

The footer shows Fill, Ready, Hold, or Loop status and brackets the current
chord. Loop uses an explicit position and total, such as `Loop 1/4 [C] G F D`:
the stopped first-chord preview is included in the four. Longer progressions
retain the same status prefix and show neighbors of the current chord. The
queue footer owns its display band; the generic clip strip, performance footer,
and enqueue count toasts do not overwrite it. All members of a repeating loop
pulse on their knobs and steps, including chords already played this pass.
Hold mode pulses only future queued choices. Sounding harmony retains its white selection color. The
shared harmony footer supplies chord names beside ordinary Roman numerals;
explicit secondary intent retains its target relationship. Live motif headers
also retain this harmony footer. Preview/editor-specific instructions remain
local to their respective views.

Harmony Off clears the live chord and the entire queue; it does not rewind or
restart the existing progression. During playback it hands authority back to the
conductor clip. Both playing and stopped, it leaves Queued mode selected and
ready to fill a new progression.
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

The timing review gives an already due chord priority over recovery of a cleared
old voice. Current-harmony reads no longer scan all retained history; delayed
lookahead still searches the historical events. Regression coverage includes
2,048 exact core changes, history rollover and voice loss at a due boundary,
plus 128 bars through the production Movy/Schwung/HarmonyBus chain. These tests
do not reproduce or establish a fix for intermittent physical-device lag and
crackles after the first few loops.
