# Capture-bound cloud movement

Remote UI and standalone cloud movement now belongs to the cloud captured when
its gesture began. After release, Clear, Stop, or generator cancellation followed
by a new capture, delayed drag, X/Y slider, and Center packets cannot move the new
cloud. Re-capture is detected even when Hold remains on across successive polls.
A fresh gesture controls the new capture normally.

Cloud Hold retains its shared operation behavior. Manual and operation owners
share one capture; releasing only one owner does not invalidate an ongoing
movement while the other owner still holds it. Native Move knobs, pad input,
Launchpad pressure, axis swapping, wrap/bounded edges, and trail rendering keep
their existing paths.

The engine assigns a transient capture ID and checks it when a remote movement
executes. It is not saved in clips or Sets. Recorded motion still deposits through
the existing cloud recording path, and replay and Bake retain identical MIDI.
The versioned Hold snapshot disables movement controls on older hosts; drawing
remains available. Cached older editors cannot send unbound movement commands.

Validation includes stale packets after release/Clear/Stop/cancellation, engine
replacement, independent operation ownership, finger and slider re-capture races,
exact recording/replay/Bake, native sequencer/DSP tests, controller regressions,
and the compiled browser suite. Physical Move/Launchpad testing remains a device
check.
