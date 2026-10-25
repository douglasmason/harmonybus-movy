# Comp styles — Movy 0.34.1-hbclean.244

Requires HarmonyBus 0.2.294. Update HarmonyBus and Movy through Schwung Manager, then restart Move to load the new native engine.

Chord Play's main knobs are Comp Input, Comp Style, Velocity, Note Length %, Chord Form, Voicing, Register, and Harmony Off. Velocity, form, and voicing control the conductor when it directly renders chords; with Comp Clip selected, they control the comp track. Note length and register control the currently sounding comp preset, or the selected preset while stopped.

Turn Comp Style to choose Sustain, Quarters, Offbeats, Sparse Shells, 3-3-2, Broken Chord, Registers, or User 1–8. Tap and release that knob without turning to review loading. Touch knob 1 to apply or knob 2 to cancel. The Comp Library panel also has explicit Load Style, User Slot, Save User, and Mapping controls. Loading replaces the selected comp clip and is undoable; if another clip on that track is playing, select that clip first. A stopped load waits for Play. Start playback, then select a chord from the chord bank, or play a recorded conductor clip; the existing transport restart clears held live chord selections. During playback an idle comp track queues its new clip at the next bar.

Loading selects Comp Clip and turns off the conductor's direct sound to avoid doubled comping. Conductor harmony continues to drive the comp track. Choosing Conductor / Melody again restores its previous Render channel and suppresses comp-clip attacks while direct conductor output owns the part. Chord Play Setup holds the track assignments, color choice, and Reset Chords.

Every supplied comp preset contains source notes with a saved input key and Relative mapping. Closest Split is also supported. Rendered/raw output is rejected for user comp presets. Broken Chord supplies individual source tones; the other styles use the existing HarmonyBus chord renderer. Source velocities carry accents, with Velocity acting as their overall percentage.

Presets retain clip timing, note lengths, register, note actions, pressure, trig conditions, named automation lanes, and 28 HarmonyBus rendering defaults. Each clip recalls its own defaults when selected or launched. Automation still overrides defaults during playback. Note lengths use a non-destructive percentage. New styles disable the separate rhythm generator so their clip notes own the rhythm. Destination channel, instrument, effects, and shared conductor harmony remain part of the Set. User entries require their saved instrument module; they do not bundle instrument/effect patches. Automation that disables harmonic mapping is rejected.

After editing a loaded style, choose User Slot and Save User in Comp Library, then confirm. The eight user entries persist across Sets and module updates. Saving over a user slot explicitly replaces that entry; clip Undo does not restore the global user library. Set save/open, clip duplication, and Undo retain clip recipes. Existing unstyled clips keep their prior track defaults.

This release delivers the comping category. The [Bass Library](bass-library.md) extends the same system in hbclean.245. Drum and conductor categories remain follow-up work; melody remains lowest priority. Comp, bass, and melody entries must retain Relative or Closest Split input mapping.

Verification covers real controller touch/turn behavior, UI logic, native sequencer/DSP, mapped playback through the production Movy → chain → HarmonyBus path, automation remapping, persistence, Undo, and ARM packaging. Physical Move playback still needs verification after installation.
