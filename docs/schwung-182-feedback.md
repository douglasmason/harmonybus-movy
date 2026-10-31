# Movy 0.34.1-hbclean.290

Ordinary interface text keeps mixed case with normalized lowercase height.
Existing capitals remain unchanged. Roman numeral lines deliberately retain
the smaller lowercase forms, including `ii` and `vii`, so chord quality remains
clear. Labels, values, chord names, queue text and ordinary footer words use
the normal font. All drawing still uses the existing shared settings renderer.

Horizontal pad-position changes briefly highlight the input tonic for 1.2
seconds. Approach layouts highlight its resolving column; fourths layouts
highlight actual tonic pads. Move, Joint Play, Launchpad X and original Mini
share the cue. Held notes retain their onset ownership. The cue adds no host
polling or separate animation timer.

This package also includes the verified Schwung 1.8.2 shared controller on
both 1.7.3 and 1.8.2 hosts, optional-callback transport attachment with deferred
unavailable-clock handling, and the centralized HarmonyBus tempo guard in its
embedded core. See [the host audit](schwung-182.md) for upstream fixes versus
remaining module responsibilities. Native host automation and abstract musical
clip automation retain their separate representations.

Validation includes five-font pixel bounds, explicit Roman selection, actual
LED packet decoding for Move/Joint/X/Mini, complete browser logic, native/audio
regressions, ARM packaging, and device-bundle startup without optional host UI
libraries. Host compatibility tests exercise both exact Schwung revisions.
Physical display appearance, audio crackling and latency still require device
measurements. No device installation or host upgrade is performed by this release.
