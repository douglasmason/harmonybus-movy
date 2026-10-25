# Drum clip destinations — Movy 245

In **Clips → jog right → Setup**, knob 3 chooses source track 5, 9 or 13.
Knob 4 **Drum Clip Out** switches that source between **Chain** (the existing
route) and **Drum Ch 1** (internal MIDI channel 1). Each source has its own
setting, shared across whichever banks display it. Multiple sources may play
at once. The receiving stock drum track must listen on MIDI channel 1.

Top Pad Row and Knob Touch Row remain independent presentation controls.
Changing them, the source selector, or the visible bank never enables routing.
The footer identifies the output scope as **clips only**. Live pad input and
recording input retain their existing chain behavior. Jog right still opens
the Master pipeline; left/right arrows still browse four-track banks.

## Routing and persistence

Drum clips use the existing scheduler, launch quantization, gates, clip speeds,
probability and humanize. Their sample pitches bypass melodic key/transpose,
recorded chord interpretation, Joint playback links and the source's chain.
They are excluded from conductor loop/opening metadata and recorded shared
harmonic operations. The source's synth, FX and HB role settings are preserved.
Returning to Chain resumes their ordinary behavior on the next note onset.

Routing is saved in the native Set state, defaults to Chain in older Sets and
participates in ordinary Undo/Redo. A route change flushes that track's current
gates. Releases and pressure retain the route chosen at onset, including across
Stop, mute, queued clip stop, Undo and Set load. Overlapping clips on channel 1
retrigger a shared pitch but only its final owner releases the physical gate.

Source Weaving and a drum destination cannot be enabled together on the same
source track. Disable Source Weaving before choosing Drum Ch 1; this avoids
interpreting borrowed melodic material as sample addresses. Live pad routing,
single-conductor migration, and automatic fill-return behavior are outside this
increment. In particular, Joint Play still uses its existing per-bank Root
actors; selecting a drum clip destination does not silently rewrite those actors.

## Validation

Native sequencer and DSP regressions cover exact pitch/velocity/pressure,
onset-owned releases, overlap, invalid destinations, persistence, legacy loads,
Undo/Redo and weaving exclusion. Production C-chain tests exercise all three
sources with loaded HarmonyBus chains and check exact channel, pitch, velocity,
no duplicate chain output, route/module changes and Set-load releases. Browser
controller tests cover the fourth knob, source selection, Undo enlistment,
status adoption and independence from row assignments.

No physical device is flashed by this release.
