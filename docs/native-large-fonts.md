# Native large-font faces for Move (128×64)

The photograph of Chord Play showed stretched 5-row bitmap glyphs in its expanded
two-line cells. The earlier repair preserved lowercase musical notation, but its
enlargement repeated source rows and produced uneven stroke weight. Operation-only
cells used the same scaling technique.

## Three deliberately rasterized 8-row faces

- **Upper**: full-height seven-row capitals (plus a blank row for consistent
  line metrics), digits and notation punctuation. Explicit all-uppercase text
  preserves its existing meaning and never depends on a lowercase substitution.
- **Regular**: seven-row capitals and distinctly shorter four-row lowercase
  bodies. Chord spellings and quality-aware Roman numerals use this face:
  `Dm`, `ii`, `G7`, `viio`, `Bdim`.
- **Smooth**: the same capital glyphs but separately drawn six-row lowercase
  bodies beginning just one pixel below capitals. Ordinary full-size operation
  labels and other expanded text use this face. Unlike the compact glyphs,
  `c`, `o`, `e`, `s` share common x-height geometry.

All glyphs are authored as final-size 1-bit bitmap rows. The atlas compiles
horizontal lit-pixel runs once at module import. Drawing emits one-pixel-high
rectangles; **no glyph pixels or rows are stretched, duplicated or scaled**.
The 8-row line box includes a descender row for `g`, `p`, `q`, `j` and `y`.

The existing small 4×5, condensed 5×3, Tamzen and Movy glyph atlases remain in
place for tight controls. This is an additive larger-size family, not a
replacement for the previous small-font behavior.

## Usage

The font lives in `integration/settings-case/hb_large_font.mjs`. The pinned
shared-UI packaging copies it to
`src/vendor/schwung/shared/param_pages/hb_large_font.mjs` alongside a TS
declaration. Movy Chord Play, Joint chord tiles, and shared settings action
labels import this exact module; no second font implementation or renderer is
created.

Chord tiles use two native-height eight-row lines with a one-pixel gap when
the actual widget is at least 17 px tall. Smaller cells retain an unscaled
compact glyph draw. Spelled chord names and Roman numerals keep their original
case and chord-resolution logic. Text fitting uses native advances, and only
abbreviates a chord when the physical cell really cannot accommodate it.

Operation-only cells prefer the smooth large font if their wrapped lines fit
the native line height. Longer actions fall back to the compact fonts, without
resampling, using the existing cached 128-entry layout pool. Normal editable
controls are not modified.

## Verification

The installed shared-UI framebuffer tests check every letter in all three
faces, eight-row clipping, one-pixel draw heights, x-height differences, the
uppercase-only mode, musical `Dm` / `DM`, `ii` / `II`, and native label width.
Chord Play tests verify that no slot number returns and the expanded frame
still responds to touch. The existing full build covers browser/device
bundling, mixed-case rendering, the actual shared controller, and QuickJS
startup. Physical readability and LED/audio performance require testing on
Move; a source-level validation is not a hardware display validation.
