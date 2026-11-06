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
**Bounded / Wrap**. Knobs 5–8 are Explore, Seed, Bake and Restore. Turning
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

The Axes selector switches between **X Probability / Y Pitch** and
**X Pitch / Y Probability**. The second orientation gives Move eight horizontal
pitch positions and four probability positions. The same reversible projection
maps pads, touchscreen and X/Y knobs into the musical source, then projects its
cloud back onto each display. Flipping releases held inputs and rotates the
view; it never changes the pitches or timing of an already recorded gesture.
Orientation and bounded/wrap preferences are saved with the Set/browser session.

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
generation, not audio sample granulation. The current axis pair is pitch and
probability, in either orientation; Rate remains a separate generator control.

## Integration contract

- `gcloud track id x y pressure` uses 0–127 coordinates; pressure zero releases.
  IDs 0–31 belong to Move, 32–95 to Launchpad, 96–111 to the touchscreen and 112
  to X/Y drawing. Contact heartbeats stop stale input after two seconds, including
  while transport is stopped. One touchscreen controller owns that ID range.
- `cf1` and `cp1` records extend the existing `movy1` Set. Old Sets still load.
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
