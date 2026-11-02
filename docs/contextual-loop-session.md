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
| Motif Play | Existing edit semantics | Existing clipboard | Reserved for motif-repeat owner | Existing track mute | Existing sampling |
| Joint Play | Harmony Off on chord-knob surface, otherwise existing delete | Existing clipboard | Native queued chord Loop/Hold when queued chord knobs own it | Existing track mute | Existing sampling |
| Grid Sequencer | **Hold X + pad:** erase existing cell only | Existing clipboard | **Toggle playhead following vs held viewport** | Existing track mute | Existing sampling |
| Field Play | Existing editing; Shift+pad can clear assigned field | Existing clipboard | Reserved for field cycle / phase owner | Existing track mute | Existing sampling |
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
- Motif, Field, and Normal Play need a concrete motif/field owner before Loop,
  X, or Sampling are assigned another specialized meaning.

All button LEDs use the existing cached diff painter; white off/dim/bright
states never impersonate RGB. The Scope remains explicitly per input mode.
