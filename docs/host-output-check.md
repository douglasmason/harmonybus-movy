# Host output check (.193)

Step 12 CPU → click jog → click again to start. The check stops playback,
settles, starts Schwung's existing Resample recorder, and waits for samples.
It then generates a ten-second, same-polarity stereo 220 Hz triangle tone.
The source peaks are approximately 2048 left and 1024 right in signed PCM16.
No prepared clip, external controller, or listening judgment is required.

The complete capture takes about 12 seconds, followed by a few seconds of
incremental analysis. Leave pads released. Playback stays stopped afterward.
Jog cancels; Back can leave the check running. Unload requests recorder stop.
Musical input cancels the native tone. The tone has a ten-second sample deadline
and its profiling wrapper a fifteen-second wall deadline. The host recorder
requires UI stop; if the UI crashes, cancel the sampler from the host.

Download just `schwung/output-test-<timestamp>.json` in Schwung Manager Files.
The matching WAV remains on the device if more detailed analysis is needed.
The JSON includes internal tone integrity, recorder metadata, and every 100 ms
window's channel RMS, peak, 220 Hz component, maximum adjacent sample step, and
zero count. Analysis and JSON writing happen after recording is finalized.
`complete` means collection completed, not that sound is crackle-free.

The recorder must be idle and its source already set to Resample. The check does
not change sampler source, volume, duration, stems mode, user settings, or set
contents. Busy/armed samplers are rejected. An unavailable WAV (for example a
stems-only host configuration) is an explicit failure, never a clean result.

## Measurement boundary

In the inspected host source, capture is `unity_view`: native Move plus the
Schwung/Movy bus after master FX, before master-volume gain and speaker EQ.
Non-Link-Audio routing reconstructs native Move unity gain with a smoothed
inverse volume. Therefore this is not an exact copy of final DAC samples.

A clean recording with silent speakers implicates a stage after this capture
point, but still requires confirming installed-host behavior. A silent recording
with clean Movy PCM places the loss between those two observation points. A
corrupted recording can originate upstream or in the recorder itself: its ring
may discard data under load. Recording also changes system load. Max sample
steps and late callback counts are not audible crackle counts.

The spectral presence label is only a first screen: other sounds/effects can
contain 220 Hz. The raw WAV permits phase/continuity analysis without another
install. This short check resolves routing/silence; it does not replace a longer
intermittent-crackle test after the output path is established.

## Verification

`node tests/output_capture.mjs movy` exercises real controller/analyzer sources:
silence, known triangle tone, injected discontinuity, truncated WAV, preexisting
recording, stale tone status, asynchronous finalization, and cancellation.
Native `output_capture` and `tone_check` tests cover ten-second duration,
same-polarity samples, integrity checks, input cancellation, and restoration.
