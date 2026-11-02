# Queue footer key-map isolation

With Key Center active, reading a long Chord Play footer previously replaced
the four key-mapping cache entries used by music. The footer could recalculate
the whole progression at each refresh and leave playback to rebuild its own
entries afterwards.

The pinned HarmonyBus core now uses eighteen fixed, thread-local preview
entries for queue names: sixteen chord slots, current and next. It uses the
existing mapping helper, which checks the complete harmony, key context and
dominant policies on every read. Queue ownership, timing, cursor and status
format are unchanged. No additional polling or queue servicing is introduced.

The regression fails on the previous core. It compares cold and warm footer
names to musical mapping through key, scale, transpose, dominant policy,
register and spelling changes; it covers waiting, playing, pause/resume and
the largest Hold footer (current plus sixteen future chords). It also asserts
that status reads leave both the timeline and all four musical cache entries
unchanged. Existing 2,048-change late-service and bounded-history checks pass.

In a desktop microbenchmark with sixteen queued chords and active Key Center,
10,000 status/musical-read pairs previously caused 160,001 musical-cache writes.
After warming the preview slots, they cause zero. Runtime in that case fell
from approximately 45 microseconds to 8–10 microseconds per pair. These are
isolated function measurements, not a physical Move audio measurement or proof
that all crackles are resolved.

Install through `douglasmason/harmonybus-movy`. The release workflow verifies
the packaged ARM binary and published archive checksum before advancing the
installer pointer. For a device comparison, repeat the same queued progression
with Key Center on and off, then pause/restart it; compare audible artifacts
and retained queue feedback separately.
