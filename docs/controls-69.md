# Controls and display review, 0.2.160 / hbclean.69

This candidate addresses the September 22 device report. It is not hardware-verified.

- Follow Play gains Render Velocity %, 0–400%, default 100%. It shares the existing routed gain with track + volume. It scales live and recorded note attacks without rewriting the clip or changing local audio. Reset and Bypass move to Play Tools. Reset clears the Follow Play configuration; Bypass skips its pitch transformations without clearing their values. Neither disables the entire HarmonyBus pipeline.
- Global uses Master Transpose, Global Xpose, Accidentals, and Tap / Hold (ms) on the top row. The existing four Harmony Flow readouts occupy the bottom row. Tap / Hold is the global threshold separating short latched gestures from momentary holds; it does not hold detected harmony.
- Chromatic Scale Degree gestures add Minor / Min7 and Dim / Min7b5. Existing enum indices remain valid in saved sets.
- Auto Chord pad previews classify the generated root instead of requiring every chord extension to match. With Auto Chord off, the preview still follows the single rendered note.
- Pads Global adds Effective Color and Track to all three color selectors. Standard selects Effective-style input highlights, pulse Off, and Track color blended with the scale background. Explicit Effective with those settings matches Standard. Current/Lookahead/Both remain available; Both means Current plus Lookahead.
- Chord Grid's Free label becomes Observed; the old spelling remains an API alias. The Chord Timing page exposes grid, anticipation, model event count, and loop position. Observed records detected change positions without snapping to a fixed chord grid; it is not per-clip grid storage.

## Movy integration

- Ignore duplicate capacitive touch-down notifications before they dismiss the native peek; keep a turned enum peek alive while its own knob is held; prevent continuous bottom-strip drawing over the enum list.
- Snapshot the four Harmony Flow fields atomically even on the mixed Global page.
- Operation's eighth knob controls the existing global Step Row preference: Steps or Perform. Flags uses the same preference. The former read-only punch readout remains available in standalone HarmonyBus.
- Hold a sequence step, then hold Left/Right for 350 ms to move its entry by one step. Continuing the hold repeats every 180 ms. Short arrow presses retain coarse timing nudge; Shift retains fine nudge. The selection follows the moved note, and the gesture uses normal Undo. A move beyond clip bounds stops instead of wrapping. Note metadata travels with the note; whole-step moves also carry step locks and trigger settings.

## Conductor and clip-grid design

Current code suppresses harmony backgrounds on conductor tracks, including when lookahead is enabled. Its Auto Chord generation can still use the effective harmony; pad color selection does not choose generation harmony.

A future Chord Source selector should choose Current, Effective, or Lookahead independently of Pad Colors. Default Effective preserves existing rendering. Current means unshifted observed/learned harmony; Effective includes the track's actual render-time choices; Lookahead means the time-shifted learned harmony. This requires explicit handling of conductor-generated notes feeding detection, so it is not silently introduced by a display fix.

For different clips, prefer `Chord Grid: Inherit / Observed / division` stored with each conductor clip. Apply overrides when normalizing each conductor's event timeline, then merge the timelines; one shared setting switched by whichever clip happens to update last would be ambiguous with simultaneous conductors. Show the selected clip, inherited/resolved grid, phase, and next boundary. Observed already supports irregular change spacing, but is not a substitute for saved per-clip overrides. These storage and source-selection changes are design proposals, not part of this candidate.
