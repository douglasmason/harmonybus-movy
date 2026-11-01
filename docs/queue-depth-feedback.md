# Movy 0.34.1-hbclean.299

An empty or cleared Touch Phrase queue now shows `Fill 0 Release` consistently.
The missing-snapshot fallback previously converted the named setting to a
number, failed, and displayed `Fill 0/2`. That incorrectly implied two chords
were needed even though release of the touch phrase controls queue activation.

The fallback now recognizes the native Touch Phrase value as depth zero, just
as a valid queue snapshot already does. Numeric depths and the default for an
unavailable setting retain their existing behavior. A valid native snapshot
remains authoritative for queue position, count and depth.

The regression reproduces the old `Fill 0/2` result and checks cleared queues
while stopped and playing, missing/empty snapshots, release wording, restored
loop feedback and unchanged fallback-read counts. Existing polling frequencies,
unchanged-bank reuse and hidden-overview read suppression remain covered.

This changes feedback only. It adds no host reads, timer, cache or audio work
and does not claim to resolve the remaining hardware crackles. All queue and
performance fixes through .298 are included.

Install with `douglasmason/harmonybus-movy` after verified publication.
