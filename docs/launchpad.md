# Launchpad input surface

In Movy's release settings select **Launchpad → LEGACY** for the original Launchpad, **X** for Launchpad X, or **MINI MK3** for Launchpad Mini MK3. The default is OFF. This setting claims external USB MIDI channel 1 while Movy is active. Launchpad MK2, earlier Mini generations and Akai APC controllers have no dedicated profiles in this build. The saved OFF/LEGACY/X values are unchanged.

X and Mini MK3 enter Programmer mode automatically. Mini MK3 uses its MIDI interface, rather than its DAW interface. Its profile follows Novation's [Programmer's Reference Manual](https://downloads.novationmusic.com/novation/launchpad-mk3/launchpad-mini-mk3-0): product ID `0D`, mode command `0E` (pages 6–7), decimal grid/top/side addressing (page 10), and RGB command `03` (page 14). It shares the existing X grid, note queue, control ownership and LED scheduler; it does not receive X's pressure-configuration message.

Use a dedicated USB connection. Turn Move's native MIDI input off and keep Schwung's independent chain slots from receiving this controller's channel 1 (including Receive All / THRU). The host's channel-block API suppresses native note-ons but does not suppress independent slot routing or raw pressure/CC. THRU bypasses that block. These settings prevent a second raw-note path alongside the mapped input.

The 8×8 grid follows Movy's input mode, layout, root and octave on the selected track. Move's four rows sit in the middle, with complete groups extended above and below. Triple Approach keeps Move's four-row group at the bottom and adds a second target row and its three approach rows above. The grid continues playing while Move shows clips.

| Control | Behavior |
| --- | --- |
| Eight top buttons | Touch/release the corresponding HarmonyBus operation knobs on the retained HB page |
| Topmost right-side button | Hold as the permanent-latch modifier; its LED lights while held |
| Modifier + top button | Toggle the corresponding operation's permanent latch |
| Other right-side buttons | Unassigned |
| Move Copy tap | Existing Steps → Perform 1 → Perform 2 cycle; top assignments follow the new HB page |

Copy retains its existing edit guards and clip-copy behavior in Session mode. A held top button releases its original operation after a page, track or performance-mode change. Ordinary parameter knobs without a musical touch operation have no external action. In Single/Triple Approach layouts, bank touches select/compose rows and their latch modifier is inactive, matching the knobs.

The top LEDs use the actual knob painter's colors and state rules. X and Mini MK3 use RGB; the original Launchpad uses its red/green brightness levels. External LEDs hold pulse peaks steadily to avoid repeated USB animation traffic. Only changed colors are sent, with full RGB frames given time to drain. The modifier is solid while held. Move retains its own animation.

Launchpad X preserves note velocity and polyphonic pressure, including pressure recording. Original Launchpad and Mini MK3 have fixed-velocity buttons and no pressure sensitivity; see Novation's [feature comparison](https://us.novationmusic.com/launchpad). Note-offs and pressure retain the track and pitch captured on press. Changing the profile, turning it off, parking Movy or unloading releases owned notes and momentary controls. X and Mini MK3 return to Live mode on teardown.

## First hardware check

1. Select the matching profile, change the Movy input layout, and compare Move's four-row group with the external grid. Check both halves of Single and Triple Approach.
2. Play from Launchpad while Move shows clips; switch tracks while holding a pad and release it. Confirm no hanging or duplicate notes.
3. Tap Copy in the normal HB performance view. Check top-row operations in both Perform modes, including a button held through the change.
4. Hold the topmost side button and tap a top button twice. Confirm latch on/off, matching top LED state and immediate modifier illumination.
5. Hold the same operation on Move and Launchpad. Release one, then the other; the first release must not cancel the remaining hold.
6. On X, check velocity, independent pressure on two pads, and recorded pressure playback. On Mini MK3, check the RGB colors and return to Live mode after disabling the profile.

Software regression tests cover all three profiles, including repeated notes, original-track releases, mode switching and RGB backpressure. Both Schwung 1.7.3 and 1.8.2 CI matrices run the surface suite. Schwung 1.8.2's cable-zero held-step fix protects its own button tracking; Movy still owns surface routing and cancellation. USB enumeration, actual LED appearance and end-to-end hardware latency still require the physical controller check.
