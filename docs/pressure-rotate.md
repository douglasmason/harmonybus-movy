# Pressure Rotate — HarmonyBus 0.2.321 / Movy hbclean.347

The existing **Pitch → Rotate** operation now accepts Approach Pressure. Assign
Rotate to a slot, set **Collection Steps** (−24 to +24), turn **Auto Off** for
pressure-only play, and assign the slot to an Approach Pressure row. Start with
+7 or −7 for a seven-note scale. Existing Rotate assignments and its default
amount (+1) retain their meaning.

Pressure moves from zero toward that endpoint in whole collection steps. A small
dead band prevents jitter between adjacent steps; active pressure zero is neutral
and does not release the pad. Momentary, Tap Latch, Peak Latch, Reverse and prepared
tap amounts use the shared controls. The pressure page reports the signed step
count. Existing Field Amount bounds can supply a bipolar range.

Rotate follows the existing Content Map: **Scale** walks the effective scale,
**Chord** walks chord tones, and **Free** walks semitones. In C major, +1 moves
C–E–G to D–F–A; −1 moves it to B–D–F. One octave takes as many steps as the
collection contains: seven for Major, six for Whole Tone, eight for diminished
scales when those are the effective collections. The existing harmony policy may
add chord tones to the parent scale; the step count follows that resulting
collection. It does not force every scale into seven degrees. Chromatic inputs follow
Rotate's existing nearest-collection-tone rule; zero leaves them unchanged. A
missing valid harmony leaves Rotate inactive. MIDI limits retain the existing
octave-folding rule to preserve pitch class.

This is **onset rotation**: newly played/generated notes use the current step;
already sounding notes keep their onset pitch and receive the matching release.
It does not retune held notes or provide continuous MPE glide. Note Repeat repeats
its captured seed pitch, so holding one note and changing Rotate pressure does
not sweep its repeats. Active arps and newly played chords can audition changing
steps as they generate new note onsets. Voicing Rotate remains the separate live
inversion control that preserves chord tones.

Existing per-note operation capture stores Rotate's resolved integer outcome.
This does not add continuous pressure-envelope recording. Saved settings survive
reload; contacts, latches and pressure-step caches clear on Stop, role/route
changes and restore. Knob/step activation remains unchanged.

Move and Launchpad X supply Z/pressure. Remote UI uses the shared operation and
pressure panels; its X/Y cloud controls remain independent. Mini and operation
buttons can use the prepared operation amount. Update both modules and restart
Move. Automated tests cover signed steps and jitter, scale/chord/free collections,
six/eight-note scales, real MIDI release ownership, gestures, Field bounds,
per-note capture and cleanup; physical playing feel remains untested.
