# Audio-thread context allocation — Movy 269

Movy now reads the native follower context into a reusable fixed buffer and
borrows that text for immediate engine consumption. Static C parameter keys
replace temporary key allocations. Humanize settings use a fixed four-element
array instead of temporary vectors. This covers render-block reads, note-on
capture and command processing, including changing keys/settings.

The context is still read at the existing call sites. Its v2 response also
drains queued shared recording events, so caching the complete response or
skipping repeated settings would lose events. No additional context cache or
polling interval is introduced. Clip reconciliation still sees changes from
restore, Undo, newly inserted content and drum-role changes on each call.

The 8,320-byte buffer is allocated with the chain manager. It accommodates the
native queue's 64 events, each bounded by its 128-byte serialization buffer,
plus the settings headers. Missing v2 support retains the legacy fallback;
invalid/truncated responses are rejected instead of exposing stale bytes.

## Verification

Native regressions compare the prior parsing/application behavior against the
production path, including malformed input, limits, role changes, loaded clips,
Undo and repeated identical recording events at different positions. A
thread-local allocation counter requires zero temporary allocations during
1,000 complete read-and-apply iterations for both unchanged and alternating
contexts. Recording new musical content may still allocate its stored events;
the zero-allocation requirement applies to the context transport/parser work.

The release benchmark runs 50,000 iterations per case and records the prior and
current time/allocation counts in `context-benchmark.txt`. It uses the production
reader and engine with a mock in-process parameter source. The test-only prior
path retains the previous string and vector operations for comparison. It does
not model Move scheduling or measure physical audio glitches.

Release verification also runs the existing UI, native sequencer/DSP and
production-chain regressions, builds ARM64, checks QuickJS startup, and verifies
the uploaded package checksum before advancing the installer. The engine
version changes so an existing session reloads the corrected DSP.

## Clip-snapshot investigation

Clip snapshots hash note, lock, operation, recipe, gate, shared-event and lane
content. The existing sparse/dense benchmark confirms that this cost grows with
clip contents. A cached hash needs reliable invalidation for every edit,
recording, Undo, load and lane change; public mutable clip fields currently make
that a broader change. This release leaves that path intact rather than adding
a cache that could reuse stale lookahead. The snapshot benchmark remains in
release verification for the next increment.

This release includes Smart Approaches from 268 and the earlier UI overhead,
mixed-case settings and A/B Fill improvements. Crackle improvement still needs
confirmation on Move; no physical-device deployment is performed.
