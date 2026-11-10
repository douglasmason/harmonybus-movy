# Cloud allocation reduction — hbclean.335

Cloud observation now serializes directly into one reusable DSP reply buffer.
Native `cloud_view`, track-specific views, and the Remote UI `state` snapshot
share the same formatter. The C ABI copies from that buffer into the host's
existing output; it no longer creates a String for each contact or point.
The 128-KiB reply buffer is allocated once when the Movy instance is created.
It covers the bounded stored point history, live overlay, grain markers and
escaped UI metadata. Short host buffers still fail without partially writing.
Internal callers requesting an owned String still receive one.

Cloud playback reuses its candidate, display and pending-note vectors. The
maximum four generated notes use a fixed array, also removing the small note
vector from other follower generators. Candidate sorting uses every Point
field, so equal keys are identical and allocation-free unstable sorting retains
the original seeded selection. Recording retains its point storage and extends
directly from fresh deposits instead of collecting another temporary vector.

The existing clock, input limits, note order, pressure, Hold, trail lifetime,
snapshot text, autosave observation semantics, Record, Undo and Bake remain
unchanged. Stored-history scans are retained; this change adds no index or cache
invalidation system. Playback vectors may grow when first encountering a larger
workload. This is not a claim that the entire callback is allocation-free.

## Verification

Normal native tests cover byte-identical snapshots against the previous
formatter, first-read allocation counts through the actual C ABI, maximum
stored-history/live-overlay sizes, escaped Unicode UI text, expiry, invalid
tracks, exact-fit output and untouched buffers on error. The grain renderer is
compared with a frozen hbclean.334 reference across 6,912 control, input-order
and boundary cases; maximum-size reused candidate rendering allocates nothing.
Existing engine tests cover recording, mixed activity, overdub, Hold, reload,
library export and Bake.

The release includes `cloud-benchmark.txt`: seven alternating desktop trials of
the old formatter/renderer and the new snapshot ABI/reused grain buffer. Counts
include allocations and reallocations; timing is the median per call. These
microbenchmarks do not measure the complete audio callback or physical Move.

Install using `douglasmason/harmonybus-movy`. The existing HarmonyBus pin is
unchanged. Device crackles and input latency remain subject to the existing
[on-Move audio comparison](audio-check-reader.md).
