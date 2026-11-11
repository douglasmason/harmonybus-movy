# Global Transpose — HarmonyBus 0.2.317 / Movy hbclean.342

Assign **Global Transpose** to an operation slot. Its **Global Shift (semitones)**
sets the destination from -24 to +24 (default +12). Positive values scoop up;
negative values dip down. Auto defaults to Off. The existing **Transpose**
operation remains track-local.

On **Approach Pressure**, assign that slot to a row and select Momentary,
Tap Latch or Peak Latch. Pressure moves from zero toward the configured shift in
semitone steps, with a small dead band to resist jitter. Reverse starts at the
configured shift and returns toward zero as pressure rises. Peak Latch retains
the peak; a new squeeze can replace it with a lower level, and a light tap clears
it. The pressure readout shows the resulting global semitone offset.

Knob touches, operation steps and Launchpad operation buttons use their existing
hold/latch gestures. The shared operation editor supplies native Move, Remote UI
and standalone controls. Launchpad X supplies pressure; Mini can trigger the
prepared amount through operation buttons. This operation uses Z/pressure only;
the existing Remote UI X/Y cloud controls remain independent.

The offset applies at the final HB MIDI output, after harmony, chord voicing,
local operations and rhythmic processing. It moves Conductor and Follower
outputs together, including held notes and subsequent repeats. All disappearing
notes receive OFF before new pitches receive ON; common tones stay sounding.
Small MIDI buffers resume the pending change without losing releases. Pitches
outside 0–127 remain silent until they return into range. Off/bypassed tracks
(including the usual drum setup) are unaffected; MIDI channel 10 alone does not
mark a track as drums.

Shared assignments do not multiply the shift by the number of tracks. Within a
slot, explicit pressure/hold/sequence owners override automatic owners; the
largest absolute active value wins, with instance order breaking equal ties.
Separate operation slots add, with the final offset limited to ±24. Releasing
one controller leaves any other active owner in control. Automatic patterns and
Field amount mapping use the existing operation evaluator and clock.

This is an output performance offset: the saved global transpose, inferred key,
source clips and harmonic labels retain their underlying values. Stop, role
changes, state restore and controller teardown release runtime ownership. Editing
the older global transpose setting retains its existing behavior of clearing
sounding notes and performance gestures. Slot assignments and pressure settings
save normally; live pressure latches do not revive on reload. Operation-step gates
can replay through the existing sequence mask. Per-note action capture does not
bake the shared shift into every track, and pressure envelopes are not recorded
as a new global automation lane.

The output is stepped MIDI notes, not continuous pitch bend/MPE glide. Automated
coverage includes real HB held voices, cross-track ownership, pressure/latch/reverse,
shared metadata, pitch limits, one-message buffers, Stop and saved-state restore.
Physical Move and Launchpad performance feel still needs device play.
