# Preview isolation maintenance test

Available from Movy hbclean.182; hbclean.183 adds the third condition and larger
running labels. No host changes or separate diagnostic build.

1. Leave the affected set loaded with Launchpad enabled normally.
2. Open diagnostics with Shift + Step 12. Press the jog knob to see instructions.
3. Press it again to start. Playback starts automatically if it was stopped.
4. Listen hands-off through A NORMAL, B LP PAUSED and C BOTH PAUSED, 20 seconds
   each. A large TEST A/B/C label and countdown identify the current observation;
   NEXT labels mark the brief settling transitions. Per-surface ON/PAUSED lines
   describe exactly which preview readers are running. Audio continues throughout.
5. Photograph PHOTO 1/5, then press the jog for PHOTO 2/5 through 5/5.
   Include whether A, B or C crackled more. Back exits.

The test uses the currently loaded clips and instruments. It does not create a
synthetic set, populate empty clips, switch clips, or generate notes. A silent
set therefore does not reproduce the audible workload of a populated set. Active
recording/count-in must end before starting the test. Avoid changing settings or
tracks during a pass. Recorded harmonic and key changes continue normally.

## Protocol

In hbclean.184, each condition has a one-second preparation period under the
previous preview setting, followed by a fresh meter reset. Only after the engine
acknowledges measurement is active does the preview setting change. The subsequent
20-second window therefore retains the transition instead of resetting afterward.
The first condition still starts after playback has begun; transport startup and
the final restoration are not included in these per-condition measurements. Start and final stop acknowledgements
come from the existing status poll, not additional parameter requests. All three
conditions use the same countdown screen; the live meter repaint gate is suspended
while the guide is visible. The engine's final OFF snapshot supplies the saved
result, preventing a stale displayed peak from being captured.

A retains normal Launchpad preview/LED behavior. B suppresses external preview
reads, preview geometry writes, control-light polling, color calculation and LED
frames. The existing input queue still flushes first on every surface tick, and
the input geometry can follow key changes. Move's own preview and lights continue.
This isolates the external display path as a whole, not native preview computation
from USB lighting separately. C additionally pauses Move's canonical preview
reader before its writes, pad_view read and pad_render fallback. It retains the
last complete snapshot for input capability and display; cached pulses may still
animate on Move. Native audio processing and note dispatch continue. UI key/scale
feedback is also held with that snapshot until previews resume, which is another
reason to use hands-off playback for the listening comparison.

Normal lighting resumes before results are shown. Playback stops only when the
test started it; a set already playing continues. Cancellation, navigation away,
unload and failures restore the temporary override. The test aborts on engine
status timeout, transport stop, recording, set/track/layout changes or surface
disable. It does not claim to restore an earlier song position or undo musical
effects of normal playback. No diagnostic state is saved in the set.

## Photograph fields

- PHOTO 1/5: separate A/B/C peaks for AUDIO, OVER count, READ, WRITE, MIDI and BURST.
  Column labels describe which preview readers remain: A ALL, B MOVE, C NONE.
- PHOTO 2/5 through 5/5: A, B and C request names plus stages from each worst audio render.
  IN=input/config; SEQ=sequencer; META=clip metadata; MID=MIDI/context;
  HB=HarmonyBus preparation; LD=click/load; CHAIN=chain render.
  T identifies the largest timed track render from that same audio block.
  N=measured audio blocks, BUD=audio-block budget in microseconds,
  C=number of requests in the peak inter-render burst.

Units are microseconds except counts and track numbers. Peaking rows can describe
different moments and must not be added together. OVER covers the instrumented
Movy render, not host scheduling, other host modules or driver underruns. The test
does not listen for or count audible crackles; the user's listening comparison is
needed. Sequential windows may include different musical material, so a quieter pass
is evidence to investigate the display path, not proof of causation. Repeat with
the same looping passage if needed.

The readable five-photo format fits the 128x64 screen without requiring a fragile
single-pixel QR code or another encoder/decoder dependency.

## Cadence photograph (5/5)

All time fields are microseconds. Each column is a separate condition.

- GAP: longest observed render-start to render-start interval.
- >1.5X: number of intervals longer than 1.5 times the preceding block's duration.
  This is a cadence threshold, not an underrun or audible-crackle count.
- IDLE: previous render end to current render start, from the GAP interval.
- PREV: previous instrumented render duration, from that same interval.
- REQ: measured external request work in that interval (a subset of elapsed time,
  not something to add to GAP, IDLE, or PREV).
- BLOCK: one-based destination render block of the longest interval.

GAP is approximately IDLE + PREV, allowing microsecond truncation. This is elapsed
wall time and can include scheduling/preemption. It does not identify the host's
buffer depth, device underruns, or which thread caused a delay. Host batching can
also produce uneven call intervals. Compare phases and listening reports before
attributing crackles to these observations. The first block after reset has no
previous start and is excluded. Existing N counts include that first block.

Cadence uses fixed counters and existing profiling timestamps, one additional
end timestamp per profiled render, no per-block allocation/logging, and the existing
status poll. It is disabled with the other diagnostics on exit.
