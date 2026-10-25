# Joint conductor knobs and chord step entry

Movy **0.34.1-hbclean.251**, with HarmonyBus **0.2.295** or later.

In Joint Play, turn **Conductor Input** on the Joint Setup page from **Pads** to
**Chord Knobs**. The Home chord bank opens. Touch knobs 1–7 to choose harmony;
knob 8 is Harmony Off on the chord pages. Jog to Parallel/Blues banks, the chord
editor, selection timing, or the existing Joint settings and operation panels.
Turning a knob still edits the setting on the visible page.

The conductor's pad rows are given to the other playable actors. With the
default Follow bass/comp sources, all four rows play melody. Bass and comp keep
their existing Follow/Clip/Pads choices. Joint's step row keeps its existing
Steps/Operators/Motifs function. The conductor still participates in Joint
operations and recording even though it no longer has pads.

Immediate and Queued selection share the existing Chord Play setting and native
queue. Queued mode uses the conductor's grid/anticipation and holds the last
chord when the queue runs out. Changing the conductor input or leaving the view
releases its live chord and clears future selections. Existing Sets default to
Pads. Legacy Sets retain their per-unit conductors; single-conductor Sets use
Track 1 in every unit.

## Enter a progression at your own pace

While stopped in Chord Play, or Joint Play with Chord Knobs:

1. Hold Record.
2. Touch a chord knob, then release it to advance one step. Chord Play's chord
   step buttons work too; Joint's step buttons keep their existing function.
3. Press Right while holding a chord to add a tie. Left removes a tie.
4. Press Right with no chord held to enter a rest. Left moves back to edit.
5. Release Record to finish. Play runs the resulting conductor clip.

The selected conductor clip receives the full chord descriptor, including its
harmonic intent. No motif/library save is needed. Existing clips wrap at their
end; empty clips grow using the normal step recorder. A new chord replaces the
entered step. If chord touches overlap, the latest choice replaces that step
and the recorder advances after all those touches are released. Undo restores
the previous contents. Melody pads retain their track and do not write into the
conductor clip. A quick Record tap keeps its usual live-record meaning.

During playback, Record keeps the existing multi-actor recording policy:
conductor chord activations replace the playing conductor interval, while the
other actors retain their own recording settings. Queued chords are written
when activated, not when queued.

## Implementation and verification

Joint embeds the existing chord-bank controller and native queue. It does not
enable Chord Play's separate comp routing. Conductor knob input and descriptor
playback use the existing Joint bass-follow route; derived notes are not baked
into follower clips. Release ownership survives input changes.

Sequential entry reuses the normal clip step recorder, its cursor, ties/rests,
clip growth and undo. The native step write attaches the same immutable chord
descriptor used by live recording and rejects stale/invalid selections. No new
musical scheduler or per-frame clip processing is introduced.

Regression coverage includes shared-controller gestures, all four units and
both conductor layouts, normal step-recorder compatibility, semantic chord
save/undo, and the production Movy → Schwung → HarmonyBus audio/MIDI chain.
Physical Move hardware remains untested.
