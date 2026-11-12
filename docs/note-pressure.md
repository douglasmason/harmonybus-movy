# Mapped note pressure — HarmonyBus 0.2.322 / Movy hbclean.349

Ordinary polyphonic pad pressure now follows the voice that HarmonyBus actually
played. A C pad mapped or transposed to D sends pressure to D, using the stored
onset owner rather than recomputing the current harmony. Changing an operation
while holding a note does not redirect its pressure to a different pitch.

The same path serves Move pads, Launchpad X and existing Remote UI/sequencer
pressure commands. There is no new switch: update both modules and keep using
normal note pads. Approach Pressure operation rows retain their existing gesture
controls. Remote UI cloud X/Y and MPE input remain independent.

Single-note live and clip owners stay separate, even when they share an input
pitch. Together-mode chords fan pressure out to their currently sounding voices,
once per destination pitch. Local sound, Render To and internal Receiver tracks
receive the mapped pressure. Global Transpose then applies its final offset once.
Pressure zero remains a valid value and never releases the note. Released,
skipped and out-of-range voices do not receive stray pressure. Rhythm-delayed
outputs keep pressure behind their corresponding attack. Internal Receiver
pressure no longer masquerades as a note-off or changes note reference counts.

This uses existing MIDI voice ownership and adds no per-block background scan or
new saved setting. Arp/rhythm pressure still controls future attack velocity using
the existing behavior; this change does not change that timing or retrigger it.
When multiple inputs share one physical MIDI pitch, that pitch can carry only one
pressure value, so the latest received update wins. Updates address existing voice
owners; pressure received before a follower has created its buffered voice is not
retained as a new envelope. Repeated/echo tail voices do not gain independent
pressure envelopes in this release.

Continuous pressure-ratio legato remains separate work. This release sends
polyphonic aftertouch, not pitch bend or MPE output. Stock Move does not support
MIDI pitch bend/MPE input; a continuous-glide implementation needs a compatible
synth/destination and isolated channel ownership. Hardware feel and instrument
response remain untested on a physical device.

Regression coverage includes onset mapping, independent live/clip pressure,
held-operation edits, final transpose, zero pressure, MIDI bounds, silent gates,
chord fan-out, delayed attacks, small Receiver output buffers and paired releases.
The production-chain test exercises both Move MIDI input and the same note-pressure
commands used by Launchpad/Remote UI, through local and Receiver synth probes.
