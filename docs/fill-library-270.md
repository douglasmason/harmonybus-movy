# Movy hbclean.270 — Actor libraries in Clips Fill

Comp and Bass styles are now direct sources in **Clips → Fill**. No temporary
source clip or new library save is required. Choose the actor's library, then
its stock style or one of its eight existing user entries. Existing clip-source
Fill, A/B memories, Source Weaving and Chord Play keep their established roles.

| Control | Library source behavior |
| --- | --- |
| Knob 1 | Source track, Comp Library or Bass Library; libraries follow Track 16 |
| Knob 2 | Style within the selected actor's library |
| Knobs 3/4 | Saved style's own rhythm |
| Knob 5 | Style length by default, or repeat/trim to 1–16 bars |
| Knob 6 | Original phrasing |
| Knob 7 | Own content / Keep weaving |
| Knob 8 | Exit Fill |
| Destination pad | Replace that visible clip through one Undo transaction |

Selecting another library entry returns to **Style length**, preserving its
saved loop window, timing/speed, conditions, note operations and grid holds.
Ordinary note/automation patterns can repeat to a chosen length. Styles with
conditional or live timing, quantization or speed changes require Style length
when resizing would change their meaning. No fields are silently discarded to
make a style fit. Library rhythm replacement and rotations remain future work.

Both stock and user styles have a native source-note preview showing timing,
register, gates and accent strength. It is a source preview, not an audible
prediction of the final HarmonyBus voicing. Drawing and idle ticks perform no
library decoding or source queries. Saved entries are transferred only when
the chosen payload or engine instance changes.

Full styles retain Relative/Closest Split mapping, clip rendering defaults,
register, note-length scaling, pressure, conditions and named automation. The
shared library loader allocates destination lanes by name and preserves saved
bases without changing the bases used by other clips. Missing lane capacity or
an incompatible saved instrument stops the edit before changing the clip.
Instrument/effect patches and output routing remain Set configuration.

Fill does not start transport, launch/select another clip, or switch Chord Play's
Comp/Bass Input choice. Use the existing Comp Clip/Bass Clip routing when that
part should sound. If replacing a playing clip, its old gates close and its
existing loop resumes from the new style's loop start. Record/count-in blocks
writes. Undo restores contents, lane assignments, defaults and weaving together.

A/B memories include the actor, entry, length and exact saved source identity.
Replacing a user slot invalidates the old draft and memory until refreshed;
the new entry cannot silently substitute for the reviewed one. Saved library
data itself is never overwritten by Fill.

The [shared content design](clip-content-library.md) now specifies actor-first
style families, independent genre/complexity controls and recordable generator
automation using the existing lanes. Those generator controls are follow-up
work, not part of this release.

Validation covers every stock style, saved expression and named automation,
nonzero loop windows, preserved conditions/timing, bounds and stale-source
guards, Set restore, Undo, controller/framebuffer behavior, existing native/DSP
suites, production HarmonyBus MIDI/audio playback, and ARM package checks.
Physical Move testing remains outstanding.
