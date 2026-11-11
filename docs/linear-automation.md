# Linear automation readers

Movy 0.34.1-hbclean.339 adds independent **Instrument Read** and **HB Render Read**
settings to each actor's **Source Automation** panel. Choose **Step** (the
existing behavior and default) or **Linear**. Native Move, Remote UI and
standalone use the same saved settings and engine reader.

## Play

1. Record or place automation locks on a numeric parameter, such as filter cutoff.
2. Select the actor's Source Automation panel and set Instrument Read to Linear.
3. Play the clip. Values blend between control points instead of jumping.

The two readers are independent. Linear works on Own clips even when Source
Weaving is off. To borrow another clip's automation, enable Source Weaving,
choose its source and retain the existing Timeline or Fit alignment. Missing or
muted donors fall back to the destination's Own clip. Source selection, note
following and automation reading retain their existing separate controls.

## What is a control point?

Existing explicit locks are points. A note step without a lock resets the lane
to its base value, as it does in Step mode, and is also a point. A lock wins over
a note reset on the same step. Sparse points connect across the selected loop
boundary; points outside that window are ignored. An empty lane stays at base;
a single point is constant around the loop.

Linear uses the existing 96 PPQN clock and 7-bit automation output. It can emit
intermediate values inside a sixteenth-note step without retriggering notes.
This is control-rate interpolation, not audio-rate modulation. Whether a filter
sounds completely smooth also depends on smoothing in its receiving instrument.

## Which controls blend?

Instrument parameters must have confirmed numeric metadata. Enumerations,
switches and unknown targets remain stepped even when their reader says Linear.
The HB Render reader allows numeric velocity percentage, arp gate and strum
spread. Chord quality, inversion choices and other categorical destinations
remain stepped. FX and generator parameter routing is unchanged.

Numeric capability follows the exact lane target, is saved with the set and is
revalidated when parameter metadata is available. Old sets default to Step and
unknown capability until validated. Changing the target clears stale capability.

## Playback and editing

The existing automation owner emits values before note attacks. Stop, mute,
recording fallback and mode changes retain base-value restoration. Recording on
the destination uses the ordinary recording path. Routes, locks and target
changes invalidate cached neighboring points; recording also refreshes reads.
Undo and saved sets retain the reader modes. No separate sequence store or
playback scheduler is introduced.

The sampler caches its two surrounding points, so ordinary in-segment reads do
not rescan the clip or allocate. Tests cover fractional values, loop boundaries,
note resets, donor Fit/Timeline, recording, target validation, persistence, Undo
and shared controller settings.

## Next stages

LFO, Perlin and pressure position sources, signed speed, Smooth interpolation,
slew and continuous pitch output are still design work. See
[Continuous sequence playheads](sequence-playheads.md). This release establishes
the fractional numeric reader that those drivers can reuse.
