# Audio capture context and comparison

Movy hbclean.322 makes the existing 35-second quick audio check easier to compare.
Each saved report now records the native build, Set UUID, tempo, active track,
keyboard mode/layout, Launchpad configuration/connection, track-hosting flags and
microphone state at its two boundaries. HarmonyBus versions accompany the queue
snapshots. No extra polling or file writes occur during measurement.

The existing offline reader accepts an experiment plus a baseline:

```sh
python3 tools/audio-check/analyze.py experiment.json --baseline baseline.json
```

Add `--json` for both summaries and the structured comparison. Old reports remain
supported with missing context marked unavailable. Rates account for recorded
callback counts or duration; independent peaks remain separate. Queue counters
are compared only within each capture, conditionally on the same module lifetime.
An observed HB version change prevents subtraction. A reload of the same version
can still go undetected, and matching setup endpoints do not prove a constant
workload between them. Host version, browser polling and audible symptoms still
need separate notes.

The [reader guide](audio-check-reader.md) describes the units and limitations;
the [hardware checklist](hardware-acceptance.md) remains the physical acceptance
plan. Synthetic reader and shared UI regressions validate report handling, not
device audio. Publication does not install software on Move or establish that
crackles are fixed.
