# Worker comparison (hbclean.188)

Open Movy's CPU page (Step 12), press the main jog dial, then press again to start **WORKER TEST**. It runs parallel, temporary serial, then parallel again: three 35-second captures, about two minutes total. Each phase has a 30-second sustained test tone. No listening comparison or series of photos is needed.

The test automatically plays the currently loaded set if stopped, and returns it to stopped afterward. It generates its own audible tone but uses the set's existing instruments and clips as the render workload; it does not add notes, change slots, or overwrite musical state. A completely empty/sleeping set may not exercise any helper rounds, which is explicitly reported as inconclusive. Leave Launchpad at the setting being investigated (X for the current issue); keep track/layout/settings fixed. A physical Launchpad is not required.

The screen labels PARALLEL 1, SERIAL, and PARALLEL 2 while running. A jog click cancels; Back lets it run while you play. Stop, recording, set/track/layout or host/Launchpad-setting changes invalidate the comparison. The native engine restores normal rendering at the 35-second phase deadline even if the UI stops responding. A serial callback exceeding twice the block budget, or two consecutive over-budget callbacks, aborts forced serial and marks that phase invalid.

After completion, download `worker-test-<timestamp>.json` from Schwung Manager's Files → schwung folder and attach it. One file contains all phases, the loaded Movy diagnostic build, active-track HarmonyBus version (or unknown), fixed setup, PCM checks, callback timing, parameter-request timing and worker timing. An interrupted run may save an explicitly incomplete report. No report files are written during a measured phase.

Worker metrics separate main-lane execution, join waiting, dispatch-to-helper-start delay, and helper execution. They are elapsed wall times, so execution includes preemption. Independent peaks cannot be summed. Parallel round count includes both chain and send rounds; it is not a callback count. The repeated parallel phase helps identify variation over time, but phases can still play different parts of a musical set.

The tone's PCM oracle checks Movy's final callback buffer before handing it to Schwung. It cannot observe downstream host buffering, DAC output or speaker crackles. Late callback counts are timing events, not audible glitch counts. This release adds diagnosis; it is not a claimed crackle fix and does not change Schwung.

The ordinary Step 12 meter measures chain/send rendering and divides its smoothed wall time by a fixed 70% of the audio-block period. It is not total system CPU or all callback work. Schwung's broader host timing and system CPU percentages have different scopes and denominators; compare durations and deadlines, not the percentages directly.
