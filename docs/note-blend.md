# Note Blend — Movy 0.34.1-hbclean.351

Pins HarmonyBus 0.2.323. Humanize / Tools knob 8 and the shared Remote UI expose Note Blend: Off, Steps, Bend 2/12/24/48. Launchpad X, Remote UI surface events and the Move pad-pressure bridge use the same pressure-weighted output, including Render To Receiver tracks.

Two held notes produce one pressure-weighted pitch. Steps works with stock Move sounds; continuous Bend needs a compatible synth, a dedicated MIDI channel and matching bend range. In the browser, set NuSaw Bend Range to 1.0 and HB Note Blend to Bend 12. This is channel pitch bend, not per-finger MPE output; existing cloud X/Y/MPE input remains separate.

The setting saves with the track and defaults Off for older sessions. Switching Off restores held polyphonic notes. Last release, stop and source loss center bend. A sweep beyond the configured bend span reanchors with a new attack.

Tests cover production Move/Launchpad/Remote input routes, local/Receiver output, mode changes, releases, compiled Wasm MIDI and NuSaw PCM pitch. Hardware feel still needs auditioning. See the [full behavior and setup](https://github.com/douglasmason/harmonybus/blob/main/docs/note-blend.md).
