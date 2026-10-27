# Bass Library — Movy 0.34.1-hbclean.246

In hbclean.270 the same stock and user entries are direct sources in
[Clips → Fill](fill-library-270.md), including graphical saved-style previews.

Requires HarmonyBus 0.2.294. Update Movy through Schwung Manager and restart Move.

Chord Play now has a Bass Library beside Comp Library. It uses the same clip loader, scheduler, rendering settings, automation recall, and Undo system. Six one-bar starters are included: Root / Fifth, Sustain, Sparse, Syncopated, Octaves, and Walking. Walking is a simple diatonic source line; it does not anticipate the next chord.

Stock load reviews now show source-note timing and register. Their names, notes and rendering overrides come from one catalog shared by native loading and UI drawing. Saved user entries retain the textual review. The planned [Clips View Fill interaction](clip-content-library.md) will bring these sources together with motif/autofill loading and length placement; that broader browser is not part of this release.

Turn Bass Style to browse, then tap and release that knob without turning to review. Touch knob 1 to apply or knob 2 to cancel. Loading replaces the selected bass clip with ordinary editable notes. Existing playback queues an idle clip at the next bar; stopped transport stays stopped. Press Play, then select a chord, or use a recorded conductor clip.

| Knob | Bass Library control |
| --- | --- |
| 1 | Bass Style; tap/release to load |
| 2 | Velocity percentage |
| 3 | Note Length percentage |
| 4 | Register in semitones |
| 5 | Relative / Closest Split mapping |
| 6 | User Slot, 1–8 |
| 7 | Save the selected clip to that user slot |
| 8 | Harmony Off |

Chord Play Setup selects Bass Track (default track 2) and Bass Input. Loading a bass style selects Bass Clip so existing Joint root-follow routing cannot suppress its notes or double-trigger the part. Undo restores the prior clip and input selection together. Existing Routing restores the underlying Joint routing. Other quartets and the conductor/comp output choice remain independent. Destination instrument and MIDI routing stay configured in the Set; configure the bass track's Render To Channel as needed, normally channel 2 for the stock bass destination.

Stock bass presets contain single source notes in C-major input coordinates, with chord expansion, arp and extra rhythm generation disabled. All use Relative by default and support Closest Split. User exports reject rendered/raw notes or automation that disables harmonic mapping. Bass presets do not drive conductor harmony.

Eight persistent bass user slots are separate from the eight comp slots. Existing comp entries migrate on the first save without losing their contents. Save User captures the currently selected clip, including notes, lengths, register, actions, pressure, conditions, named automation, and the shared rendering defaults. Replacing a global slot requires review and is not restored by clip Undo. The file uses format version 2; older Movy releases cannot read the expanded library, so avoid downgrading after saving. Instrument-module identity is checked on load; instrument/effect patches are not bundled.

Verification covers all six styles, both mapping modes through the production Movy/Schwung/HarmonyBus chain, changing harmony, scaled velocity, paired note-offs, independent user slots, migration, failed saves, routing ownership, Set restore, Undo, controller navigation, native tests, and ARM packaging. Physical Move playback remains untested. No additional rhythm clock or per-block preset loader was added; the existing clip recipe cache still emits settings only when they change.

In the load review, touch knob 3 to choose **Own content** (default) or **Keep weaving**. Own content resets this actor's source routes so the loaded pattern is heard directly. Keep weaving preserves every existing source dimension and alignment, allowing the new clip to supply its own pitches while borrowing rhythm, expression or automation. Borrowed dimensions can override the corresponding loaded material; the small preview shows source notes, not the final woven performance. Sources must be playing under the existing weaving rules. Source routes remain Set configuration rather than portable user-preset data. Both choices participate in clip Undo; changing source routing during review requires a fresh preview.
