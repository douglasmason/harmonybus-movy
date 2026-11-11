# Precise cloud X/Y and MPE input

Movy hbclean.340 preserves 14-bit X/Y for each Remote UI touch. The same contact
path drives the follower cloud in native Move's Tool Remote UI and standalone.
Strokes, captured Hold emitters, recorded clips and recipes retain the finer
coordinates. Legacy clips and hardware gestures retain their existing musical
results. Cloud generation still produces harmony-aware, quantized notes.

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
