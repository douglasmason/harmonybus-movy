# Mixed-case Shared Settings

Settings preserve the case supplied by the module: `Dm` stays `Dm`, `ii`
stays `ii`, and labels such as `Reset` and `Range` use their original case.
This covers labels, enum boxes, readouts, lists, headers and touch overlays.
Uppercase acronyms and explicitly uppercase labels remain uppercase.

There are three treatments: existing capitals, normalized lowercase for ordinary
interface text, and the original small lowercase for Roman numerals and chord spellings.
Ordinary lowercase bodies share a common top one pixel below capitals: four rows
in compact fonts and six rows in the value strip. Ascenders `b d f h k l t`
reach the full five- or seven-row capital height. In particular, `c o e s` have
the same top and baseline. Advances and widget heights stay unchanged. Musical
case (`Dm`, `ii`, `II`) remains distinct.
Chord widgets explicitly use the smaller atlas for both musical lines. Ordinary
labels and values keep normalized text. Musical footers select the smaller atlas
only for complete Roman or spelled-chord tokens, including queued `[Dm]`, leaving
words such as `Min`, `Live` and `Overdub` normal.

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

Chord bank widgets reuse the shared notation atlas for both spelled names and
Roman numerals. The spelled names, quality-aware Roman
numerals, solid page segments and queued-mode preservation from 264 remain.

Validation covers all 26 letters in five fonts, mixed-case labels and values,
normalized lowercase bounds and explicit musical-notation opt-in, complete Normal Play,
Chord Play and Setup rendering, the existing UI and musical
regressions, and QuickJS startup with the optional host UI library present
and unavailable. The release pipeline also builds and verifies the ARM
package. Physical display and audio performance still need device testing;
this release changes typography and UI packaging, not the DSP engine.

Operation-only touch cells use the existing settings renderer and these same
normalized fonts to wrap the operation name across the full cell. Their numeric
widget and redundant number label are omitted; touch inversion remains. The
metadata flag is limited to HarmonyBus gesture controls; stock instruments and
real amount/enum controls keep their value display. Layouts are cached (128
entries maximum) and text drawing performs no host I/O.
