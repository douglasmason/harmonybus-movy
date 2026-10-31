# Restore saved generator controls — Movy hbclean.288

On the Comp or Bass **Generator** page, **touch knob 6 — Revert** to discard
temporary control edits and resume the source's saved automation. Use it while
exploring a User recipe or previewing a recorded generator clip. There is no need
to stop Explore or restart the phrase.

- Complexity and Intensity resume their saved curves at the next step.
- Style resumes at the next bar, or at the loop start of a trimmed clip.
- The phrase keeps its position, seed, held notes and release ownership. The
  other actor continues playing.
- When stopped, restoration takes effect immediately.
- Moving a control again before its restoration boundary keeps that new edit;
  the other controls still restore.

Restore follows the saved values at the current phrase position, including later
automation changes. It does not reset everything to the first bar's values.
It changes no clip, library entry or Undo history. Use the existing Record button
to capture subsequent edits as before.

Finish that actor's recording or count-in before using Restore. The other actor
can restore while a take continues. This action does not undo an already recorded
pass; use normal Undo for that. Stock exploration has no saved control curves,
so Restore asks for a saved recipe instead of applying arbitrary defaults.

## Validation

Native regressions compare restored onsets and releases with the original curves
for Comp and Bass, both User auditions and recorded-clip previews. They check
step/bar timing, unchanged phrase position and persistence, stopped restoration,
new edits before the boundary, count-in/recording refusal, stale selections,
trimmed loops and independent actor recording. Shared-controller checks exercise
the real knob-6 route and selected destination. Production audio checks exercise
the native command through HarmonyBus for both actors and source types, including
unchanged saved state and balanced releases.

Pair with **HarmonyBus 0.2.310**. Physical Move audition remains outstanding.
