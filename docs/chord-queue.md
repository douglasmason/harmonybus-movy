# Queued Chord Play

Requires HarmonyBus 0.2.295. Update HarmonyBus before installing Movy
0.34.1-hbclean.250 through Schwung Manager.

Chord Play's first panel now has Mode, Chord Grid, Anticipation, Current, Next,
Queue count, and Harmony Off. Immediate remains the default. Choose Queued to
establish the first chord immediately and append subsequent choices to a queue.
The next chord activates on the conductor's existing grid and anticipation;
Observed timing uses learned clip changes, with a one-bar fallback when no
timeline is known. Preload while stopped, then press Play to start progression.

The native queue supplies follower lookahead and motif Next Chord destinations.
It holds the last chord when empty, including while new choices await their
next boundary. It supports 16 future chords; a full queue rejects another choice
and shows Full. Stop, Harmony Off, changing conductor or loading a Set clears
the transient queue. Choosing Immediate cancels pending choices. Queue contents
are not saved; the mode preference is saved.

With playback and Record active, new chord activations replace the conductor's
playing clip over the elapsed recording interval. This also works when Record
was already active on another track. Enqueueing does not write future chords
early. The conductor's separately selected clip and the other tracks' recording
behavior are preserved. Note-bound chord intent is recorded with the notes;
independent automation is preserved. With Record off, live choices do not edit
clip contents.

Chord banks, chord operations, conductor motif controls and the harmony overview
now precede extended library and routing categories. Chord Play's Motif to Clip
and Motif Targets panels use the shared preview/write/undo workflow and target
only the conductor, even when the pads are playing a melody track. Queueing a
chord does not automatically fill a clip with a motif.

In extended-settings category lists, left and right jog move without wrapping.
Right stays at the final item; left from the first item returns to the last
non-list panel. Jog click enters the selected category.

Validation covers queued native harmony, lookahead, motif arrivals, transport
lifecycle, controller navigation, conductor-only motif loading, sequencer
recording, and the real Movy/HarmonyBus/Schwung chain. CI also builds the ARM
install package and verifies uploaded checksums. Physical Move verification is
still pending.
