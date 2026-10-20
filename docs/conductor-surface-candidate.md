# Conductor/surface candidate

This incremental branch is based on `work/shared-core-fm1` (`6a76a909`), the
actual hbclean.202 implementation. Main only carries stable installer pointers.

The candidate workflow pins HB `1021d89524dc1fd56321044df648b693e57f0c8e`
(0.2.282-dev.1) and packages Movy as `0.34.1-hbclean.203-dev.1`. It copies the
canonical shared surface implementation from that HB commit using the existing
integration patch. It does not carry another copy of the transport source.

New adapter regressions reject invalid tracks and events missing required fields
before they enter the shared queue. The existing checks continue to cover
zero-velocity note-offs, per-source ownership, retry identity, overflow fences,
host channel claims and Launchpad conflicts. These tests run against the actual
assembled browser implementation, not a substitute MIDI adapter.

HB's new `harmony_source_snapshot` parameter is available through the existing
hosted parameter transport. See HB's `docs/conductor-surface-audit.md` for the
schema, capability audit, inversion correction and measured desktop timings.
No new periodic reads are added to Movy's UI tick.

Local validation: TypeScript check, browser build, FM-1, Launchpad, Grid,
Joint Play, Joint panels and full logic checks pass. The candidate CI additionally
runs Rust recording/routing tests and builds the ARM package. Local environment
does not provide the Rust/ARM toolchains; CI results are required before calling
the package ready.

Stable installer pointers remain on hbclean.202. No Move deployment or FM-1
flash is performed. Apply HB's existing hardware-specific acceptance plan before
installing either candidate on a device.
