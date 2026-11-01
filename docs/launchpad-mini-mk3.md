# Movy 0.34.1-hbclean.303 — Launchpad Mini MK3 profile

Select **Launchpad → MINI MK3** in the existing release settings. Mini MK3 now
uses the shared eight-row harmony grid, operation buttons, latch modifier,
note ownership and RGB feedback. Existing OFF, LEGACY and X settings keep
their stored values.

The profile follows Novation's official [Programmer's Reference Manual](https://downloads.novationmusic.com/novation/launchpad-mk3/launchpad-mini-mk3-0),
pages 6–7, 10 and 14. Mini uses product ID `0D`, enters Programmer mode through
command `0E`, and receives the existing RGB command `03` with its own header.
The profile returns Mini to Live mode on shutdown or profile change. It omits
the X-only pressure setup; Mini has no velocity or pressure sensitivity, per
Novation's [comparison](https://us.novationmusic.com/launchpad).

There is one surface adapter, queue and scheduler. Mini shares the X grid and
LED timing, including changed-only output and drain time before another RGB
frame. Input still uses the existing source-local cancellation and retry
serials. No extra polling, host API, musical model or rendering framework is
introduced. The concurrent .302 audio-block allocation fix is retained.

Regressions cover all 64 grid addresses, exact setup and teardown messages,
73-cell RGB output, USB backpressure, top-button/latch operations, repeated
notes, release after a track switch, held-note/control cancellation during
profile changes, and batched-input retry identity. The Launchpad suite now
triggers both Schwung 1.7.3 and 1.8.2 compatibility matrices for profile edits.
Browser, native, QuickJS and ARM package checks remain required by the release
workflow.

Schwung's 1.8.2 cable-zero filter fixes its own held-step/control bookkeeping.
Movy still supplies the surface routing and lifecycle above. Mini needs its
MIDI interface, rather than its DAW interface; the existing channel-1 routing
requirements are in [the surface guide](launchpad.md).

Validation is simulated. USB enumeration and appearance on an actual Mini
remain to be checked. Physical Move latency and crackling are unmeasured.
This release performs no hardware installation or upgrade and does not change
browser connectivity or the trial audience.
