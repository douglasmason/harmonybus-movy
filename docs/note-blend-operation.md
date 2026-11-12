# Note Blend operation — Movy 0.34.1-hbclean.353

Assign Note Blend from the Pitch group to an operation slot. Select Steps or Bend 2/12/24/48 with the slot control. It uses the established touch-knob, step/Launchpad and Remote UI gesture routes.

Tap arms one overlapping-note phrase; separate single notes leave it armed. A second live note overlapping another on the same input channel starts the blend. Overlapping handoffs keep it running until all live notes are released. Momentary hold and persistent latch retain their normal shared behavior. The prior note_blend setting remains Base Note Blend for preset compatibility; operations override it without overwriting saved settings.

The engine now declares overlap input requirements and immediate-action gesture permissions in its catalog. Note Repeat, Repeat Divisions and Smart Approaches regain standard latch support. Existing cloud Rate/Probability features are retained.

Steps works with stock Move sounds. Continuous Bend needs a compatible synth, matching range and dedicated channel; browser NuSaw uses range 1.0 with Bend 12. This is monophonic channel bend, not per-finger MPE output.

Production-chain and compiled browser tests cover the actual shared gesture commands, continuous overlapping-note handoff, last-release completion and audible NuSaw pitch. Physical hardware feel remains untested.

See the [engine behavior](https://github.com/douglasmason/harmonybus/blob/main/docs/note-blend-operation.md) and [operation architecture audit](https://github.com/douglasmason/harmonybus/blob/main/docs/performance-operation-audit.md).
