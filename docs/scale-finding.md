# Scale Finding (manual first increment)

Scale Finding is a separate Session view after HB Settings. Unlike Chord Play,
the 4×8 pad grid is a **silent** modal selection tool; no pad produces an instrument
MIDI note or clip event.

## Pad geometry and colors

- Top row: Major. Then Aeolian (Natural Minor), Melodic Minor, Harmonic Minor.
- Knobs 1–4 choose independent seven-note families for their corresponding rows.
  Each row rotates the selected collection through its seven degrees; pad 8
  repeats the tonic one octave above. This reuses the generated HarmonyBus
  scale catalog, not a second musical vocabulary.
- Knob 8 changes the **reference tonic**, independently of the active track.
- The reference tonic column is **always white**, using existing physical pad
  positioning, not the selected track's color. It does not time out like the
  existing 1.2-second normal-play position cue.
- The last selected pad is **play green** (Move palette 11), even before
  committing, overriding its white cell. Its column in the other three rows
  retains white when it denotes the reference tonic.
- Knob 7 arms one-shot selection. The next pad commits the derived effective
  tonic and mode through HarmonyBus `key_center_tonic`,
  `key_center_explicit_scale`, and `key_center_apply=Apply`. It does not
  change `keyboardState.scale` or an individual follower keyboard.
- The native Key Center resolver determines conductor/follower harmony, travel,
  and later recorded input projection. The new mode never edits clips or
  transfers note ownership.

For example, on the Major row with C as reference, pad 5 selects G Mixolydian
and applies **G Mixolydian as the shared live Key Center**. This is the same
semantics as the existing Set Live Key operation and is deliberately not
equivalent to setting a follower's input scale.

The existing shared scale catalog has a finite set of native modes. If a
rotation has no exact native counterpart, the UI reports `Unmapped mode`,
leaves K7 armed, and makes **no partial key change**. This is essential for
some harmonic-minor rotations, including Phrygian dominant, which need a
separate native musical-catalog extension rather than a silently wrong
substitution.

## Scope

This first increment implements the manual selection surface and the persistent
LED feedback only. It does **not** capture or analyze Move's microphone. A later
input-monitoring stage can overlay bounded chroma brightness over this same
32-pad projection, subject to realtime/underrun testing. It must not overwrite
the white reference tonic or green chosen mode.

The selection is transient input-mode UI state, not recorded or saved with a
clip. Existing Session navigation, Back and normal melodic pad ownership are
restored on exit.

## Validation

The UI test checks top-row modal rotation, always-white tonic columns,
track-independent green selection, no instrumental notes, exact shared-key
writes to conductor track 1, one-shot arm, release behavior, shifted tonic
position, and native Move pad-frame delivery. Device microphone and physical
palette tests remain separate.
