# Chord Play typography and stock Schwung text

The Move has a 128×64 monochrome screen. Ordinary settings text should use
Schwung's native mixed-case font when the existing row geometry permits it.
The pinned shared controller remains the only settings controller and uses its
own compact fonts for dense cells; there is no new global font engine.

## Chord-specific musical notation

- **Chord spellings** (for example, `Dm` and `G7`) use Movy's existing
  compact 5-row musical notation atlas, not the oversized font.
- **Roman numerals** (for example, `ii`, `V7`, and `viio`) use the
  music-only native 8-row face, with deliberately short lowercase letters
  against taller capitals. When a cell is smaller than 17 pixels, it falls
  back to the same compact notation atlas.
- Both lines are independently measured and centered; an inset of at least
  two pixels separates the upper glyphs from the top cell border. They keep
  their individual case and musical meaning, and the redundant slot number
  is still absent.
- The custom faces in `integration/settings-case/hb_large_font.mjs` are
  restricted to music-only typography. The surrounding operation names now
  prefer the host's stock `ctx.print`/`ctx.textWidth` font. They fall back
  to the existing Schwung 4×5 or 5×3 compact fonts where two full lines
  will not fit. Other settings retain the shared controller's typography.

There is no bitmap upscaling: each glyph is rendered at its authored pixel
height. Text layout and music rendering are separate from the chord-selection
and queue-scheduling engine.

## Chord color and queue feedback

Chord function is resolved by HarmonyBus, not inferred from the displayed
chord spelling. Red distinguishes implied dominant function (including sus
and power voicings), violet identifies chromatic relations and
diminished/augmented or intrinsically dissonant implied triads. The native Move
palette indices are 65/126 for darker/bright red and 110/23 for
darker/bright violet. The currently sounding chord uses white and pulses,
including when its queued entry has already been consumed. Remaining queued
chords pulse in their harmonic colors.

The paint path resolves the active chord once per frame rather than once
per LED; identical snapshot text is not reparsed or JSON-serialized on
every controller tick. Value-change detection no longer serializes a
full parameter page twice per tick. These are UI-path reductions, not
evidence that the physical Move's missed chord changes, crackles, or
accumulating blue note trails have been fixed.

## Verification

The Chord Play regression covers large-versus-compact musical glyphs,
a clear top inset, touch feedback, red/violet resolved-harmony colors,
and simultaneous white current-chord/colored queued-chord pulse across
step and knob LED addresses. Playback correctness and audio crackles
still need measured physical-device validation using the Audio diagnostic
check described in `docs/queue-diagnostics.md`.
