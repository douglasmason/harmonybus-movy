# CI and publication

Routine changes run focused regressions. No tests have been deleted.
Version-changing pull requests run the entire existing suite, guide/package builds,
and package checks. Apply the `full-ci` PR label (or run the release workflow
manually) for a comprehensive sweep at any time. Manual sweeps do not publish.

A version-changing push first looks for a successful same-repository PR run of
this workflow with a comprehensive artifact. It requires an identical Git tree,
matching version, verified source commit/run, and SHA-256 hashes for every release
asset. Only then does it publish the already tested files. Missing/expired or
mismatched artifacts fall back to the complete suite and build. Artifacts last
14 days. Ordinary same-version pushes never overwrite an installed release.

HarmonyBus focused checks cover core harmony, input ownership, latches, connectors,
and the canvas widget. Movy focused checks prepare the pinned integration and
exercise its browser/UI and real Schwung controls. Use a full sweep for wider
note/timing/transport changes; every installable version requires that sweep.
