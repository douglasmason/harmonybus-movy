# Saved generator recipes — Movy hbclean.286

Comp and Bass recordings can now be saved in their existing eight User library
slots without Bake. The saved entry retains the generator, seed, Complexity,
Intensity and Style curves, clip length, and captured actor settings. It remains
relative musical input that HarmonyBus maps against the current harmony.

1. Finish recording, stop temporary exploration, and select the recorded actor
   clip. Use that actor's existing Library **Save** control and choose a User slot.
2. Choose **Browse → Actor → Genre: All → Family: User → User 1–8**, then start
   Explore. The existing actor Library Load review also offers **Explore** for
   these entries. Both routes start the same temporary audition.
3. Explore and adjust Complexity or Intensity. The saved seed stays fixed;
   untouched controls follow their saved curves. Comp and Bass can audition
   together. Exploration changes no saved clip, Set, or library entry.
4. Select an empty clip on that actor track and press the **existing Record
   button**. At the first recording tick the full recipe is copied at its saved
   length, and moved controls use the ordinary automation overdub path. Press
   Record again to finish; the whole pass has one Undo.

A saved recipe keeps its complete original loop even when Record is stopped
early, and repeated passes do not extend it. This differs from a new stock-source
take, whose length grows while recording. Cancelling during count-in does not
copy the saved recipe. Record still requires Own source routing and three
available automation lanes, remapped by name without stealing existing lanes.
Switching actors does not change which take Record will end.

Saving does not overwrite the source clip. Audition requires the same instrument
as the saved entry. Existing note-based User presets retain their previous Load
behavior. User slots are shared between the actor library and generator browser,
so saving into an occupied slot replaces that entry through the existing review.

This release accepts whole-bar generator recipes up to sixteen bars, with a zero
loop start, no transpose and 1× clip speed. All three generator curves must start
at zero. Recipes with manual notes, additional automation, Grid gates, operation
intervals or trig conditions must be baked and saved as ordinary note styles.
Unsupported edits are refused instead of being dropped. User recipes have no
genre tags yet; find them under All. Clip Fill accepts their original Style
length and refuses resizing. Seed editing remains available for stock exploration.

Bake also now materializes the captured gate scale before Bass truncates a gate
at the next attack, avoiding a second application of that scale after Bake.

## Validation

Native tests compare exact event traces through export/import, two-loop temporary
audition, Record, automation overdub, Set reload and Bake for both actors. They
cover lane remapping, occupied destinations, invalid recipes, count-in cancellation,
an in-flight control at Record handoff, and Undo while the other actor explores.
Shared-controller tests cover Save, both browsing routes, physical Record, one
Undo group and existing note-style compatibility. Production Movy → Schwung → HB
tests check mapped MIDI, balanced releases, unchanged saved content while
auditioning, reload and Undo. Native, browser, device-startup and package checks
remain required.

Pair with **HarmonyBus 0.2.310**. No new HB or host update is required. Physical
Move audition has not been performed for this release.
