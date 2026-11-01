# Movy 0.34.1-hbclean.291

This release makes the merged Chord Play queue fixes available through the
installer. It retains the mixed-case fonts, musical notation, tonic-position
highlight and Schwung host compatibility from .290, plus the merged browser
workspace and device-parameter controls.

- A preloaded four-chord loop displays its full cycle, including the current
  chord, rather than counting only the three pending entries.
- All chords belonging to the active loop retain queued pad feedback after
  their first activation.
- Chord Play owns its footer. Generic clip/performance footers and stale enqueue
  messages no longer overwrite it; the position/count prefix stays consistent.
- A due chord takes precedence over restoration of a lost live selection.
- Current-harmony reads no longer rescan the entire queue history.

No Harmony clears the live selection and queue. It does not restart the old
loop or switch Queued mode to Immediate. During playback, recorded conductor
content can resume after the live selection is cleared.

The native regression covers 2,048 changes with intermittent late service and
bounded history. The production-chain regression covers 128 bars, with two
clean loops followed by repeated queue, chord-bank and harmony snapshot reads
at approximately 20 Hz. It checks that those reads neither advance the queue
nor generate MIDI, and that each bar retains its intended chord and deadline.
Existing callback/request profiling is captured before and after history fills;
this adds no production timer, polling or logging.

These tests do not reproduce physical Move scheduling, USB controller traffic,
or proprietary synth load. The reported intermittent lag and crackles remain
unconfirmed on hardware; this release is not a claim that their full cause has
been identified. The installer pointer advances only after the main-branch
build, regression suites, ARM package and downloaded checksum verification
succeed. Publishing does not install anything on the device.
