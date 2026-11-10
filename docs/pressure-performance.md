# Pressure performance — Movy hbclean.337 / HarmonyBus 0.2.314

This release adds opt-in pressure control to approach layouts and pressure editing
of existing Grid Sequencer notes. All existing sets start with pressure modes Off.
The implementation shares the native engine, Move screen, Remote UI and standalone
controller. Move and Launchpad X provide polyphonic pressure; a mouse click,
Launchpad Mini button or knob touch alone cannot provide a continuous Z value.

## Approach rows

In Normal Play or Motif Play, open Operation Settings → Approach Pressure.
Choose Row 1, Row 2, Row 3 (triple approach) or Single (single approach), then an
operation slot 1–16. Slot 0 disconnects pressure. Selecting a row or slot also
focuses that slot in the existing operation editor, where Operation and Amount
remain editable. The pressure page owns only the row assignment and gesture
settings. Rows keep their existing note/approach meanings;
pressure adds an amount control affecting subsequent operation evaluation.

| Mode | Press and release |
| --- | --- |
| Momentary | Pressure follows the squeeze; release removes the pressure override. |
| Tap Latch | A light tap latches Tap amount %. A squeeze varies it while held and returns to the latched amount on release. Another light tap turns it off. |
| Peak Latch | Each new press starts at zero and retains that press's highest pressure, including after release. A new squeeze can set a lower peak. A light tap turns it off. |

Reverse maps the active signal to `1 − pressure`. Thus Reverse Peak Latch starts
at maximum and retains the lowest output reached. Off remains off in either
direction. A tap is shorter than the existing hold threshold and does not reach
8/127 pressure. Note velocity does not substitute for pressure. Pressure returning
to zero is not a release; only the note-off ends the contact.

Supported amount operations are Velocity, Gate, Pan, Transpose, Ratchet and Echo.
The operation's Amount is the full-pressure endpoint. The low endpoint is zero,
except Gate starts at 100% and Ratchet at one repeat. Existing Field Amount bounds,
if configured for that slot, supply both endpoints. Zero active signal suppresses
the performed operation. Transpose and repeat counts remain discrete, and velocity
affects new attacks, not the loudness of a note already sounding. Categorical
harmony operations show “Choose amount op” and are not swept.

Several pads in one row contribute their maximum pressure. The last pressed row
wins if two rows target the same slot; ending it exposes the other row's active
value. A configured pressure assignment owns its aftertouch, preventing the same
squeeze from separately changing arp velocity. Notes and note-offs keep their
normal ownership. Stop, state restore and pressure-assignment changes clear live
contacts/latches. Settings persist; live held pressure does not restart on reload.

## Shape several grid steps

Open Grid Sequencer's Grid Window settings. K5 selects **Shift + pressure**:
Off, Velocity, Chance or Length. K6 chooses Normal or Reverse. Hold Shift and
press existing note cells, then vary pressure. Launchpad uses its existing grid
modifier. Each pad keeps its peak during that press so easing off cannot erase the
edit. Reverse keeps the minimum. A fresh press can set a lower Normal value.

You can hold several cells and shape them independently; overlapping contacts
form one Undo gesture. Changes are coalesced once per UI tick. Empty cells stay
empty, operation gates and rendered notes remain unchanged, and clip navigation
cannot redirect a held edit into another clip. Chance preserves existing trigger
conditions. Velocity has a minimum of 1; Length has a minimum of one tick and is
bounded by the cell duration, next same-pitch onset and clip end.

The existing step editor remains available when pressure is Off, and remains the
way to set exact values using a knob or a surface without pressure.

## Ableton reference and next work

The [Live 13 / Push walkthrough](https://youtu.be/FTC9MyRjCVs?t=1802) discusses
multi-step editing at 30:02. Ableton's
[Push 13 beta notes](https://www.ableton.com/en/release-notes/push-13-beta/)
describe expressive editing and per-row Steps, Rate, Direction and Swing.
Pressure editing fits our current clip store and Undo system directly. Independent
row timing would change playback and clip semantics, so it is a separate extension,
not an implied feature of this release.

Continuous synth-parameter mapping (filter, grain position/density, wet/dry),
recorded pressure envelopes and pressure-weighted legato pitch output remain future
work. Pitch interpolation needs a compatible bend/per-note-pitch destination;
stock Move's documented MIDI support does not supply pitch bend/MPE. This release
does not emulate a glide with retriggered chromatic notes.

Automated engine, MIDI, browser-controller and build checks cover this release.
Pressure feel, pad calibration and physical-device audio still need on-device play.
