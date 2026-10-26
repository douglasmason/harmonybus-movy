# Movy 0.34.1-hbclean.266 — Clip Fill A/B Memories

This release adds two temporary A/B variation memories to **Clips → Fill**, preserving the existing musical engine, Source Weaving, clip recording, and Undo.

- **Shift + knob 5:** save the fully previewed Fill draft as A.
- **Shift + knob 6:** save the fully previewed Fill draft as B.
- **Shift + knob 7:** recall A after checking that its source clip has not changed.
- **Shift + knob 8:** recall B with the same source check.

A memory stores the full draft configuration—pitch and rhythm donor clips, bar length, alignment, pitch-group and rhythm-phase rotations, weaving ownership, and the exact source-backed preview. The header shows `A*` / `B*` when the current draft matches a memory, `+` when a different draft is active, or `-` for empty memories.

The memories require a settled preview to save. Recalling does not send MIDI or replace clips; pressing a destination pad explicitly commits the chosen result through the existing atomic Clip Fill write and one Undo. A changed source invalidates that recall rather than silently replacing its material. The two memories reset when reopening Fill and are not serialized into Sets.

This is a **visual A/B comparison**, not yet an audible harmonic-preview system. Chord Play, HarmonyBus travel rules, live input, normal Clip Fill behavior, and drum kit mapping are unchanged.

Production native, shared-controller/browser, full MIDI/audio chain, and ARM64 module verification must pass before the installer can advance. No physical Ableton Move deployment is performed.
