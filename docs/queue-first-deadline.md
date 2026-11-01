# Movy 0.34.1-hbclean.297

The first queued chord now preserves its scheduled beat when serviced late.
Previously, seed activation replaced the deadline with the current beat. A
chord due at beat 4 but serviced at beat 9 therefore reported no lateness and
could precede an already-due beat-8 chord with a later history timestamp.

The native queue already assigns first deadlines during synchronization,
including stopped preload and resume. This release removes the redundant
timestamp replacement. The existing activation and catch-up policy remain
unchanged: no extra poll, retry, cache or timer is introduced.

A regression reproduces the beat-4/beat-9 failure before the fix, then checks
the corrected due/actual diagnostics, history order, harmony lookup and next
beat-12 cue. Existing sustained-loop, pause/resume and production-chain tests
remain in place. The allocation-free queue reads from .296 and UI improvements
from .294/.295 are included.

An audit also measured the existing boundary scan at roughly 108 ns per call
on the development machine with all 65 history and 16 pending entries. That
is not a Move timing measurement or evidence that hardware crackles are fixed.
The bounded scan is unchanged; this release fixes a reproduced timestamp bug.

Install with `douglasmason/harmonybus-movy` after verified publication.
