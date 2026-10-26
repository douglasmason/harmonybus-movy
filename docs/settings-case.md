# Mixed-case Shared Settings — Movy 265

Settings preserve the case supplied by the module: `Dm` stays `Dm`, `ii`
stays `ii`, and labels such as `Reset` and `Range` use their original case.
This covers labels, enum boxes, readouts, lists, headers and touch overlays.
Uppercase acronyms and explicitly uppercase labels remain uppercase.

The issue came from two layers: Schwung's Movy layout capitalized strings
before drawing, while Movy's own font mapped lowercase letters to capital
glyphs. Both now support the complete lowercase alphabet. The condensed
enum font and seven-row value font have lowercase too. Their existing
uppercase glyphs and widget heights are unchanged. Abbreviation still fits
text to its pixel budget and preserves the source word's capitalization.

Movy packages the pinned Schwung shared controller and its dependencies in
the UI bundle. The browser and device therefore use the same library,
including the same widget registry, regardless of the host's optional
parameter-page library version. This keeps Schwung's existing page, widget,
input and navigation implementation; it introduces no additional settings
renderer. The copy is generated from the verified upstream commit at build
time, with its MIT and Tamzen notices retained in the bundle.

Chord bank widgets now reuse Movy's complete mixed-case font instead of a
private partial lowercase alphabet. The spelled names, quality-aware Roman
numerals, solid page segments and queued-mode preservation from 264 remain.

Validation covers all 26 letters in five fonts, mixed-case labels and values,
complete Chord Play and Setup rendering, the existing UI and musical
regressions, and QuickJS startup with the optional host UI library present
and unavailable. The release pipeline also builds and verifies the ARM
package. Physical display and audio performance still need device testing;
this release changes typography and UI packaging, not the DSP engine.
