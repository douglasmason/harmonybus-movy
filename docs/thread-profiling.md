# CPU-time capture (hbclean.189)

Install Movy hbclean.189 from `douglasmason/harmonybus-movy`, keep HarmonyBus 0.2.266 and the current Schwung host, then restart Move. Open Movy's Step 12 CPU page, press the main jog dial for instructions, and press again to start **CPU TIME**.

One automatic run lasts 65 seconds, with a sustained test tone for 60 seconds. Leave Launchpad set to X for this investigation; no physical Launchpad or note preparation is required. The test starts playback if stopped and restores the initial playing/stopped state afterward. It uses the loaded set's existing processing, adds no notes and changes no saved set or host settings. The generated tone replaces the audible callback output during the measurement, while normal processing continues underneath.

Back lets the capture continue while you play. Reopen the CPU page to see progress or the result. A jog click cancels. Recording, stopping playback, changing sets/tracks/layouts or changing host/Launchpad settings invalidates the run. The engine ends capture at 65 seconds even without UI polling. CPU-meter resets cannot extend that deadline.

When finished, open Schwung Manager → Files → **schwung/** and download the newest `thread-test-<timestamp>.json`. Attach that single file. No photo or by-ear A/B judgment is needed. Report writing occurs after measurement. Interrupted runs may produce a report explicitly marked incomplete.

The report pairs elapsed wall time and calling-thread CPU time for each measured operation: callback body, chain rendering, idle-chain MIDI ticks, HarmonyBus preparation, tone generation, tone verification, parameter reads, parameter writes and incoming MIDI. It retains means, worst wall time with CPU from the same call, worst CPU time with wall time from that call, and the largest paired wall-minus-CPU interval. Missing CPU-clock readings are marked invalid rather than treated as zero work. Read/write keys identify the worst elapsed call.

Large CPU time supports expensive computation in that measured scope. Large elapsed time with little CPU supports time spent off CPU, but does not identify the scheduler, lock, I/O or other cause. Nested stages must not be added. Other threads, including render helpers, are excluded from the calling thread's CPU time. Clock reads add some overhead, enabled only during this diagnostic.

The PCM oracle observes Movy's final callback buffer, not the host mix, audio driver, DAC or speakers. A clean internal PCM result cannot rule out downstream crackles. Callback-gap threshold counts are timing events, not crackle counts. This is a diagnostic release, not a confirmed fix.

The regular Step 12 graph still measures smoothed chain/send elapsed time against a fixed 70% of the block period. It is not total CPU usage or the same measurement as Schwung's host meter.
