# Read saved queue/audio checks

The offline reader summarizes an existing `movy-audio-check-v1` report. It does
not connect to the Move, start a test, or change playback. It requires Python
3.10 or newer, with no additional packages or device update.

From the repository root:

```sh
python3 tools/audio-check/analyze.py "/path/to/audio-check-123.json"
python3 tools/audio-check/analyze.py "/path/to/audio-check-123.json" --json
```

Both commands leave the input untouched. The first prints readable text; the
second emits `movy-audio-check-summary-v1` JSON. Invalid or unsupported reports
exit with status 2 and an error on stderr. Worker/isolation reports use separate
formats and are not accepted as quick checks.

## Capture on the device

Keep the affected set loaded and the queue playing. Open **Shift + Step 12** CPU,
turn the jog to **Audio** (`AUDIO CLICK:CHECK`), then click twice to read the
instructions and start the 35-second check. Back lets you play while it runs;
return to CPU for the result. The check temporarily replaces Movy's local stereo
output with its test tone while the processing workload continues. Native Move
instruments may still sound. See [the tone check's scope](automatic-audio-check.md).

After **LOG SAVED**, download `audio-check-*.json` from
`/data/UserData/schwung/`. Keep the original report for review. If saving fails,
photograph the results instead. Capture behavior and queue counters are described
in [queue diagnostics](queue-diagnostics.md).

## Read the result

- **Build:** copied only if the report contains `engineBuild`. Existing quick
  reports omit it, so `unknown` is expected. The reader cannot determine the
  installed build from the checkout, counters, or timestamp.
- **Internal tone:** `matched`, `mismatch`, `incomplete`, or `unavailable`.
  Matched requires a completed tone, checked samples, and zero mismatches. This
  checks the internal test tone, not the user's instrument waveform, host mix,
  driver, DAC, or speakers.
- **Callback timing:** field names ending in `Us` are microseconds; `elapsedMs`
  is milliseconds. `lateIntervals` counts callback intervals above 1.5 nominal
  block periods. `shortIntervals` counts those below half a period. Late groups
  join late observations within 100 ms. These are timing observations, not
  measured audible crackles or driver underruns.
- **At the largest interval:** the idle, preceding callback work, request work,
  largest individual request, and request key describe that interval. They are
  separate from the overall peak callback work and unrelated request maxima.
  A coincident request name does not establish the cause of a gap. JSON retains
  the raw nine-field request profile for further inspection.
- **Queue comparison:** reads the lowest-numbered track with supported
  diagnostics at both endpoints. The conductor counters are shared, so the
  reader never sums tracks. Differing sequential track snapshots and owner
  changes are called out. Status strings and both original selected snapshots
  remain in the JSON summary.

Queue counter changes are explicitly **conditional on the same loaded module
lifetime**. Version 1 has no lifetime identifier, so a reload can go undetected
even when every counter increases. A decrease in any counter or `maxLateBeats`
disables subtraction. Incomplete captures also never produce queue deltas.
Missing, null, or non-overlapping diagnostics mean unavailable, not zero.

`maxLateBeats`, `lastDueBeat`, and `lastActualBeat` remain lifetime observations;
the reader never subtracts them or attributes an old maximum to the capture.
Beat-based lateness can conceal a stalled beat clock. Recovery counts describe
requests to restore a missing selection, not why it disappeared. Queue snapshots
bracket the capture but are sequential and not sample-synchronous with timing.

The reader names the primary timing fields from the current 36-field audio
layout and tolerates the older 29-field layout with later fields unavailable.
The current quick-check writer uses 36 fields. JSON `null` at index 34 is normal:
the writer converts the textual request key to a number in that array and saves
the original string separately as `gapRequest`. Other missing metrics remain
unavailable. Use the original report for stage timings and additional evidence.

No anomalies in one capture means no measured anomaly in that window; it does
not establish that an intermittent audio problem is fixed.

## Test the reader

```sh
python3 -m unittest discover -s tools/audio-check -p 'test_*.py' -v
```

Fixtures are synthetic. Tests cover shared counters, missing diagnostics,
sequential reads, possible resets, incomplete captures, preserved lifetime peaks,
audio field positions, tone outcomes, and the read-only CLI. These tests do not
claim physical-device audio validation.
