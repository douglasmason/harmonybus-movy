# Context-specific Move buttons and Session Loop Edit

## Why move Loop Edit?

Loop CC 58 previously toggled `seqState.loopMode` globally, regardless of
which musical input mode was active. Chord Play's queued progression already
used the same physical key for native Hold/Loop, but pressing Loop in other modes
could unexpectedly turn the 16 step buttons into a bar selector. This is
especially hazardous while a mode is showing a different kind of grid.

Now **Session > Loop Edit** is an explicit tenth input mode, using the *existing*
engine loop window, step row, and bar-range operations. The saved clip format
and native audio engine are unchanged. Changing input mode clears only the
loop-*editor* flag, not the musical loop length or boundaries. Back returns to
the previous input mode, and the 16 step buttons retain their established
single-bar, two-bar, and double-tap behaviors.

Inside Loop Edit, **hold Loop + turn jog** to resize in bars without switching
modes on release. In Clips, **hold Loop** still displays the existing scene row;
that is a separate context-specific use, not a way to enter Loop Edit.
No other mode enters the bar editor by pressing Loop.

## Button contracts

| Input mode | X / Delete | Copy | Loop | Mute | Sampling |
|---|---|---|---|---|---|
| Clips | Existing clip delete | Existing clip copy | Hold scene-row modifier | Existing track mute/solo | Existing sampling |
| Normal Play | Existing step/clip edit | Existing clipboard | Loop Edit is now under Session | Existing track mute | Existing sampling |
| Motif Play | **Cancel the active motif draft**; otherwise existing delete | **Copy armed motif into its library slot** using the existing motif owner | Reserved until a true motif-repeat owner exists | Existing track mute | Existing sampling |
| Joint Play | Harmony Off on chord-knob surface, otherwise existing delete | Existing clipboard | Native queued chord Loop/Hold when queued chord knobs own it | Existing track mute | Existing sampling |
| Grid Sequencer | **Hold X + pad:** erase existing cell only | Existing clipboard | **Toggle playhead following vs held viewport** | Existing track mute | Existing sampling |
| Field Play | **Hold X + output pad:** clear one assigned output lane; otherwise existing delete | Existing clipboard | Reserved for Field cycle/phase owner | Existing track mute | Existing sampling |
| Chord Play | **Harmony Off**, releases protected | Existing clipboard (clip promotion not shipped) | **Native chord Queue End Loop/Hold** when queued | Existing track mute | Existing sampling |
| HB Settings | Existing editing | Existing clipboard | Bar Loop Edit in Session | Existing track mute | Existing sampling |
| Scale Finding (Inline) | **Clear selected/armed preview only** | **Apply the selected key and scale to shared parent key** | Reserved for future note-evidence hold | Existing track mute | Existing sampling |
| Loop Edit | Existing step/clip Delete | Existing clipboard | **Hold + jog resizes current loop** | Existing track mute | Existing sampling |

The five global controls—Capture, Shift, Undo/Redo, transport Play, and transport
Record—are not claimed here. They retain their standard behavior. Shift+Copy
reopens the built-in help on specialized modes.

## Grid safe erase implementation

The native grid edit command `gtog` **toggles**, rather than unconditionally
deleting a cell. Therefore a naive X-to-gtog mapping would *insert* notes in
empty locations.

Holding X sets a transient erase gesture owner. Pad down snapshots the
gesture; on pad up, it checks the **acknowledged** native grid-window events
for the exact track, pitch/operation, quantized time, and duration. It sends
an undoable `gtog` only when an occupied event is known. Unknown and empty
cells do not produce a command. Long presses cannot accidentally open
focused-note automation editing while X is held. Existing cells turn red
during erasure, using the current cached pad repaint; the normal palette
resumes on release. The eight-column Move and Launchpad viewports remain
independent. The modifier applies to Move, not Launchpad.

Grid's Loop switch changes the existing `grid_follow` viewport setting,
**not** the clip's audio/transport loop. Both LED and command behavior use
that one controller field, with no extra parameter reads.

## Scale Finding semantics

X clears the *transient* highlighted scale and armed K7 gesture, while
preserving the committed shared HarmonyBus key. Copy commits the displayed
candidate using the same `key_center_tonic`, `key_center_explicit_scale`,
`key_center_apply=Apply` path as the existing K7-armed pad gesture. It does
not synthesize notes, commit a clip, or turn on mic capture. Copy has no
write when there is no selected, supported scale.

Once Piano and microphone evidence layouts exist inside the **single** Scale
Finding input mode, the intended next assignments are:
- Sampling RGB: mic listen on/off, only with a verified native audio route.
- Loop: freeze/unfreeze the accumulated note-evidence set.
- X: clear note evidence and preview, never silently change the parent key.
- Copy: apply the currently auditioned best-fit candidate to the parent key.
- Mute: silence audition/monitoring, not a track-mixer mute.

A second Session entry for Piano would create duplicate key-finding ownership;
layout should remain a knob-controlled choice inside Scale Finding.

## Remaining deeper-specialization work

- Grid Copy could clone an abstract selected time window to a target page,
  but needs one undoable bulk transaction rather than a series of toggles.
- Grid Loop could additionally edit a selected loop range only with a defined
  range gesture and a consistent way to address clip time versus viewport.
- Chord Play Copy-to-Clip needs a native atomic semantic queue writer and
  phase-continuous handoff. The button still invokes the original clipboard.
- Joint Mute could bypass accompaniment while retaining harmonic context,
  but must not silently mute the entire mixer track.
- Motif/Field still need a concrete repeat/phase owner before Loop is specialized;
  both already have real Copy/Cancel or output-clear operations. Normal Play's
  Loop entry is now under Session. Sampling remains native until microphone
  input is validated.

All button LEDs use the existing cached diff painter; white off/dim/bright
states never impersonate RGB. The Scope remains explicitly per input mode.

## Launchpad X / Mini MK3 edge controls

The top **eight** buttons retain the existing operation / page-specific
controls; the designated uppermost **right** button (CC 89) remains the
operation latch modifier. The other seven right-side controls on the newer
Launchpads now proxy actual Move button edges through the existing central
MIDI router. From **bottom to top**:

| Physical CC | Move action | Current meaning |
|---:|---|---|
| 19 | Session | Open mode selector |
| 29 | Back | Return/cancel |
| 39 | Sample | Existing sampling function |
| 49 | Mute | Mixer mute/solo |
| 59 | Loop | Mode-specific Loop/follow/resize |
| 69 | X | Mode-specific clear / erase |
| 79 | Copy | Mode-specific copy / apply |

Every press owns its release, including surface teardown and track/mode
switches. The already-tested Move RGB palette and packet throttle paint
all 64 grid pads, eight top operations, the modifier and the seven new
right-side buttons in **one bounded, cached SysEx frame**. Legacy Launchpad
has a different edge layout and keeps its prior 73-lamp mapping.

**Caution:** the top buttons are still occupied by operation banks, and in
Grid they already perform window controls. We deliberately do not multiplex
more actions onto them, which would risk arbitrary parameter edits.

## Remote UI (browser studio)

The Remote UI now receives `modeActionDescriptors()` from Movy's actual
controller in its normal frame snapshot. Every function button keeps its
physical identity for shortcuts and accessibility; a **second visible label**
states the current action, such as `Copy · Apply key` or `X · Erase cell`.
Availability and active state are reflected by brightness and annotations,
while hold and hold+pad gestures have explicit accessible descriptions.

The line below the controls summarizes available actions for the current
mode and the Launchpad right-edge assignments. Both the inline surface
and enlarged editor reuse the same controls, so the labels cannot diverge.
The browser snapshot is read-only and does not poll additional native DSP
parameters. In **connected physical Move mirror mode**, where rich semantic
state is unavailable, the UI continues to say so rather than claiming that
contextual actions can be operated remotely.
