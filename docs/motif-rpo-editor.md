# Motif Relative Operation editor

Movy 0.34.1-hbclean.284 pairs with HarmonyBus 0.2.310. Install HB first, then Movy.

In a Play Motif lane, open the motif editor, begin editing, select a note step, then use **Motif Tools → Relative Operation**. Choose LT, Upper Dim, Connector Below/Above, a secondary, a substitution, or either Smart direction. The same choice applies to new note entries. At a rest, tie, or empty position, changing the operation only sets the next-entry choice.

**Captured** restores the original event, including after save/reload. The header shows native identity, for example `1 Captured: LT`, and avoids assigning a simple name to composite or cadence captures. Done saves; Undo restores the previous draft. Timing, velocities, polyphony, voicing, and unrelated actions are preserved.

The menu comes from the shared operation catalog. Movy preserves the native wire names and only orders choices supplied by HB, so an older backend does not acquire unsupported menu entries. Labels use the existing native status polling path; Movy adds no harmonic resolver.

Fixed/Adaptive clip export continues unchanged: fixed recipes remain fixed; Smart choices resolve at export in Fixed mode and at playback in Adaptive mode. HB also corrects destination-key collection selection for raw conductor secondaries.

Validation includes native operation/edit/storage/playback tests, the browser/controller regressions, and the full production audio chain. Physical hardware audition remains outstanding.
