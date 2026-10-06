# Launchpad preview A/B maintenance test

Available from Movy hbclean.182. No host changes or separate diagnostic build.

1. Leave the affected set loaded with Launchpad enabled normally.
2. Open diagnostics with Shift + Step 12. Press the jog knob to see instructions.
3. Press it again to start. Playback starts automatically if it was stopped.
4. Listen through A NORMAL LIGHTS (20 seconds) and B FROZEN LIGHTS (20 seconds).
   Playing pads is optional; use similar playing in both passes if you do.
5. Photograph PHOTO 1/3, then press the jog for PHOTO 2/3 and PHOTO 3/3.
   Include whether A or B crackled more. Back exits.

The test uses the currently loaded clips and instruments. It does not create a
synthetic set, populate empty clips, switch clips, or generate notes. A silent
set therefore does not reproduce the audible workload of a populated set. Active
recording/count-in must end before starting the test. Avoid changing settings or
tracks during a pass. Recorded harmonic and key changes continue normally.

## Protocol

Each condition has a one-second settling period, followed by a fresh meter reset
and approximately 20 seconds of observation. Start and final stop acknowledgements
come from the existing status poll, not additional parameter requests. Both
conditions use the same countdown screen; the live meter repaint gate is suspended
while the guide is visible. The engine's final OFF snapshot supplies the saved
result, preventing a stale displayed peak from being captured.

A retains normal Launchpad preview/LED behavior. B suppresses external preview
reads, preview geometry writes, control-light polling, color calculation and LED
frames. The existing input queue still flushes first on every surface tick, and
the input geometry can follow key changes. Move's own preview and lights continue.
This isolates the external display path as a whole, not native preview computation
from USB lighting separately.

Normal lighting resumes before results are shown. Playback stops only when the
test started it; a set already playing continues. Cancellation, navigation away,
unload and failures restore the temporary override. The test aborts on engine
status timeout, transport stop, recording, set/track/layout changes or surface
disable. It does not claim to restore an earlier song position or undo musical
effects of normal playback. No diagnostic state is saved in the set.

## Photograph fields

- PHOTO 1/3: separate A/B peaks for AUDIO, OVER count, READ, WRITE, MIDI and BURST.
- PHOTO 2/3 and 3/3: A and B request names plus stages from each worst audio render.
  IN=input/config; SEQ=sequencer; META=clip metadata; MID=MIDI/context;
  HB=HarmonyBus preparation; LD=click/load; CHAIN=chain render.
  T identifies the largest timed track render from that same audio block.
  N=measured audio blocks, BUD=audio-block budget in microseconds,
  C=number of requests in the peak inter-render burst.

Units are microseconds except counts and track numbers. Peaking rows can describe
different moments and must not be added together. OVER covers the instrumented
Movy render, not host scheduling, other host modules or driver underruns. The test
does not listen for or count audible crackles; the user's listening comparison is
needed. Sequential windows may include different musical material, so a quieter B
is evidence to investigate the display path, not proof of causation. Repeat with
the same looping passage if needed.

The readable three-photo format fits the 128x64 screen without requiring a fragile
single-pixel QR code or another encoder/decoder dependency.
