# Chord Play Display and Off Controls — Movy 264

Settings groups now show one solid segment per page, with a thicker segment
for the selected page. Inactive pages no longer appear as a dotted line.
The bar stays above the knob widgets, preserving their complete top borders.

The integrated page clears the outer renderer's old page indicator before
drawing the shared widgets. This removes the stray short line underneath
the left side of the group bar, including on dial-based operation panels.
Single-page groups have no page bar, and knob touch retains the same group.

Harmony Off clears the live harmony and queued content while preserving the
Immediate/Queued selection, whether transport is stopped or playing. Turning
Queue mode off remains an explicit choice on the first Chord Play panel.

Chord bank cells now show the native spelled name and a quality-aware Roman
numeral together: `Dm` / `ii`, `G7` / `V7`, and `Bdim` / `viio`. Literal chords
show their spelled names without inventing a key-relative degree. Secondary
chords retain their intent notation. Long names use compact chord suffixes
before truncation; the full native name remains in the control metadata.

This is a case-aware text widget registered with the existing shared
controller, which continues to own layout, input, navigation and overlays.
It adds the musical lowercase glyphs missing from the uppercase-only grid
fonts, and reuses Movy's bitmap blitter. It introduces no additional parameter
polling or harmony inference. Text metadata updates only when the name or
intent changes, and Joint Play's chord controls use the same widget.

The pixel regression renders every Chord Play core page and Setup through
the actual Chord Play route, both idle and touched. It checks solid segment
geometry, the selected segment's thickness, and the widget row against the
shared controller's own rendering. Further tests exercise all three Off
gestures with transport stopped/playing, verify that the next chord still
queues, and compare the rendered pixels of `Dm`/`DM` and `ii`/`II`.
Type checking, related controller tests,
the production validation pipeline and ARM packaging cover the integration.

This follows release 263 and preserves its Clip Fill variations, implied
harmony colors, Chord Range and Root Below behavior. No DSP changes are
introduced by this header repair.
