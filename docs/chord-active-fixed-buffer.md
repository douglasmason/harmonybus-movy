# Movy 0.34.1-hbclean.302

The per-block active-chord check now uses a static parameter key and a two-byte
stack buffer through the existing chain API. Previously, every audio block with
a held chord allocated both a C parameter key and an owned response string to
read the one-character `hb_chord_active` flag. This separate check remained after
the queue cue reader became allocation-free in .296. It applies to queued and
immediate chord selections, including Joint Play.

The check still runs once per audio block while a chord is held, after the native
conductor phase. Only the exact reply `0` closes the host recording gate and
releases any derived Joint Play notes. `1` retains it; missing, invalid, or
truncated replies do not falsely expire a selection. There is no response cache,
extra poll, timer, or change to queue timing, recording, or pause/restart policy.

The allocation regression compares 40,000 reads of the old owned-key/response
path with the production flag reader, expecting 80,000 versus zero Rust heap
allocations. It also checks repeated flag changes, every supported response,
invalid UTF-8, missing replies and truncation. The existing production-chain
regressions cover sustained queue playback, silent pause/restart, chord recording,
and Joint Play release. The integration patch is applied to the complete
pinned source stack before compiling and packaging.

This removes a concrete source of avoidable audio-thread work. It does not prove
that every physical-device crackle is resolved. Existing saved Audio checks and
the [offline report reader](audio-check-reader.md) remain available for evidence
from the affected set.

Install with `douglasmason/harmonybus-movy` after verified publication advances
the installer pointer to this version. Publication does not install it on Move.
