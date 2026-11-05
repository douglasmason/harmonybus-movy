# Physical acceptance: browser transport, queue handoff and audio

Status: **not run on physical Move**. Repository tests cannot prove device crackles are fixed. Nothing in this checklist installs, updates or flashes a Move automatically. Use an explicitly installed pair, record the actual HB/Movy versions, Schwung version, Set, tempo and connected controllers with each capture.

## Musical and persistence checks

| Check | Action | Expected evidence |
|---|---|---|
| Safe observation | Make a distinctive unsaved clip edit; connect paired Play/Stop and allow state polling; wait for autosave, then reload the Set | The edit survives; merely connecting never starts or stops playback |
| Transport | Play, Stop, then test Stop while recording | Existing native transport semantics and a completed take; no repeated or queued requests after loss |
| Plain Copy | Copy a playing queue to an empty conductor clip | Saved abstract progression; live queue continues; melody focus stays on its track |
| Explicit handoff | Copy → Step 9 **Copy + handoff** → empty destination | Saved clip takes over at the queue cycle start; no doubled attack, missing harmony or transport restart |
| Cancellation | Arm a handoff, then Undo, Stop, edit the queue or change its timing before the boundary | Pending handoff cancels; queue stays under its normal lifetime rules; Undo removes the saved edit |
| Boundaries | Repeat with short/long queues, Hold/Loop, anticipation and known irregular Observed timing | Accepted timing stays aligned; unsupported/nonrepresentable copies are refused rather than shortened |
| Network loss | Disconnect, lock the browser, lose Wi-Fi, change tools, then reconnect explicitly | Control is revoked; device playback is left alone; no replayed commands; pairing is required again |

## Audio comparison using the existing recorder

Use the same Set and tempo for each 35-second capture. Start with queued playback and no interaction. Repeat while playing Launchpad X with screen/LED feedback. Repeat with microphone listening enabled, then combine those workloads and paired browser observation. Include a handoff in the combined run. Record what was heard and the approximate event/time separately from the counters.

Open **Shift + Step 12 → Audio**, click twice to read the instructions and start the existing check. Its test tone temporarily replaces Movy's local output while processing continues; native Move instruments may still sound. Back returns to playing. After **LOG SAVED**, retrieve `audio-check-*.json` from `/data/UserData/schwung/` using your usual file access.

Analyze the saved files without connecting to the device:

```sh
python3 tools/audio-check/analyze.py /path/to/audio-check-123.json
python3 tools/audio-check/analyze.py /path/to/audio-check-123.json --json
python3 tools/audio-check/analyze.py /path/to/experiment.json --baseline /path/to/baseline.json
```

Keep raw reports and recordings. Compare late callback intervals, request timing and queue activation/recovery/late-change deltas within the same loaded module lifetime. A native queue clear during a successful handoff is intentional; a clear during plain Copy is not. Do not subtract lifetime maxima, sum shared conductor counters across tracks, equate an internal tone match with clean speakers, or treat request correlation as proof of causation. The report may omit the installed build, so record it explicitly.

The [reader guide](audio-check-reader.md) explains missing fields and counter limitations. Physical evidence is still required before closing the crackle/missed-change investigation.
