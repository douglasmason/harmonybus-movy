# Precise cloud X/Y and MPE input

Movy hbclean.340 preserves 14-bit X/Y for each Remote UI touch. The same contact
path drives the follower cloud in native Move's Tool Remote UI and standalone.
Strokes, captured Hold emitters, recorded clips and recipes retain the finer
coordinates. Legacy clips and hardware gestures retain their existing musical
results. Cloud generation still produces harmony-aware, quantized notes.

## Precise knob drawing and pressure (hbclean.344)

On **Cloud X / Y**, K1/K2 draw X/Y. Ordinary turns move 129 units on the
14-bit field; **Shift + turn** moves one unit. The existing 0–127 control range
is retained, with fractional coordinates in fine mode. **K6 Draw Pressure**
replaces Seed on this page; Seed remains available in the cloud web editor.

Remote UI and standalone share **Drawing precision → Coarse / Fine** and
**Draw pressure**. Shift-click or Shift-wheel temporarily chooses fine drawing.
The pressure control changes the current knob stroke, and supplies Z for the
next stroke. It never starts a stroke by itself. Idle knob contacts release after
300 ms, flushing the last pressure change before release.

X/Y use the same 14-bit contact protocol as fingers and MPE. Bounded stops at
an edge; Wrap crosses the complete 14-bit field and ends the old segment first,
so the cloud does not draw a line across the opposite edges. Axes can still be
swapped. Fine positions and drawing pressure flow through existing Hold,
recording, saved strokes, replay and Bake; the renderer has no separate knob path.

Cloud Z scales generated note velocity with the existing Dynamics control.
Move/Launchpad aftertouch and touchscreen/MPE pressure retain their own per-contact
values: Draw Pressure only controls the knob cursor. Pressure returning to zero
while a pad remains held still does not release it. An iPad without measured
force has precise X/Y but no invented force sensing.

This complements the shared [pressure operation mappings](pressure-performance.md),
[repeat](pressure-repeat.md) and [Chord Spread](chord-spread.md); those assignments
and latch modes are unchanged. This change does not map cloud Z to arbitrary
synth parameters or add MPE pitch output. Drawing pressure settings persist;
live cursor contacts do not restart when restoring a set.

## Touch and playing pads

Open **Follower generators → Cloud**, choose an actor and Cloud, then draw.
Every finger owns its X/Y and pressure until its release or cancellation. The
browser's **Playing pads & steps** surface also accepts continuous pad dragging
while this Cloud editor is open. A gesture retains its original actor, activity
and bounds; moving onto another pad does not retrigger it. Keyboard activation
and ordinary pad behavior remain available through their existing paths.

Touch pressure is used when supplied by the device/browser. A mouse uses fixed
pressure. A held pen with zero force stays a softly held contact; only up/cancel
releases it. The interface does not assume that an iPhone/iPad screen measures
force merely because it supplies precise X/Y.

**Move and Launchpad X:** pad positions supply X/Y and aftertouch supplies Z.
**Launchpad Mini:** positions and presses remain usable without pressure.
The hardware cannot report within-pad X/Y. Shared cloud trails still spread over
neighboring LEDs. No hardware firmware change is required.

## MPE controller input

In a browser exposing Web MIDI, press **Connect MPE input** and choose the
controller's input. The adapter supports the **lower MPE zone**: MIDI channel 1
is the manager and channels 2–16 own contacts. X is note pitch plus member and
manager pitch bend over MIDI's 0–127 note range; Y is CC74 slide; Z is channel
pressure. Choose **X Pitch · Y Activity** when that axis mapping suits playing.

The default bend ranges are ±48 semitones for members and ±2 for the manager.
RPN 0 updates bend sensitivity, including cents; RPN 6 updates the lower-zone
size. Stop/Clear release contacts while retaining controller configuration.
Disconnecting or changing the MIDI input releases voices and resets that state.
The upper zone and sustain-pedal interpretation are not implemented here; use
Cloud Hold for a captured field. MPE 1.0 slide and pressure remain 7-bit at the
MIDI input, while pitch bend retains its 14-bit low byte.

Web MIDI availability depends on the browser and secure-context permissions.
Touchscreen X/Y works independently of it. This adapter is **MPE input to the
cloud**, not MPE note output or continuous pitch glide from the cloud renderer.

## Ownership, compatibility and limits

The existing sixteen-contact and sixteen-deposit-per-step limits remain. Motion
and heartbeats only update existing contacts, so stale packets cannot undo Stop,
Clear, cancellation or expiry. Direct touches remain green; cloud consequences
use the existing cyan/blue trails. The existing sampler, clip store and bounded
polyline cache are reused.

Cloud state advertises `xyBits:14`; new clients use `touch14`/`move14`. Legacy clients keep
the 7-bit commands. Saved points use a trailing `14` marker when needed; old
point encodings still load. Read-only snapshots use `cf2` for fine coordinates
and `cf1` when all coordinates have an exact legacy representation. Rollback to
an older build cannot interpret newly recorded fine-coordinate points.

The release tests compare legacy snapshots and seeded notes, and exercise fine
coordinates through recording, saved sets, recipes and Bake. It establishes the
shared expressive input path for subsequent sequence-position drivers. LFO and
Perlin playhead drivers, and continuous/MPE pitch output, remain separate work.
