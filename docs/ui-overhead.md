# Chord Play UI overhead — Movy 267

This update includes the A/B Fill memories from 266.

Chord Play reuses its 21-slot request until a definition changes and compares
incoming native snapshot text before parsing it. Edits, reset, restore,
conductor changes and Harmony Off invalidate the appropriate state. Native
harmony calculation and musical snapshot polling keep their existing cadence.

Queued mode polls the queue without also fetching the hidden Harmony Overview.
The overview reads effective harmony, key, live override and recorded-next
state when requested. Repeated identical chords still repaint when the queue
cursor advances. The older/missing queue-status fallback remains available.

Routing checks run every 250 ms, with immediate invalidation for local routing
edits and Undo. This retains discovery of changes made outside Chord Play.
Chord Play skips its middle pad-color pass, retaining the priority pass before
control traffic and final reconciliation after sequencer/UI updates. Mode
sweeps, immediate gesture feedback and rejected LED-write retries are retained.

The UI profiler now starts before priority pads and all mode ticks, and ends
after interface-usage work. Phase timing includes Chord Play, Settings, Field,
Launchpad and usage persistence. Previously these stages were outside the
reported tick duration, even though their host calls appeared in IPC counts.

## Repeatable call-count result

The regression uses the real browser build and shared controller with a mock
host, unchanged snapshots, a hidden overview and 100 ticks over one simulated
second. These are work counts, not device timing or audio measurements.

| Work per simulated second | 265/266, playing | 267, playing |
| --- | ---: | ---: |
| 21-slot request builds | 100 | 0 |
| Bank snapshot parses | 20 | 0 |
| Parsed-bank JSON serializations | 40 | 0 |
| Native bank snapshot reads | 20 | 20 |
| Routing value reads | 20 | 4 |
| Hidden overview field reads in Queued mode | 40 | 0 |
| Queue snapshot reads in Queued mode | 10 | 10 |

Stopped playback retains four bank-snapshot reads per second and four routing
reads. Unchanged request builds and snapshot parses are also zero when stopped.
The ordinary Chord Play tick has two pad-color passes instead of three; input
gestures and mode transitions may legitimately add a priority repaint.

## Validation and limits

New regressions exercise every chord-editor field, reset, restore, owner
changes, local and external routing, Undo, malformed/unavailable snapshots,
Harmony Off, queue-cursor changes, fallback status and clock rewind. A full
app-tick test injects 7 ms into Chord Play and 10 ms into usage persistence and
checks that the profiler reports both phases and the complete 17 ms duration.
Existing queue, range, shared-panel, input, LED-retry and musical suites remain
part of release verification, along with native/ARM builds and QuickJS startup.

This release reduces UI work. It does not establish that hardware crackles are
fixed. It leaves the DSP and native harmony solver unchanged. The next distinct
audio-thread investigations are clip-content hashing as clip size grows and
unchanged follower-context reads/parsing. Those need their own measurements and
invalidation tests before adding caches.
