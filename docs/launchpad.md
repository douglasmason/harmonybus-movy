# Launchpad input surface

Select **Launchpad → LEGACY** for the original Launchpad, or **X** for Launchpad X, in Movy's release settings. The default is OFF. This setting claims the external USB MIDI channel 1 while Movy is active. Only these two protocols are implemented; Launchpad MK2, Mini and Akai APC controllers are not profiles for this build.

Use a dedicated USB connection. Turn Move's native MIDI input off and keep Schwung's independent chain slots from receiving this controller's channel 1 (including Receive All / THRU). The host's channel-block API suppresses native note-ons but does not suppress independent slot routing or raw pressure/CC. THRU bypasses that block. These settings prevent a second raw-note path alongside the mapped input.

The 8×8 grid follows Movy's input mode, layout, root and octave on the selected track. Its bottom four rows match Move's grid; the upper four extend the same layout. Triple Approach adds a second target row and its three approach rows. The grid continues playing while Move shows clips.

| Control | Behavior |
| --- | --- |
| Eight top buttons | Touch/release the corresponding HarmonyBus operation knobs on the retained HB page |
| Topmost right-side button | Hold as the permanent-latch modifier; its LED lights while held |
| Modifier + top button | Toggle the corresponding operation's permanent latch |
| Other right-side buttons | Unassigned |
| Move Copy tap | Existing Steps → Perform 1 → Perform 2 cycle; top assignments follow the new HB page |

Copy retains its existing edit guards and clip-copy behavior in Session mode. A held top button releases its original operation after a page, track or performance-mode change. Ordinary parameter knobs without a musical touch operation have no external action. In Single/Triple Approach layouts, bank touches select/compose rows and their latch modifier is inactive, matching the knobs.

The top LEDs use the actual knob painter's colors and state rules. Launchpad X interpolates the same pulse endpoints in RGB; the original Launchpad uses its red/green brightness levels and stepped pulses. Pulse meaning matches Move, but the two devices' animation phase is not guaranteed to align. The modifier is solid while held.

Launchpad X preserves note velocity and polyphonic pressure, including pressure recording. Original Launchpad has fixed-velocity buttons and no pressure. Note-offs and pressure retain the track and pitch captured on press. Turning the profile off, parking Movy or unloading releases owned notes and momentary controls. The X returns to Live mode on teardown.

## First hardware check

1. Select LEGACY, change the Movy input layout, and compare the lower four rows with Move. Check both halves of Single and Triple Approach.
2. Play from Launchpad while Move shows clips; switch tracks while holding a pad and release it. Confirm no hanging or duplicate notes.
3. Tap Copy in the normal HB performance view. Check top-row operations in both Perform modes, including a button held through the change.
4. Hold the topmost side button and tap a top button twice. Confirm latch on/off, matching top LED state and immediate modifier illumination.
5. Hold the same operation on Move and Launchpad. Release one, then the other; the first release must not cancel the remaining hold.
6. When the X arrives, select X and repeat, then check velocity, independent pressure on two pads, and recorded pressure playback.

Software regression tests cover both protocols. USB enumeration, actual LED appearance and end-to-end hardware latency still require the physical controller check.
