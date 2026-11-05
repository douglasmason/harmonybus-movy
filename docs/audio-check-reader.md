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

## Compare a baseline with an experiment

```sh
python3 tools/audio-check/analyze.py "/path/to/launchpad-on.json" --baseline "/path/to/baseline.json"
python3 tools/audio-check/analyze.py "/path/to/launchpad-on.json" --baseline "/path/to/baseline.json" --json
```

The positional file is the **experiment**; `--baseline` is the reference. Neither
file changes. JSON uses `movy-audio-check-comparison-v1` and retains both summaries
alongside the comparison. Late/short intervals and over-budget callbacks are
normalized by their own counts; late groups use recorded elapsed time. Changes
are experiment minus baseline, in percentage points for percentages. Zero
baseline events do not produce an infinite ratio. Missing or zero exposure stays
unavailable. Incomplete captures have no comparable timing rates.

Peaks appear side by side without subtraction. Queue counts use each report's own
before/after changes, conditionally on the same loaded module within that capture.
Queue snapshots have no measured duration of their own, so those counts are not
normalized by the narrower engine timing window.
Lifetime totals from separate files are never subtracted, and shared conductor
counts are never summed. An observed HB version change disables queue subtraction;
reloading the same version can still go undetected. A successful handoff
intentionally clears the queue, so that counter alone is not a fault.

Compare the same Set and tempo, changing one workload at a time: Launchpad,
microphone listening, or paired browser observation. Repeat a baseline to check
for variation. From hbclean.322, reports include native build, Set UUID, tempo,
active track, keyboard mode/layout, Launchpad configuration/adapter activity,
track-hosting flags and native microphone state at both endpoints. HB versions accompany
the queue snapshots. Missing or differing context is flagged. Matching endpoints
do not prove settings or workload stayed unchanged in between. Host version,
browser subscription activity and audible symptoms still need separate notes.
The comparison does not assign an audio-quality score or infer the cause of a gap.

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

- **Build:** copied only if the report contains `engineBuild`. Reports before
  hbclean.322 omit it, so `unknown` is expected. The reader cannot determine the
  installed build from the checkout, counters, or timestamp. New native builds
  use the candidate source version (or explicit build version), not a lagging installer pointer.
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
