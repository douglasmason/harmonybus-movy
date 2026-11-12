# Precise cloud X/Y and MPE input

Movy hbclean.340 preserves 14-bit X/Y for each Remote UI touch. The same contact
path drives the follower cloud in native Move's Tool Remote UI and standalone.
Strokes, captured Hold emitters, recorded clips and recipes retain the finer
coordinates. Legacy clips and hardware gestures retain their existing musical
results. Cloud generation still produces harmony-aware, quantized notes.

## Precise knob drawing and pressure (hbclean.345)

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

Cloud Z defaults to scaling generated note velocity with the existing Dynamics control.
The Pressure Target control below can instead shape Length or Spread.
Move/Launchpad aftertouch and touchscreen/MPE pressure retain their own per-contact
values: Draw Pressure only controls the knob cursor. Pressure returning to zero
while a pad remains held still does not release it. An iPad without measured
force has precise X/Y but no invented force sensing.

This complements the shared [pressure operation mappings](pressure-performance.md),
[repeat](pressure-repeat.md) and [Chord Spread](chord-spread.md); those assignments
and latch modes are unchanged. This change does not map cloud Z to arbitrary
synth parameters or add MPE pitch output. Drawing pressure settings persist;
live cursor contacts do not restart when restoring a set.

## Pressure response (hbclean.347)

Open **Cloud Pressure** on Move, or **Input pressure response** in the shared
Remote UI/standalone cloud editor. These are shared cloud input settings, applied
to Move/Launchpad aftertouch, per-finger touch and MPE pressure, and knob Draw
Pressure before a deposit reaches the existing engine:

- **Linear** is the default 1:1 response; existing sets keep their behavior.
- **Soft** reaches stronger output with a lighter squeeze.
- **Firm** gives more room at the quiet end before approaching maximum pressure.
- **Reverse** reverses the selected curve while a contact is held.
- **Low / High** bound the mapped output from 1 to 127. Low cannot exceed High;
  equal limits give a fixed pressure while retaining normal release behavior.

From hbclean.349, the page uses K1 Draw Pressure, K2 Target, K3 Response,
K4 Direction, K5 Low, K6 High, K7 Axes and K8 Activity. Edges remains on Cloud X / Y. X/Y drawing remains on the Cloud X / Y page.
These response settings save with the other cloud surface settings. They are
shared across follower actors, not per-track automation lanes.

Changing response refreshes held pad/knob input on the next UI tick; Remote UI
contacts refresh on their existing heartbeat. It shapes future deposits only.
Existing trails, captured Hold emitters and recorded strokes retain their mapped
values, so recording/replay/Bake need no new format and cannot apply the curve
a second time. Hold flushes current input before capture, including a response
change made just before pressing Hold.

Zero aftertouch is still a softly held contact, and Reverse never converts a
note-off into a new press. By default these controls shape velocity through Dynamics; they do not replace Approach Pressure operation
assignments or add arbitrary synth-parameter pressure routing.

## Pressure targets (hbclean.349)

Choose **Target** on Cloud Pressure or **Cloud pressure target** in the shared
Remote UI/standalone editor. The same selection applies to Move/Launchpad input,
per-finger touch, MPE and the drawing knobs. Response, Reverse and Low/High shape
pressure before it reaches the selected destination.

| Target | Light pressure | Full pressure |
| --- | --- | --- |
| Velocity (default) | Softer notes | Existing Dynamics level |
| Length | Short notes (minimum 3 ticks) | Existing Length setting |
| Spread | Notes near the field's harmonic height | Existing pitch Spread |

Length and Spread retain the Dynamics velocity and existing trail decay. Spread
scales the seeded pitch scatter; Variation must be above zero for that scatter
to be audible. Pitch remains harmony-aware. Trigger rate and probability stay
on the activity axis. For an expanding cloud, choose Spread and turn up both
Spread and Variation; Reverse contracts the pitch range as you squeeze.

Targets are attached to deposits, including fine-coordinate points. Switching
while holding a gesture starts a new segment with the new interpretation; it
does not connect unrelated segments or reinterpret earlier trails, Hold emitters,
recorded clips or saved recipes. Hold, Record, replay and Bake reuse the same
renderer. Surface preferences save with the set and default to Velocity when
loading older settings. Existing Velocity clips keep their original encoding
and seeded output. New Length/Spread points add an explicit target after the
14-bit marker; builds before hbclean.349 cannot load those new point records.

## Rhythmic pressure targets (hbclean.351)

**Probability** and **Rate** join the same Pressure Target selector on Move and
in the Remote UI/standalone cloud editor. Move/Launchpad aftertouch, per-finger
and MPE pressure, and the knob cursor's Draw Pressure use the existing response
curves, Reverse and Low/High bounds. No additional page or automation lane is
needed. Hardware without measured force can use Draw Pressure.

| Target | Light pressure | Full pressure |
| --- | --- | --- |
| Probability | Sparse grains from the existing pattern | All otherwise eligible grains |
| Rate | Half-note subdivision | Fastest subdivision allowed by Rate and the activity axis |

Probability adds a seeded gate after the existing Density, activity-axis and
age gates. For a given candidate grain, stronger pressure retains any gate opened by
lighter pressure. Surviving grains keep their velocity, length and pitch;
Dynamics still sets velocity. Density zero remains silent.

Rate selects the existing half-note, dotted-quarter, quarter-note, dotted-eighth,
eighth-note and sixteenth-note subdivisions. The Rate knob sets the ceiling;
when the activity axis is also Rate, that coordinate can lower the ceiling
further. The Probability activity axis retains its independent chance control.
Pressure changes remain aligned to the shared clock and do not immediately
retrigger a held note or create another transport. Dotted subdivisions retain
their own grid positions even when the ceiling uses another subdivision.

Try **Target: Rate**, a fast Rate ceiling, and a light-to-firm squeeze for an
accelerating cloud. Choose **Target: Probability** to bring a sparse cloud up
to its existing density without also making notes louder. Reverse reverses either
relationship. Touchscreens without force sensing retain precise X/Y; Draw
Pressure remains available for their knob strokes.

Each deposit retains its rhythmic target and mapped pressure through Hold,
recording, saved sets/recipes, replay and Bake. New targets affect new deposits;
existing trails can continue their previous rhythm while they decay. Velocity,
Length and Spread keep their existing output and storage. Newly saved Probability
and Rate records require hbclean.351 or later. The web editor advertises supported
targets and disables these choices when connected to an older host.

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
