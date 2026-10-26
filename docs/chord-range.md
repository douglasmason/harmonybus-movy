# Chord Range and Panel Controls

Movy 0.34.1-hbclean.261 integrates HarmonyBus 0.2.301 and preserves the Chord Loop, automatic Touch Phrases and Clip Variation dimension controls from the current main branch.

- Turn Range to move the highest chord tone through successive inversions. Four encoder units produce one step; accelerated packets are capped at one step. The display names the selected top note. Held chords retune through their existing note owners without enqueuing or recording another attack. Knob 8 still taps Harmony Off; Shift-touch restores inheritance/default range.
- Voicing includes Root Below. It adds the nearest root below the bass only when the lowest voiced note is not already the root. It leaves the upper notes and chosen/played top in place, and never adds an extra octave below an existing root bass.
- Jog left from the first panel of a selected group returns to its settings list with that group selected. This also works for the one-panel Setup group.
- Page segments fit above the shared widget boxes. Setup uses Cond, Bass, Comp and Mel across its first row, and Reset uses the shared Schwung action-button widget with press feedback.
- Chord-bank display transformations are cached separately from musical transformations. This reduces repeated work during sustained playback; it does not establish that Move crackles are fixed.

The settings panels continue to use Schwung's shared controller and Movy grid layout. Custom HarmonyBus drawing supplies navigation and musical context, not a second settings-widget renderer.

Validation covers the real shared-controller UI, rendered geometry and Reset ownership; native chord range/arp/release/key-mapping and root-bass behavior; selection persistence; Rust validation and queued recording/replay through the production host/native chain; and an ARM package build. Hardware listening remains required for the crackle report.
