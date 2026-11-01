# Movy 0.34.1-hbclean.297 — shared parameter automation targets

Creating parameter automation from a named choice could seed the lane at its
minimum: a control displaying `Square` (option 2) passed value 0 to automation.
Numeric option names such as `4` were treated as numbers instead of their option
index. Child controls could also offer the generic `gain` key instead of the
selected pad's concrete `p02_gain` target.

The existing Schwung page adapter now consumes the bundled controller's cached
cell description and metadata. Its enum index already follows the learned wire
format, and its full key already resolves the selected child instance. The same
descriptor feeds parameter recording, held-step locks and LFO assignment.
No second enum parser, child-key resolver, host-version branch or settings
renderer is introduced. Describing a control adds no host reads or writes.

Readouts, triggers, file selectors, explicitly non-automatable controls,
zero-width ranges and invalid/unavailable values cannot seed a parameter lane.
Accepted cached values remain available through transient failed reads; a valid
value restores eligibility after an unresolved initial read. An already captured
descriptor retains its original pad when the current selection changes.

These are Movy's lanes targeting component-qualified host parameters. Schwung's
native song-data/p-lock recovery and Movy's abstract musical clips and their
operation/event representations remain distinct and unchanged.
Existing lane identities and saved data do not change. This fixes new target
selection and lane seeding; it does not rewrite previously recorded values.

Regression tests exercise the actual bundled controller, child selector,
automation registry and emitted `alabel`/`abase` commands. They cover named and
numeric-named enums, ordinary numbers, access flags, invalid values, per-pad
ranges and zero descriptor I/O. Full browser logic and ownership/responsiveness
checks run alongside CI against exact Schwung 1.7.3 and 1.8.2 sources, the native
production chain, QuickJS startup and the ARM package. The release includes
.296's fixed-buffer queue reads and .295's balanced lowercase and live settings.
No physical latency or crackle improvement is claimed; no Move is installed or
upgraded, and browser connectivity and trial audience are unchanged.
