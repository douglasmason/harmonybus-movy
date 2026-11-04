# Session modifier and Clips return

Session doubles as a nearby Shift button. Its tap action runs on release, so
holding it leaves the current view available to the control being modified.

| Gesture | Action |
| --- | --- |
| Tap Session | Open or close the input-mode selector; jog to choose, click to enter. |
| Hold Session + another control | Use that control's existing Shift action. No selector opens on release. |
| Double-tap Session within 350 ms | Open Clips; from Clips, return to the previous input mode and view. |
| Physical Shift + Session | Go directly to Clips, including when already there. |

Jog touch, turn and click, Back, the track buttons, arrows, octave buttons,
knobs and steps all receive the same Shift state. A control with no distinct
Shift action keeps its ordinary behavior. Track selection therefore stays
track selection; Session + Mute + track uses the existing Solo gesture. Mode
specific actions still take priority, including Chord Play's rendered-MIDI mute.

Once another control is used, that Session press cannot become a tap or a
double-tap. A long hold without another control does nothing on release.
Repeated press events and releases from older holds do not count as new taps.
Both physical Shift and Session have independent release state: releasing one
while the other is held keeps Shift active. Input reset clears both.

Clips return retains the prior input mode, view, hosted module panel and Back
history. The focused track remains the one selected while in Clips. At startup,
when Clips has no previous view, double-tap opens Normal Play. Navigation uses
the existing mode owners and does not duplicate musical state or the sequencer.

Validation covers the production MIDI dispatcher and real shared panel
controller, overlapping modifiers, early releases, modal releases, input reset,
all nine modes, repeated Clips round trips and Back history. Physical Move
ergonomics still need an on-device check.
