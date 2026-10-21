# Disconnected Launchpad isolation

Open Movy's CPU diagnostics (Shift + Step 12), click the jog to see the instructions, then click again to start. No Launchpad needs to be connected. Stop recording first. The test starts playback of the loaded set if needed and supplies a known sustained tone, so an empty set also works; existing playback provides additional workload. Keep track/layout settings stable. Back lets you play while the test continues; return to CPU diagnostics for the result. A running-test jog click cancels it.

The four conditions each capture 35 seconds, about two and a half minutes total:

1. Off: no Launchpad routing, previews, or LED messages.
2. Routing: external-surface/channel claim only, with no previews or LED messages.
3. Previews: native Launchpad preview requests only, without the routing claim or LED messages. Shared Move-preview reuse is deliberately bypassed to measure the request workload.
4. LED send: programmer-mode initialization and a fixed four-Hz, 64-pad RGB pattern, without routing or preview requests.

Move previews continue in every condition. Launchpad physical input is ignored during isolation. Each running screen names its condition. The saved Launchpad setting is untouched and resumes afterward; transport stops afterward only if the test started it. Native audio capture ends independently of the UI. A stale status, stopped transport, recording, or changed set/track/layout fails the comparison rather than reporting a complete result.

## Download one report using your phone

After completion, look for `LOG SAVED` on the results screen. In Schwung Manager, open **Files**, navigate to `UserData/schwung`, and download the newest `x-test-<timestamp>.json`. Attach that file to the conversation. The full path on the device is `/data/UserData/schwung/x-test-<timestamp>.json`. The test writes once after all measured phases and checks the file by reading it back. If writing fails, the screen says `LOG FAILED - PHOTO THIS`; the in-memory summary remains available for a photo.

The report contains all four native audio/request/tone summaries and UI preview-read count, maximum preview-read elapsed time in milliseconds, accepted outgoing USB-MIDI packet count and refused send attempts. An accepted send means queued, not delivered to hardware. Existing `cpulog` output also remains available. The JSON contains no clip contents and no audio recording.

## Interpretation

`GAPus` is the largest callback interval, `LATE` counts intervals above the existing lateness threshold, and `WAITms` is the maximum elapsed synchronous Launchpad preview read (including response waiting). These are not measured crackle counts. PCM results check the internal generated tone before host/DAC output, not the physical sound. LED-only uses a controlled pattern rather than reproducing every real harmony animation. Fixed-order, single-pass comparisons can be affected by intermittent unrelated activity: an apparent winner needs confirmation.

This build does not add a physical input-edge trace or certify where a release was lost. Native regression tests cover ordered short release/repress pairs through HarmonyBus and the full Movy chain, but do not emulate Move's proprietary instrument or physical MIDI delivery. Schwung host code is unchanged.
