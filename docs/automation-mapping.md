# Movy 0.34.1-hbclean.301 — verify complete automation mapping identities

The background mapping check accepted a host name if it contained both the
expected component and parameter anywhere. `fx1: gain_db` therefore passed for
`fx1:gain`, as did `midi_fx1: gain`. A stale mapping could keep automation pointed
at another parameter without triggering recovery.

The check now compares the complete component and parameter, allowing whitespace
around the separator. Schwung 1.7.3 (`a6f7ec9`) and 1.8.2 (`35f401c`) use the
same `chain_host.c` implementation: `knob_N_name` returns `target: param`.
No additional host query or version check is needed.

The old check also always inspected the first assigned lane. An intact first
mapping could conceal a broken later mapping indefinitely. The existing
round-robin track check now advances through that track's chain lanes, skipping
holes, mixer fields and abstract generator controls. A mismatch uses the same
chain-only repair and bounded metadata recovery introduced in .300. Reset clears
both traversal cursors so the next Set starts with its own first mapping.

The limit remains one host-name read per verification call, with no reads on
tracks without chain lanes. The existing 400-tick interval is unchanged. A full
16-track/eight-lane bank takes 128 verification calls to cover: this is a slow
background audit, not immediate reload detection. Known assignment/restore paths
continue to perform their existing event-driven work.

Regression tests reproduce the substring failure, cover component/parameter
collisions and accepted spacing, find a broken later lane behind an intact first
lane, and exercise all 128 mappings, virtual lanes, holes, reset and stable
post-repair behavior. Both host matrices, the browser/native suites, QuickJS and
ARM package remain release checks.

Host-native song-data recovery, Movy's parameter lanes and abstract musical
automation retain their separate representations. No saved lane or clip data
is rewritten. No physical Move installation, browser connectivity or trial
audience change is performed; hardware latency and crackling remain unmeasured.
