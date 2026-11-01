# Movy 0.34.1-hbclean.294 — live settings and balanced lowercase

Ordinary lowercase bodies now sit one pixel below capitals: four rows in the
five-row fonts and six in the seven-row value font. Ascenders `b d f h k l t`
reach the full capital height. In particular, `c o e s` share the same top and
baseline. Capitals, glyph advances and cell dimensions are unchanged. Roman
numerals and chord spellings retain the separate contrasting notation font.
The existing shared renderer still draws every settings panel.

Normal Play HB knob pages now poll the bundled Schwung controller independently
of Movy's legacy model dirtiness. Previously an external parameter edit could
leave the displayed value stale indefinitely if the other model's bank did not
change. The regression reproduces Rotate remaining at `0` after a host edit to
`2`; it now updates and repaints without a physical control gesture.

The existing diagnostic adapter also owns ordinary HB knob values, using the
upstream controller's bounded cursor at 25 ticks per second. This is a polling
budget, not a promise that every field is refreshed at 25 Hz. Unchanged values
do not repaint, and the covered model retains its lifecycle without duplicate
value polling. Rendering does not run a second controller tick. Modulation
values/indicators, enum expiry, reload and clock rollback remain live. Failed
reads retain accepted values; touches retain their first cached paint. Stock
modules, non-knob pages and the fallback model keep their existing paths.

No new renderer, host-version checks, transport or automation representation is
introduced. Host-native parameter modulation remains distinct from abstract
musical clip automation. This includes .293's arrow/octave cues and the prior
queue fixes. Browser connectivity and private audience are unchanged.

Validation covers all 26 lowercase glyphs across five font paths, the actual
app/controller with a quiet legacy model, host modulation, failed reads,
recovery, reload, popup expiry, touch/release and fallback polling. CI also
builds against exact Schwung 1.7.3 and 1.8.2 sources, with native/audio,
browser/WASM, ARM and QuickJS checks. Work counts are simulated; no physical
latency or crackle improvement is claimed and no Move installation is performed.
