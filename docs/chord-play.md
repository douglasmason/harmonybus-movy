# Chord Play: functional intent, colors and HB Settings

Chord Play separates selecting harmony from playing accompaniment. Choose the melody or bass track, then use Session to enter Chord Play. The main pads keep playing that track. The default conductor is **Movy Track 1**; the default comp actor is **Movy Track 3**, whose MIDI channel 3 output plays **original Schwung Track 3**. These are separate destinations.

The Setup page selects the conductor, comp and playing tracks, and chooses **Follow Melody** or **Comp Clip** as the comp actor's input. The selected tracks must be distinct and must have HarmonyBus configured for their roles. Entering from a conductor or comp track selects Track 4 (or the next available distinct track) for the main pads.

Two complete eight-knob banks map to the sixteen step buttons. Touch a knob or press a step to select its chord; releasing it leaves the harmony selected. Turn a literal bank knob to assign its root/quality; turn a functional bank knob to choose its target degree. The **Chord Definition** page edits the selected slot's root, quality, form, bass and scale context. Slot edits affect future selections. They do not alter a selection already recorded in a clip.

The **Chord Intent** page assigns Literal, Scale Degree, Secondary ii/V/IV/VI, Leading vii, Tritone V, or Borrowed bIII/iv/bVI/bVII, with a target degree I–VII of the reference key. These use the existing HB approach resolver. The resolved chord is shown alongside its diatonic/chromatic status. Choosing functional intent starts with Auto quality and Harmony Rules; Chord Definition can override quality, form, bass or local scale. Existing saved slots retain their literal definitions.

**Color By** is available in Setup and Chord Intent:

| View | Hue | Scale indication |
| --- | --- | --- |
| Quality + Scale (default) | Major gold, minor blue, dominant pink, diminished red, augmented orange, suspended green; power/other neutral | Moderate for diatonic, stronger same hue for chromatic |
| Intent + Scale | Scale-degree green, secondary ii/V/IV/VI and leading vii purple, tritone cyan, borrowed yellow, literal neutral | The same binary brightness distinction |
| Scale Only | Neutral or amber | Neutral for diatonic, amber for chromatic |

White marks the actual current conductor harmony, including playback. Disabled slots are dark. Matching knobs use the same colors as their step buttons; no animation is enabled by default. Chromatic means any intended chord tone, including an extension, falls outside the reference parent **before** the slot's local scale accommodation. For example, ii/V (Am7) and V/V (D7) share the secondary-family hue in C major, but D7 is stronger because of F#. Brightness does not count scale alterations.

Scale Context has four choices:

- **Parent:** retain the current parent collection.
- **Minimum Change:** adapt the current parent only where the chord requires it. In C major, Bb gives C Mixolydian, Bb7 gives C Mixolydian b6, Eb gives C Dorian, and Ab gives C harmonic minor.
- **Explicit:** use the slot's tonic and scale.
- **Harmony Rules:** use the existing HB harmonic approach rules, accommodated to the selected chord. This is the starting policy for functional slots.

Comp Chords, Forms, Arp, mapping, rhythm and operations panels edit the comp track directly. Melody panels edit the selected playing track. These are views of the existing track settings; they do not create another copy of voicing or arp configuration. The melody operation banks retain their existing touch/hold/latch behavior. Conductor key controls use the conductor's existing key context.

Selecting harmony emits no comp attack. Follow Melody uses the melody's attacks; Comp Clip uses the comp track's existing clip. The comp actor's arp, latch and rhythm generator process that input normally. Use their existing controls to establish a repeating pattern. Harmony changes preserve the running arp phase. With retrigger off, a sounding arp note completes its gate and the next attack uses the selected chord. Ordinary sustained chords keep the existing retrigger policy. There is no implicit strike-on-change setting.

Record in Chord Play captures the conductor and playing track together, replacing the conductor take and overdubbing the playing track. Harmony snapshots contain the exact chord, scale, tonic and bass, plus functional intent and destination when assigned, stored as root-relative data with the conductor note. Existing save, loop duplication, playback and opening-preview paths retain that information. The comp rhythm stays separate. Slot definitions and routing choices are saved with the set; input modes and held controls are transient.

Session now cycles Clips, Normal Play, Motif Play, Joint Play, Grid Sequencer, Field Play, Chord Play and **HB Settings**. Shift+Session opens or closes HB Settings directly over the current performance without changing its routing. Back closes Settings after closing any picker or peek. Settings contains routing, defaults, timing, scale policies, pad display, context sources and diagnostics. Play modes retain their relevant performance controls. Motif Play continues to use its two full assignment banks and additional controls/settings pages; neither mode has a three-panel limit.

No hardware flashing is part of this release. Device verification should check physical knob touch/release, step LEDs, simultaneous pad melody, recording/replay, and original Schwung Track 3 output with the user's sound configuration.
