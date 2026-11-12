# Field performance operations — Movy 0.34.1-hbclean.355

The shared operation picker has a **Field** group: Field Rate, Field Zoom and
Field Output. Assign them to standard slots for touch-knob, step/Launchpad or
Remote UI control. Existing approach-row pressure mapping also supports them.

Rate 100 is normal, 0 freezes, and negative values reverse. Zoom 100 is normal.
Field Output in slot N drives output N at 0–100 percent; existing Field routes
can send it to a synth parameter, FX parameter or sequence-position input.

Hold is momentary, the existing persistent latch stays active, and a knob tap
arms the next live-note phrase. All notes released completes that one-shot.
These contributions preserve underlying settings and do not multiply merely
because a joint gesture addresses multiple tracks. Existing direct Field
controls and the precise cloud movement features are retained.

Full-chain coverage checks an actual stock synth modulation destination while
editing its base. Compiled browser coverage checks Remote note-phrase arming,
continuation, completion and coexistence with direct Field controls. Native
engine tests cover pressure, ownership, restore, bypass and the shared clock.

See [Field operation behavior](https://github.com/douglasmason/harmonybus/blob/main/docs/field-operations.md)
for ranges, priority rules and compatibility boundaries.
