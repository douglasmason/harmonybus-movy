# Joint Play

Movy 0.34.1-hbclean.251 adds [Conductor Input: Chord Knobs and sequential chord entry](joint-chords.md). Pads remains the default.

Joint Play makes the Move pad grid an instrument for one selected four-track unit. The track owns its HarmonyBus settings, instrument, harmonic pad feedback and native track color. No separate actor palette or duplicate instrument settings are introduced.

## Entry and navigation

Tap Session to cycle Clips → Normal Play → Motif Play → Joint Play → Clips. Hold Session from a play mode to peek at clips and release to return. Back exits Joint Play to Normal Play. Copy is reserved for copying. Operator Play is hidden, with its implementation and assignments retained. Turn the jog to navigate the existing HB settings panels. Jog click uses the existing picker/peek behavior. On Joint Setup, knob 1 selects the four-track unit. There is no actor or target selector: pad zones select their own role.

| Role | Track within unit | Default source | Recording | New-set travel | MIDI render channel |
| --- | --- | --- | --- | --- | --- |
| Root / conductor | 1 | Lower pads | Replace only | None | Off |
| Bass | 2 | Root | Overdub; replace available | Closest Split | 2 |
| Comp | 3 | Melody through its rhythm/voicing settings | Replace; overdub available | None | 3 |
| Melody | 4 | Upper pads | Overdub; replace available | None | 4 |

The same arrangement repeats on tracks 5–8, 9–12 and 13–16. Stock Move track 1 remains available for drums; actor numbers are Movy roles, not a renumbering of stock tracks. Comp is an ordinary follower with Auto Chord set to Conductor Chord and Played Top Note inversion. Root remains the conductor.

These defaults apply to new sets. Saved chains and MIDI settings are preserved. Older sets without Joint Play settings start with independent clip sources for bass and comp, so merely loading a set cannot suppress existing clips. Joint Play requires Movy-hosted tracks in the selected unit.

## Pad participation and playback display

Jog to **Joint Pads / Display**. Knobs 1–4 switch Root, Bass, Comp and Melody pads Off/On. This never mutes a track, stops a clip or changes a follow source. Bass and comp additionally need their source set to Pads to claim rows. Disabled actors are excluded from Joint recording and live modifier recipients; held notes keep their original release ownership.

The remaining actor in a half receives both rows. If one half has no playable actors, the other uses all four rows; one actor can therefore own the whole surface. Comp never receives approach semantics. For conductor clips plus independent bass and melody, turn Root Pads Off, Bass Source to Pads, and leave Melody Pads On: bass gets the lower two rows and melody the upper two.

Knob 5 chooses **Zone / Linked Pair / All Four** playback feedback (Linked Pair by default). Knob 6 chooses the secondary color (cyan by default); primary playback retains the existing global Play Color (green by default). All Four uses each actor’s track color. Coincident actors alternate at 180 ms intervals. A held root command retains a track-colored marker even when conductor MIDI output is off.

The playable actor owns the pad map, harmonic background and travel preview. Secondary overlays match actual output pitches, after that secondary actor’s own travel/chord/arp processing, against the owner’s resolved pad target pitches. Duplicate targets can light together; out-of-range pitches are not folded into unrelated pads. Display feedback never becomes musical input. All Four overlays four outputs on one surface; it does not make one pad trigger four actors.

Requires HarmonyBus **0.2.272** for final-output feedback. Pad and display choices are saved per four-track unit. Track rendering settings remain in the corresponding HarmonyBus track state.

## Pad allocation

| Physical row, top to bottom | Linked default | Bass and comp both on pads |
| --- | --- | --- |
| Top | Melody approach row | Melody |
| Upper middle | Melody targets | Comp rhythm / register |
| Lower middle | Root second octave | Root |
| Bottom | Root first octave | Bass |

Linking frees both rows for their shared function. Clip-driven actors also leave those rows available. Each half has its own layout selector. Upper choices are two octaves, piano and approach. Lower choices are two octaves, piano and a chromatic-below row: those lower chromatic keys are ordinary inputs which commit harmony, never resolving approach aliases.

## Controls and panels

Joint Play uses `createSchwungPage`, the existing Motif Play hierarchy and its controller. Panel navigation, parameter editing, Shift-turn assignment, touch ownership, latch behavior, peeks and knob feedback use the same implementation. Only Joint-specific parameters and their backing state are added.

| Joint Setup knob | Function |
| --- | --- |
| 1 | Four-track unit: 1–4, 5–8, 9–12, 13–16 |
| 2 | Unassigned |
| 3 | Bass source: Follow, Clip, Pads |
| 4 | Comp source: Follow, Clip, Pads, Clip + Guide |
| 5 | Lower layout |
| 6 | Upper layout |
| 7 | Chromatic-below touch for root/bass; turn to latch/unlatch |
| 8 | Step row: Steps, Operators, Motifs (default) |

Joint Recording exposes Root, Bass, Comp and Melody record modes directly on knobs 1–4. Root is fixed to Replace. The others select Overdub or Replace.

Jog onward to the shared Motif Play panels. Motif Play 1/2 expose the existing sixteen operation/motif slots. LT is slot 5 by default; Shift-turn changes assignments using the ordinary HB implementation. Touch, release and latch/row-selection reuse the existing controller. Dedicated melody approach rows select the operation played by those rows; a one-row or two-octave melody layout uses ordinary performance operation behavior. Parallel Scale and Key Center retain their shared harmony scope. Fixed Root, Bass, Comp and Melody panels expose the corresponding track’s travel, chord mode, inversion, arp playback/rate and range through direct native parameter aliases. Editing these updates the normal track panels, and external edits read back in Joint Play. Bass and Comp Source reuse the existing routing settings, independently of pad participation.

Normal Play uses the step row for sequencer editing; Clips uses it for track selection; Motif Play uses it for motif triggers. Joint Setup knob 8 selects Steps, Operators or Motifs for the step row, saved per four-track unit (default Motifs). Operators and Motifs use the global assignments edited in Motif Play. There is no separate Joint bank to configure. This selector changes the step row only. Modifier buttons arm root and melody pads plus independently played bass pads; comp ignores direct pitch modifiers, and following bass receives the resulting harmony without a second application. The pads determine the role. Touch knobs use the same pad-scoped control path.

Chromatic below changes lower inputs only, never a melody or comp input. Its resulting conductor harmony still propagates to followers, including independent bass. Shared HB operations retain their established scope.

Actor identity LEDs use the existing track-color function, including copied native colors across units. Musical pad colors use each actor's canonical HarmonyBus preview. One actor preview is read per 50 ms total; pad input does not wait for those reads.

## Sources and recording

Follow regenerates bass from root and comp from melody through the destination track's normal HarmonyBus chain. Derived notes are not recorded into duplicate clips. Each destination retains its own register, sound, chord and rhythm settings. Its independent clip notes are suppressed while Follow is selected.

Clip uses that actor's current Session clip or existing motif workflow without allocating a pad row. Clip + Guide keeps the comp clip's timing and note durations, using the latest melody target plus the comp register offset as its input pitch. Before a melody guide arrives it uses the clip's original pitch. The guide updates on live or recorded melody onsets; it does not rewrite clip notes or retune held comp notes.

Record starts one take across the root and melody plus any independent actors assigned pads. Each actor records into its own currently playing clip; selected clips are used for actors not already playing. Root always replaces. Bass and melody can accumulate counterpoint; comp overdub supports adding rhythmic attacks or accents to a repeating pattern.

Replacement erases the elapsed recording region, including rests, and suppresses the replaced clip's old playback while recording. It does not clear the entire clip at punch-in. Existing knob automation remains a separate edit. The take uses the existing recording undo pass. Cancelling before a queued take starts cancels its actor launches too.

A held pad retains its original track and pitch across view, unit, layout and source changes. Pressure and note-off use that owner. If a queued clip launch changes a recording actor's clip, the captured note closes at that boundary; its sounding voice still releases on the physical note-off. This prevents held input leaking into the newly launched clip.

## Validation and remaining device checks

The patch is applied to the pinned upstream Movy checkout and checked with TypeScript, the existing logic suite, the real shared touch-controller tests, focused Joint Play browser tests and both Rust library suites. The new-set presets are extracted from the actual built TypeScript and loaded through the real HarmonyBus C implementation; the check covers all sixteen roles, channels, travel settings, comp voicing and edited-state round trips.

Hardware acceptance is still required for rapid multi-actor playing, touch-to-pad timing, pressure, clip changes while recording, stock MIDI destinations, audio latency and LED pacing. The release pipeline verifies and publishes the installable Movy package; device installation and hardware checks remain separate.

## Shared rhythm timing

HarmonyBus 0.2.273 and Movy hbclean.198 use HB-owned rhythm weights for ordinary live output, recorded clip timing, motif playback and motif clip construction. The existing six patterns remain As Entered, Even, Long–Short, Short–Long, Accelerate and Decelerate. Tracks retain Inherit / Off / Override; motif export and padded motif playback now resolve that setting consistently.

Each consumer retains its timing contract: clip playback warps beat/bar windows without rewriting notes; motif playback preserves its target anchor and applies existing Trim/Fit/Defer behavior; motif-to-clip rendering preserves ties, placement and padding. No separate named full-clip or target-only auto-fill engine was added by this consolidation, and it does not generate additional rhythmic attacks or rests.

The host receives a cached versioned timing recipe on configuration changes. Older HB versions remain supported through the legacy protocol. No extra audio-block polling is introduced.
