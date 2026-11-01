# Movy 0.34.1-hbclean.292 — diagnostic polling

Normal Play diagnostic settings pages now use the existing shared page adapter
as their single value owner. Snapshot acquisition keeps its 40 ms cadence, but
unchanged or unavailable data no longer requests a complete screen redraw.
Changed fields publish atomically and request a redraw immediately. The covered
control model still processes its lifecycle and queued edits while skipping
its separate value polling; ordinary editable pages resume those reads on exit.

Controller ticks continue at the diagnostic cadence even with a quiet screen,
so deferred writes, metadata checks and retry handling continue. Enum popups
expire and repaint the underlying page. Touch feedback takes its cached frame
first. Invalid or partial snapshots retain the previous complete frame; reload,
page changes and clock rollback do not freeze acquisition. Performance screens
keep their existing tick ownership, and stock modules keep normal polling.
There is no new renderer, host-version branch or browser/device protocol.

The real-app regression reproduced **25 full-page redraws per simulated second**
on an unchanged Normal Play follower-root page before the change. With this
change, 100 ticks still make 25 snapshot reads and 25 controller ticks, with
**zero full-page redraws and zero covered-model value polls**. Changed snapshots
still paint immediately, and popup expiry paints once. This is a work-count
comparison, not a physical latency or crackle measurement.

Verification covers complete and malformed snapshots, recovery, clock rollback,
same-kind reload, lifecycle ticks, popup expiry, actual touch/release rendering,
ordinary control polling restoration, settings, ownership, and stock controller
regressions. CI exercises both exact Schwung 1.7.3 and 1.8.2 builds, production
native/audio tests, ARM packaging, browser/WASM integration and QuickJS startup.

The package also includes the separately merged queue timing/history/feedback
fixes released in 291 from Movy #187/#189 and HarmonyBus #98, plus the typography, operation-cell and
tonic-position improvements in 290. The concurrent browser workspace/connectivity
changes are preserved. No physical Move deployment or private-audience change
is performed.
