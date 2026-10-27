# Fixed and Adaptive motif export

HarmonyBus 0.2.309 pairs with Movy 0.34.1-hbclean.282.

In **Motif to Clip**, turn **Write to Clip** to **Fixed** or **Adaptive**, then touch it to review and choose Write/Replace, Append or Overdub. Fixed is the default. The choice is saved with the track's motif-loader settings.

- **Fixed** keeps the LT or Upper Dim operation selected when the preview is prepared. It still stores input notes and harmonic operations, so the usual voicing and track behavior remain available.
- **Adaptive** keeps authored Smart Below/Smart Above selectors. Each note chooses the complete LT/Upper Dim operation against its playback target and harmony. The result is frozen for that note's sounding lifetime, including arpeggios.

The preview displays `Smart: Fixed` or `Smart: Adaptive`. Adaptive progressions use the existing `S Below` / `S Above` labels; the playback footer shows the concrete resolved operation. Parallel approach collection remains a per-note destination choice. Ordinary live recordings continue to capture concrete operations.

Polyphonic Smart steps retain simultaneous input notes. Fixed export can store separate simultaneous LT/Upper Dim decisions, and phrase ties extend the entire simultaneous group. Invalid timing, capacity and stale-preview checks still reject the whole edit before changing the clip.

Implementation reuses native Smart selection, chord construction, onset snapshots, note ownership and the existing 52-word per-note action payload. Motion-word bit 52 extends the operation ID for the existing Smart codes 67/68; six-bit approach tokens are unchanged. Movy carries those words through playback, copy, Set persistence and Undo without resolving harmony. Loader settings use `ml2`; `ml1` restores as Fixed. Install both versions before using Adaptive clips.

Validation covers native raw/chord/arp playback, key mapping, Parallel borrowing, fixed versus adaptive harmony changes, polyphony, capacity rejection and live-capture compatibility; Rust import, serialization, duplication, Undo/Redo and event ordering; browser controls and phrase composition; and the full Movy–Schwung–HB audio chain with Set restore, exact output pitches and balanced note releases. Hardware audition remains to be done.
