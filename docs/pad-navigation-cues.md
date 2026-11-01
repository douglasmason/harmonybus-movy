# Movy 0.34.1-hbclean.293

Left/Right presses now reveal the current tonic location even at the horizontal
limit. During melodic pad play, +/- changes the selected track's octave and
briefly displays its input tonic register, for example `T4 tonic C4`. The same
tonic pad cue appears for 1.2 seconds, including at octave limits. Approaches
highlight their tonic target column; fourths layouts highlight actual tonic pads.
Move, Joint Play and Launchpad reuse the existing LED frames.

These buttons expose press/release events, not capacitive touch. Resting a finger
on an unpressed arrow or +/- button cannot trigger a preview. Existing Session,
Grid and step-edit gestures retain ownership. Octave changes retain their prior
note-release behavior, and cue/readout generation adds no MIDI notes, host
polling or animation timer. Context changes cancel stale cues.

The octave name follows Movy's input-note convention: MIDI 60 is C4. It names
the tonic before HarmonyBus key travel and voicing, independently of the
leftmost pad's pitch after horizontal shifting.

This release retains the .291 queue fixes, .292 diagnostic-polling improvements,
mixed-case fonts, tonic-position feedback, and merged browser/device controls.
Tests exercise physical MIDI button routing, limit presses, readout accuracy,
expiry and context changes, plus the existing Move/Joint/Launchpad LED packets,
queue/UI overhead, browser logic and device-bundle builds. Physical feel and
the previously reported hardware crackles still require device verification.

Install with `douglasmason/harmonybus-movy` after the verified release advances
the installer pointer. Publishing does not install anything on the device.
