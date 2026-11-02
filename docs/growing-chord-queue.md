# Movy 0.34.1-hbclean.313 — retained chord progressions

This release includes the merged Schwung stock-font reuse and the final
Chord Play button mappings from the previous session, plus queues that can
grow past sixteen chords.

- New sessions use Queued entry and Loop. Sample selects Immediate / Queued;
  Loop selects Hold / Loop. Saved explicit preferences are respected.
- Mute is bright only when muting. Loop, Mute, X and Copy are off with no queue;
  available inactive controls are dim. Sample remains independent of queue size.
- Entry-mode changes, Mute and Hold / Loop switches preserve the progression.
  X / Range Tap Off cancel it. Stop / Play retains and restarts it at chord one.
- Hold refills append to the retained progression instead of replacing the
  earlier batch. There is no fixed sixteen-chord storage limit; available
  memory bounds growth. Failed growth rejects the new choice and preserves
  existing chords.
- Long-queue footers show the correct absolute position/count and a bounded
  neighborhood of the sounding chord. Native scheduling materializes only
  65 future deadlines; ordinary consumption moves a cursor without shifting
  the queue. Neither loop playback nor footer reads allocate queue storage.

The core tests cover 4,096 queued activations, memory-allocation failure,
continued Hold entry, a 4,099-chord replay, retriggering and bounded previews.
The production Movy/Schwung chain tests 64 chords, a retained refill and a
66-chord restart with balanced MIDI. Existing recording, 128-bar playback,
controller and Schwung 1.7.3/1.8.2 checks remain in the release workflow.

Storage growth occurs on explicit enqueue edits, and those host requests can
share the audio service thread. This is not a claim that allocation is hard
real time or that physical Move crackling and missed transitions are fixed.
Those require hardware verification. Publishing this package does not install
or modify the physical Move.
