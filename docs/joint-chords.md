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
chord when the queue runs out. Changing the conductor input or performance mode
releases its live chord and clears future selections. Existing Sets default to
Pads. Legacy Sets retain their per-unit conductors; single-conductor Sets use
Track 1 in every unit.

## Conductor clip and motif shortcuts

Both Chord Play and Joint's Chord Knobs option have two additional core panels:

- **Conductor Clips:** turn any of knobs 1–7 to choose one of the eight conductor
  clips; tap and release to launch it. Turning edits the shortcut without
  launching. The existing immediate/stopped or bar-quantized/running clip launch
  applies, and melody pad focus stays on its track. Empty clips retain the
  ordinary select-empty/stop behavior.
- **Conductor Motifs:** turn knobs 1–7 to choose existing factory or user motifs;
  tap to open the existing Motif to Clip preview for the selected conductor clip.
  **Fill+Go**, Append or Overdub uses the existing undoable import, then launches
  only if the write succeeds. Cancel does neither. Target, unit and shaping
  still come from the existing motif settings.

Knob 8 remains Harmony Off. Chord Play's step buttons mirror the visible content
panel; Joint's step row retains its chosen function. Shortcut choices are saved
with the Set. This reuses the clip launch and motif preview/import code already
available in Clips and Motif to Clip; it introduces no additional content library.
Launching a clip takes over from the live chord selection and clears its queue.

## Compose with continuous overlap

On **Conductor Motifs**, touch one choice, touch the next before releasing the
first, and continue with at least one control held. The final release opens one
combined preview. Order follows touch-downs, not release order. Knobs and Chord
Play step buttons can be mixed. Releasing and re-touching a selector while
another remains held adds that element again. Turning a held selector edits its
choice and cancels that pending phrase; changing views cancels unfinished input.

**Rest** and **Tie** are explicit motif choices, initially on knobs 6 and 7.
Rest inserts one silent motif Unit. Tie extends the preceding note event by one
Unit without another onset; it cannot start a phrase or follow a rest. A leading
Tie is unlit and rejected with an explanation. Rest can stand alone as a silent
clip. The preview shows Rest/Tie labels before any clip is changed.

The gesture is bounded to 16 choices, 34 exported events and 16 bars, matching
the existing importer. Oversized phrases are rejected as a whole. No partial
phrase is written. Live Immediate/Queued chord selection keeps its existing
behavior; connected chord-bank composition applies to stopped step entry.

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
entered step. If chord touches overlap, each new touch-down appends the next chord.
Release order does not change their order; releasing the last held control
advances beyond the final chord. Releasing and re-touching a chord control while
another remains held repeats that chord as a new onset. Undo restores
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
