# Parent key and pad position — Movy 0.34.1-hbclean.275

Left/Right shift the keyboard pattern one column during melodic note play,
including Chord Play and Joint Play. The arrows leave the current panel open;
the jog changes panels.

Open Set Parameters with Shift + Step 9. Knob 8, **POS**, shows the saved
position and turns it left or right. **Shift + touch knob 8** resets it to
Default. Touching the knob shows this reset hint. The header shows the resolved
**PARENT** key; **IN ROOT** and **IN SCL** identify the editable input reference.
The page number and jog arrow remain visible. This page owns the screen and
knobs while open, including during Chord Play and Joint Play. Back restores the
performance panel and its knob colors; pads keep their note-playing behavior.

The tonic is a scale degree in that input reference. HarmonyBus maps it into the
parent key once, preserving the chosen physical column when the parent changes.
For example, with C-major input and Relative key travel, parent D major makes
the tonic sound D and the third F#. Three Right presses move the tonic from
column 1 to column 4 without changing the key. Parallel D minor changes the
third to F while the tonic stays in column 4.

HarmonyBus 0.2.307 also fixes this mapping before the first conductor chord has
played. Closest and directional key-travel settings retain their deliberate
voice-leading behavior; they need not render the input tonic as the parent tonic.
Arrows and POS never change those settings or the input-root policy.

Position is shared across tracks, saved with the Set, and ranges from seven
columns left to seven columns right. Old Sets start at Default. Move, Joint Play
and Launchpad use the same position. Piano gaps and approach rows move with
their targets. Octave buttons keep their existing register controls.

| Context | Left/Right | Arrow illumination |
|---|---|---|
| Melodic note play, Chord Play, Joint Play | Shift pad position | Dim if available, bright while pressed, off at the limit |
| Grid Sequencer | Move through time pages | Available time pages |
| Clips | Change track bank | Available banks |
| Held-step editing / step recording | Existing nudge / tie / rest gestures | Existing editing feedback |
| Modal chord/motif review | Modal owns input | Off |

The lights follow position changes from either the arrows or knob 8, including
reset. Tonic coloring moves with its degree. Held notes retain their onset pitches
through position changes and release correctly; the next press uses the new map.
Recorded notes retain their source degrees and follow later parent-key changes.
The parent readout reuses the normal and Joint preview caches without extra polls.

Install HarmonyBus **0.2.307** from `douglasmason/harmonybus` and Movy
**0.34.1-hbclean.275** from `douglasmason/harmonybus-movy` through Schwung's
repository installer, then restart. Resolved-operation feedback, Chord Discovery, adaptive operations,
eight-note scales, Fill libraries and the audio-context improvements are included.

Verification covers all layouts/scales, input priority, limits and pressed lights,
physical MIDI knob/reset controls and screen/light ownership in Chord/Joint Play,
parent/input separation, cached normal/Joint readouts,
approach/color alignment, Launchpad ownership and persistence. The production
audio chain covers all twelve parent roots and fifteen positions, Parallel,
master transpose, held releases and recorded-degree replay. Native suites,
TypeScript/UI, ARM packaging and device startup are checked before publication.
Physical button feel, LED appearance and listening on Move still require device
testing.
