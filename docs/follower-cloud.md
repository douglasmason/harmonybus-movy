# Follower cloud

Cloud is a spatial source in the existing actor generator. Comp, Bass and Melody
use the same conductor-aware note mapping, clock, Record, automation, Undo,
saved recipe and Bake paths as the other follower sources. There is no separate
arpeggiator transport or browser-only musical implementation.

Cloud exploration temporarily makes its destination a Follower, preserving
Relative or Closest Split mapping and otherwise using Relative. Ending
exploration restores the destination's prior settings. Recorded cloud recipes
retain this mapping so a fresh Melody track works without a setup detour.

## Play

In Chord Play, open Libraries → the actor's Browse page and select **Cloud**.
The Generator page exposes eight knobs, in order: **Rate, Density, Length,
Register, Spread, Contour, Variation, Dynamics**. The adjacent **Cloud X / Y**
page assigns knob 1 to X, knob 2 to Y, knob 3 to **Axes**, and knob 4 to
**Bounded / Wrap**. Knobs 5–8 are Activity, Seed, Bake and Restore. **Activity**
selects Probability or Rate; Loop still starts/stops Explore. Turning
either coordinate draws; after 300 ms without movement the cursor releases and
its cloud continues to decay. Wrapping preserves overshoot at both edges.

On either Cloud page the Move pads become an 8×4 contact field. A connected
Launchpad uses its 8×8 field. Multiple held pads deposit independent contacts;
the ordinary keyboard route is suspended while the field owns the pads.
Loop starts/stops exploration and Delete clears the live field. Leaving the
page, changing tracks or resetting inputs releases owned contacts.

The standalone workspace adds a **Follower cloud** component (also reachable
with `/move/?view=cloud`). The same touchscreen component ships as Movy's
**Tool** page in Schwung Remote UI. Select an actor, choose Cloud, then use Play
and drag one or more fingers. Both pages share controls, rendering and gesture
cleanup. The browser workspace's physical Move connection remains a hardware
mirror; use the native Tool page for the physical device's semantic cloud editor.

From hbclean.329, the shared web controls show Playing/Stopped, recording state
and the take's track and clip. Record changes to **Cancel count-in**, **Cancel
recording** while armed, or **Stop recording** when capturing. These indicators
follow the existing engine/controller state; clicking does not invent a success
state. Ending a take leaves playback running. Stop ends the transport.

Browsing another actor keeps the original recording destination visible. The
Record button can finish or cancel that take even when the browsed actor is not
using Cloud, without starting the browsed actor's generator. The native generator
footer also identifies count-in. Both paths retain the ordinary Record button's
single Undo pass. Bake is unavailable while a take is armed or recording.

The Axes selector switches between **X Activity / Y Pitch** and
**X Pitch / Y Activity**, with the web labels naming the selected activity.
The second orientation gives Move eight horizontal pitch positions and four
activity positions. The same reversible projection
maps pads, touchscreen and X/Y knobs into the musical source, then projects its
cloud back onto each display. Flipping releases held inputs and rotates the
view; it never changes the pitches or timing of an already recorded gesture.
Orientation, Activity and bounded/wrap preferences are saved with the Set/browser session.

In **Probability**, the activity coordinate changes the chance of a grain at
the Rate knob's subdivision. In **Rate**, it selects a clocked subdivision from
half notes through the fastest subdivision allowed by the Rate knob, including
dotted subdivisions. Density and trail decay still affect how many grains occur;
the coordinate does not guarantee a note on every possible trigger.

Each deposited point retains its own activity behavior. Changing Activity
releases held input and affects new strokes; existing trails and recorded clips
keep their original meaning. Probability and Rate strokes can coexist in a
recording or saved recipe without adding another automation lane.

These axes describe
the musical source; they do not send global pan CCs that could disturb other
notes on the same MIDI channel. Direct contacts are green; fresh consequences
are cyan and older trails blue. The Move display uses crosses and dots on its
monochrome screen. Existing trail curve, strength and brightness settings govern
cloud rendering on every surface; its spatial history has a four-beat lifetime.

## Record and reuse

Explore and drawing alone do not edit the Set. Ordinary **Record** captures the
spatial samples and eight control lanes into the follower's recipe clip. Short
taps between sixteenth boundaries are retained. Recorded clips can be previewed
and overdubbed using the existing controls. An overdub retains gesture history
before the new touch, then records the replacement field through the rest of the
take, including its release. Undo restores the prior recipe.

From hbclean.326, a quick drag or X/Y turn leaves deposits along its path between
received positions, including the final pending touchscreen movement before
release. Each contact keeps a short polyline so turns can survive between clock
samples. Fingers, separate pad contacts, released gestures and knob wraparound
crossings never join into an unintended line across the field. Stationary holds
still deposit once per sixteenth. This uses the existing point format and eight
control lanes; previously recorded gestures keep their behavior.

Sampling stays bounded at 16 deposits per sixteenth and 256 live deposits over
four beats. Each pending path retains at most eight vertices. Held endpoints
have priority; remaining deposits are shared among paths. Dense simultaneous
input therefore coarsens the trails rather than increasing engine work without
limit. The touchscreen continues batching moves every 50 ms; this is a musical
path sampler, not a recording of every raw touch event.

Seed is fixed during a take and for recorded recipes. Replay, reload and Bake
use the same seed, gesture history and automation. Bake retains abstract mapped
notes, so later conductor changes still apply. Existing saved part recipes also
carry cloud gestures; Melody recipes use the shared non-Bass library with actor
metadata retained. Existing part export size limits still apply and oversized
exports are refused explicitly.

Cloud recording needs eight available or matching generator lanes. It refuses
to overwrite instrument automation or lanes belonging to another recipe. Live
play supports up to 16 simultaneous contacts across surfaces, four grains per
sixteenth (one for Bass), and a bounded four-beat history. Rates are clocked from
half notes through sixteenths, including dotted subdivisions. This is MIDI note
generation, not audio sample granulation. Pitch pairs with probability or trigger
rate, in either orientation; the Rate knob remains the fastest allowed subdivision.

## Integration contract

- `gcloud track id x y pressure [activity]` uses 0–127 coordinates; pressure zero releases.
  Optional activity is 0 for Probability (also the legacy default) or 1 for Rate.
  IDs 0–31 belong to Move, 32–95 to Launchpad, 96–111 to the touchscreen and 112
  to X/Y drawing. Contact heartbeats stop stale input after two seconds, including
  while transport is stopped. One touchscreen controller owns that ID range.
- `cf1` and `cp1` records extend the existing `movy1` Set. Old Sets still load.
  Rate points append `,1` to the existing four-field point; legacy points retain
  their original serialization and behavior. A rate clip needs hbclean.324 or newer.
  Gesture samples and control locks are the reusable source, not screen pixels.
- `cloud_view[_track]` is a passive bounded snapshot of contacts, trails and
  accepted grain attacks. Rendering never advances the music or rerolls a seed.
- Schwung Tool discovery uses `module_id=movy`. `state` now returns a small flat
  JSON remote snapshot containing `cloud_ui_state` and `cloud_view`. Raw Set
  observations use **`persistent_state`**; `save_state` remains the autosave
  acknowledgement, and loading still uses `set_param("state", movy1_text)`.
  Observing either snapshot cannot clear pending autosave.
- `cloud_action` is a bounded queue consumed by the production UI controller.
  Record re-enters the normal recording/Undo path. Snapshot readers activate a
  short observation lease; the host's unconditional `rui_poll` probe does not
  itself wake the remote UI. Live views push at roughly 10 Hz on Move.

Validation covers exact gesture/control replay and Bake, partial gesture
overdub, malformed/bounded input, contact expiry while stopped, ordinary recipe
regressions, real HB harmony changes for all three actors, native pad/encoder
ownership and real browser multitouch/cancellation. Physical touch feel and
device performance still need an on-Move playing session.
