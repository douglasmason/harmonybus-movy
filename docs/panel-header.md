# Panel Header Segments — Movy 264

Settings groups now show one solid segment per page, with a thicker segment
for the selected page. Inactive pages no longer appear as a dotted line.
The bar stays above the knob widgets, preserving their complete top borders.

The integrated page clears the outer renderer's old page indicator before
drawing the shared widgets. This removes the stray short line underneath
the left side of the group bar, including on dial-based operation panels.
Single-page groups have no page bar, and knob touch retains the same group.

The pixel regression renders every Chord Play core page and Setup through
the actual Chord Play route, both idle and touched. It checks solid segment
geometry, the selected segment's thickness, and the widget row against the
shared controller's own rendering. Type checking, related controller tests,
the production validation pipeline and ARM packaging cover the integration.

This follows release 263 and preserves its Clip Fill variations, implied
harmony colors, Chord Range and Root Below behavior. No DSP changes are
introduced by this header repair.
