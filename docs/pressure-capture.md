# Pressure isolation capture (hbclean.191)

Open Movy Step 12 CPU, press the jog for instructions, then press again to start.
Use the same track and settings throughout. No recording is needed; recording
invalidates the capture. Playback starts automatically if stopped and its initial
state restores afterward. Keep the loaded set; nothing is added to its clips.

The native engine switches pressure forwarding on/off/on automatically:

| Elapsed | Phase | What to do |
| --- | --- | --- |
| 0–20 seconds | A pressure on | Play rapid repeats on the affected pads |
| 20–40 seconds | B pressure off | Keep playing the same way |
| 40–60 seconds | C pressure on | Keep playing the same way |
| 60–85 seconds | D recovery | Release every pad and wait |

Back returns to playing while measurement continues. Return to CPU to see the
phase/countdown. A test tone masks instrument audio for the first 80 seconds;
the trace observes note events underneath it. You do not need to judge phases
by ear. A jog click cancels. Native cancellation, set load and the 85-second
deadline restore pressure forwarding even without UI polling.

Download the newest `pressure-test-*.json` from Schwung Manager → Files →
schwung and attach that one file. Report writing happens after measurement.
The existing worker comparison remains available through its existing shortcut.

The off phase bypasses pressure forwarding to the musical processing chain,
including replayed pressure; it does not stop upstream hardware/UI pressure
traffic, alter note edges, or edit stored pressure curves. Therefore a negative
result cannot rule out pressure overhead before this boundary.

The report includes four phase rows (maximum callback-start gap and event
counts), whole-run thread/PCM metrics, and the latest 96 note events. Kinds 0/1
are internal raw ON/OFF arriving at Movy, 2/3 are mapped Move pad ON/OFF, and
6/7 are cable-2 rendered ON/OFF submissions to the host. Pressure is counted,
not individually stored. Channels identify MIDI channels for raw/render events
and track indices for mapped events. They are not end-to-end voice IDs.

`overwrittenEvents` counts older trace entries evicted by the fixed ring;
`lockMisses` counts skipped event/gating/timing operations when the nonblocking
trace lock was unavailable. On lock contention, forwarding fails open. A run
with lock misses is not a strict pressure-isolation comparison. Duplicate raw
ON/unmatched OFF counters can include pre-existing held notes. Raw internal
notes outside the pad range may be counted but do not affect held-pad checks.

This module cannot observe physical finger release time before host delivery,
host queue depth/oldest-event age, actual host consumption of injected MIDI, or
DAC output. Render submissions are not delivery confirmations. PCM errors and
callback gaps are not audible-crackle counts. Pressure counts combine live and
replayed traffic, and different playing/music across phases can confound the
comparison. There is no claimed crackle fix in this diagnostic.
