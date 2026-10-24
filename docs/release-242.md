# Movy 0.34.1-hbclean.242 — Configurable Clips controls

Clips now opens an overview with a clear `Jog > Setup > Master` path.
Left/right moves between the four track banks without changing playback.

In Clips Setup:

- Knob 1 chooses the top pad row: Bank, Conductor or Drums.
- Knob 2 chooses knob touches: Normal, Conductor clips or Drum clips.
- Knob 3 selects this bank's drum source: track 5, 9 or 13.

Use Drums on the top row and Conductor on knob touches to access five musical
roles. Knob touches launch the eight clips of their assigned source. The display
shows actual track numbers and playing/queued/selected clip status. Setup and
Master own their knobs; a touch held across navigation cannot accidentally launch.
Normal knob use opens Master so the parameter values are visible.

Settings persist per Set. Existing Sets keep Bank/Normal until you change them.
The drum row presents existing tracks: it does not change their instruments or
MIDI routing. Dedicated drum output and conductor-role migration remain separate.

Includes the Chord Play output and mode LED fixes from 241. Ordinary clip launch,
recording, scene and song behavior remain owned by the existing engine.

Release gates cover browser/controller regressions, native sequencer and DSP,
the full Movy → Schwung → HB audio/MIDI chain, benchmarks and ARM packaging.
The uploaded package checksum is verified before advancing the installer.
Physical Move verification remains for user testing; no device is flashed.
