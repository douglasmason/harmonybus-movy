# Move microphone realtime-status and session-isolation fix (.316)

This release tightens the already-installed Scale Finder native microphone
implementation without changing its pitch detector, K6 input diagnostics,
manual note overrides, note colors, or Copy/X behavior.

## Why

Schwung's pinned `plugin_api_v1.h` explicitly says that **get_param
is called on the SCHED_FIFO 70 SPI audio callback**, not on an isolated
control thread. The previous microphone `report()` allocated and formatted
a second `String` on each existing status poll, then appended it to an
already-allocated Movy status response. This is unnecessary work on the
most latency-sensitive path.

The microphone now appends its compact `mca`, `mcs`, `mcv` and `mcg`
fields directly to the **existing** status `String`, without allocating
a separate result. The wire shape and existing polling frequency are
unchanged. The appended fields remain compact atomic reads and bounded
formatting. This **does not** make the overall `status` getter allocation
free: upstream `engine.status()` and other chained status fragments
still allocate, and a `String` append can grow capacity. A larger
Move/Schwung status serialization overhaul is outside this patch.

## Rapid Sample stop/start isolation

A bounded atomic capture generation now advances on every actual
listening state transition, invalidating work that a low-priority worker
began during an earlier Sample session. The worker compares the captured
generation both before publishing levels and before marking a new result
sequence. It refuses to count results from an older generation as fresh
pitch analysis. Stopping retains the UI's previously accumulated
12-note evidence until explicit X. Starting resets the new raw input
window but performs no heap allocation, file operations, FFT, locks or
worker joining on the realtime audio callback.

The Linux `sched_setaffinity` declaration now uses the same
`*const u64` signature as Movy's existing rendering worker, with
an unchanged 128-byte core mask selecting 0–2 and leaving core 3 for
the SPI callback.

## Verification

Rust tests cover appended status grammar, existing-capacity append,
capture generation transitions, raw RMS/peak and silence, synthetic
single notes/chords, and disabled capture. The release pipeline also
checks controller state, compiled native tests, browser-host parity
and the final ARM64 binary against Move's device glibc 2.35 limit.

**No physical hardware latency or crackle measurements are claimed.**
The next hands-on test should install .316, open Session → Scale Finder,
touch K6 for input diagnostics, activate Sample, and compare the
analysis sequence, raw dBFS, pitch LEDs, and any audio crackling
with Sample off and on.
