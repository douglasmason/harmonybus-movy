# Movy 0.34.1-hbclean.294

Loop mode now retains the chord list across pause. Playback stops silently;
Play restarts that same list at chord one, with its loop membership and cursor
available to the display and knob LEDs. Explicit No Harmony and Reset clear it.
Hold mode retains its existing clear-on-stop behavior.

Repeated selection reads now reuse fixed-size, thread-local chord interpretation
instead of rerunning inference. Transpose, inherited register and spelling stay
live. A desktop decode microbenchmark improved from about 825 to 77 ns/read;
this does not establish that every physical-device crackle is resolved.

Temporary tonic-position cues now use the active track color on Move, Joint
Play and RGB Launchpad; older limited-color Launchpads use their existing
palette approximation. Cue duration, octave readout and note ownership stay
unchanged, with no new host reads.

The expanded chord and operation cells now use taller text where it fits.
Chord spellings and Roman numerals retain their contrasting letter heights,
with more letter and line spacing. Long operation names retain a compact
fallback. Crowded queue footers omit “Loop” before reducing the visible chord
list, while keeping the position/count and current-chord brackets.

Queue service also reads the latest transport snapshot before the conductor
phase, so a paused transport cannot strand a stale running-state check.

The Audio detail page can now save the existing 35-second audio check together
with before/after Chord Play queue evidence. This is diagnostic evidence for
intermittent missed changes and crackles, not a confirmed hardware fix.

While the queue is playing, open Step 12 CPU, turn the jog to the Audio page
(labelled AUDIO CLICK:CHECK), then click twice to read the instructions and
start. The check adds its existing test tone. Back lets you return to playing
while it runs; return to CPU to see the result. If playback was already running,
it stays running. The ordinary CPU-page click still offers the host-output test.

After the check, download `audio-check-*.json` from `/data/UserData/schwung/`.
The display says LOG SAVED only after writing and reading back the file. If it
says SAVE FAILED, photograph the result instead. Cancelled/incomplete checks
do not save a complete report.

The report includes the existing audio callback, request and internal PCM
metrics, plus queue status and named counters on each track. Queue counters
separate chord activations, missing-voice recovery requests, late changes,
queue clears and timing re-arms. Missing/older modules report null diagnostics.
Counters are shared across the single conductor queue and cover the loaded
module's lifetime: compare before/after counts on the same module, do not sum
tracks, and do not subtract the cumulative maximum. A late change means more
than one 96-PPQN tick beyond the beat deadline; a stalled beat clock may conceal
wall-time lateness. Audio and queue snapshots are not sample-synchronous.

Native collection uses fixed scalar counters with no extra clock reads,
allocation or logging. The UI takes only two bounded sets of snapshots, outside
the measured interval, and writes the file after timing stops. It adds no
background poll or timer. Existing queue corrections and tonic/octave button
cues remain included.

Validation covers 2,048 queued changes with injected late service, separate
voice recovery, due-change priority, non-mutating diagnostic reads, and queue
clear retention. UI tests exercise physical Audio-page jog routing, two-only
snapshot reads, no report writes during measurement, missing-module handling,
verified report contents and the existing host-output test entry.

Install with `douglasmason/harmonybus-movy` once the verified release advances
the installer pointer. Publishing does not install anything on the Move.
