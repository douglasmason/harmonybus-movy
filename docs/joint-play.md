# Joint Play — development implementation

Joint Play makes the Move pad grid an instrument for one selected four-track unit. The track owns its HarmonyBus settings, instrument, harmonic pad feedback and native track color. No separate actor palette or duplicate instrument settings are introduced.

## Entry and navigation

Tap Session to select clips. Tap it again to enter Joint Play. Hold Session to peek at clips and release to return. Back exits Joint Play. Turn the jog to select units 1–4; click it to show the eight controls. Track selection in Session determines which actor K8 edits.

| Role | Track within unit | Default source | Recording | New-set travel | MIDI render channel |
| --- | --- | --- | --- | --- | --- |
| Root / conductor | 1 | Lower pads | Replace only | None | Off |
| Bass | 2 | Root | Overdub; replace available | Closest Split | 2 |
| Comp | 3 | Melody through its rhythm/voicing settings | Replace; overdub available | None | 3 |
| Melody | 4 | Upper pads | Overdub; replace available | None | 4 |

The same arrangement repeats on tracks 5–8, 9–12 and 13–16. Stock Move track 1 remains available for drums; actor numbers are Movy roles, not a renumbering of stock tracks. Comp is an ordinary follower with Auto Chord set to Conductor Chord and Played Top Note inversion. Root remains the conductor.

These defaults apply to new sets. Saved chains and MIDI settings are preserved. Older sets without Joint Play settings start with independent clip sources for bass and comp, so merely loading a set cannot suppress existing clips. Joint Play requires Movy-hosted tracks in the selected unit.

## Pad allocation

| Physical row, top to bottom | Linked default | Bass and comp both on pads |
| --- | --- | --- |
| Top | Melody approach row | Melody |
| Upper middle | Melody targets | Comp rhythm / register |
| Lower middle | Root second octave | Root |
| Bottom | Root first octave | Bass |

Linking frees both rows for their shared function. Clip-driven actors also leave those rows available. Each half has its own layout selector. Upper choices are two octaves, piano and approach. Lower choices are two octaves, piano and a chromatic-below row: those lower chromatic keys are ordinary inputs which commit harmony, never resolving approach aliases.

## Controls

| Knob | Function |
| --- | --- |
| 1 | Melody approach touch, using the existing fifth operation slot (LT by default) |
| 2 | Chromatic below for bass/root inputs only |
| 3 | Existing shared Parallel Scale operation |
| 4 | Bass source: Follow, Clip, Pads |
| 5 | Comp source: Follow, Clip, Pads, Clip + Guide |
| 6 | Lower layout |
| 7 | Upper layout |
| 8 | Selected actor's record mode; root always replaces |

Operation touches use the shared surface touch controller. LT also uses the native `approach_touch_5` owner and key, so releasing Joint Play cannot cancel the same operation held on another surface. Existing slot customization remains in force. Clockwise operation turns latch; counterclockwise turns unlatch. LT touching also exposes approach identities on melody target pads while held; the native approach row keeps its selected operation. Chromatic below changes the lower input, not the upper melody or comp input. The resulting conductor harmony still propagates to all followers, including independent bass. Parallel Scale retains its shared HarmonyBus scope.

Actor identity LEDs use the existing track-color function, including copied native colors across units. Musical pad colors use each actor's canonical HarmonyBus preview. One actor preview is read per 50 ms total; pad input does not wait for those reads.

## Sources and recording

Follow regenerates bass from root and comp from melody through the destination track's normal HarmonyBus chain. Derived notes are not recorded into duplicate clips. Each destination retains its own register, sound, chord and rhythm settings. Its independent clip notes are suppressed while Follow is selected.

Clip uses that actor's current Session clip or existing motif workflow without allocating a pad row. Clip + Guide keeps the comp clip's timing and note durations, using the latest melody target plus the comp register offset as its input pitch. Before a melody guide arrives it uses the clip's original pitch. The guide updates on live or recorded melody onsets; it does not rewrite clip notes or retune held comp notes.

Record starts one take across the root and melody plus any independent actors assigned pads. Each actor records into its own currently playing clip; selected clips are used for actors not already playing. Root always replaces. Bass and melody can accumulate counterpoint; comp overdub supports adding rhythmic attacks or accents to a repeating pattern.

Replacement erases the elapsed recording region, including rests, and suppresses the replaced clip's old playback while recording. It does not clear the entire clip at punch-in. Existing knob automation remains a separate edit. The take uses the existing recording undo pass. Cancelling before a queued take starts cancels its actor launches too.

A held pad retains its original track and pitch across view, unit, layout and source changes. Pressure and note-off use that owner. If a queued clip launch changes a recording actor's clip, the captured note closes at that boundary; its sounding voice still releases on the physical note-off. This prevents held input leaking into the newly launched clip.

## Validation and remaining device checks

The patch is applied to the pinned upstream Movy checkout and checked with TypeScript, the existing logic suite, the real shared touch-controller tests, focused Joint Play browser tests and both Rust library suites. The new-set presets are extracted from the actual built TypeScript and loaded through the real HarmonyBus C implementation; the check covers all sixteen roles, channels, travel settings, comp voicing and edited-state round trips.

Hardware acceptance is still required for rapid multi-actor playing, touch-to-pad timing, pressure, clip changes while recording, stock MIDI destinations, audio latency and LED pacing. This development branch does not change release tags, publish an installer or install anything on Move.
