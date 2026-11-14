# Live sparse MIDI event heads (Source Weaving)

First live milestone from [issue #287](https://github.com/douglasmason/harmonybus-movy/issues/287).
This is **MIDI event-group reading**, not audio sampling or a separate
arpeggiator, scheduler or synthesizer.

## Play

1. Record or load a small source phrase on one clip. A **single note** is enough;
   chords with multiple notes on one tick are one event group.
2. Launch that clip and a rhythm donor clip. A drum part, Euclidean source, or
   recorded actor generator can provide accepted rhythm attacks independently of
   how sparse the pitch source is.
3. On your chosen Bass, Comp or Melody actor, open **Joint Play → Sources**.
   Set Source Weaving On, Pitch Source/Clip to the phrase, Rhythm Source/Clip
   to the donor, and Alignment to **Event Heads**.
4. On **Joint Play → MIDI Event Heads**, select Head Pattern:
   Single, +Reverse (default), +PingPong, or +Forward. Use Head 1 / Head 2
   Offset to rotate each reader through up to sixteen source event groups.
5. Keep the actor's existing HarmonyBus Relative / Closest Split input mapping.
   The resulting MIDI drives its existing stock Move instrument; the native
   MIDI note/gate/retrigger and HarmonyBus operations remain in charge.

Changing head settings alters *upcoming* accepted rhythm attacks. There is no
separate Grain Rate control here: the **selected rhythm source determines
rate**, which is a much more direct and composable source of rhythmic density.
Choose a faster donor or its existing Euclidean/generator controls rather
than scanning the source MIDI's empty time windows.

A three-onset phrase such as a C/E chord, G, A becomes:

- Accepted 1/8-note attacks: 0, 1/8, 1/4, 3/8, …
- Forward reader: C/E, G, A, C/E, …
- Reverse reader: A, G, C/E, A, …
- Combined (deduplicating identical simultaneous pitches): C/E/A, G,
  A/C/E, C/E/A, …

The stored source clip is untouched and remains editably sparse.

## Scrub sparse MIDI with Field X/Y and existing pressure surfaces

Event Heads can read **independent normalized position sources**, without
introducing another oscillator, sequencer, recorder or bespoke touch UI.

1. In Joint Play → Sources select **Event Heads** and an existing rhythm donor.
2. On that actor's **MIDI Event Heads** panel set **Head 1 Position** to
   **Field 1**, **Head 2 Position** to **Field 2**. Default **Clock**
   means advance by one source event group per accepted donor attack.
3. In **Field Play → Outputs**, select the first output bank. The first
   two output strips now act as X and Y for these head readers. Use
   Move/Launchpad pads and aftertouch, knobs, Momentary or Latch; or use
   the same live output strips in HarmonyBus's Schwung Remote UI.
4. Sweep or latch the two output positions. A new note/chord grain is read
   only when the existing rhythm source delivers a valid attack. The source
   MIDI clip remains untouched and ordinary native note-off ownership applies.

The *effective* Field output is what the reader sees, including Perlin
motion and pad/knob/touch overrides. Input 1 and Input 2 can be chosen
instead of Field channels, using HB's existing Sequence Position Inputs.
Outputs use the existing DSP-normalized 0–10000 snapshot and are translated
to the shared internal 14-bit position scale; this does **not** claim 14-bit
independent pitch-bend or audio-rate control.

**Interpretation:** X=0 selects the first source onset group, X=100%
selects the last; intermediate values choose the closest event index,
not the closest timestamp. Chord groups remain intact. The second head
applies its chosen Reverse/PingPong/Forward policy after its own position
and offset. If its driver disappears, it resumes the accepted-rhythm
event sequence independently. Without any active position driver, the
secondary PingPong head now traverses both directions across event
boundaries rather than restarting at the upper edge.

Field outputs are sampled by the **existing shared snapshot at a bounded
rate**, not once per audio sample. This makes on-pad and iPad gestures
meaningful for sparse clips, but live note changes are **onset-quantized**:
dragging a finger between donor attacks does not create extra MIDI notes.
Pressure can shape Field overrides already; there is no separate per-note
MPE pitch stream.

A future **single two-dimensional Cloud editor** should point X/Y at
these same Field channels. This increment reuses the existing 2D
Field/Launchpad interaction and Remote UI output strips instead of
building a second, incompatible controller. Recorded head movement and
Bake parity are still separate future work.

## Shared interpretation and ownership

The live reader calls the same event-index arithmetic as
`integration/clip-fill/midi_grain.rs` (already used by offline Clip Fill).
Each accepted donor attack uses Source Weaving's existing pitch/expression/
operation source selection, captured clock, Follow Amount, lane filter,
follower harmony rendering and shared `emit_clip_note` gate owner. The actor
does not advance when the donor hit is filtered, conditional, absent or
unavailable; unused note groups do not consume sequence positions.

The Event Heads reader uses a bounded stack buffer of at most `MAX_NOTES`
onsets at each accepted attack; it sorts and deduplicates the onsets without
heap allocation, retaining chord membership. This is not an unconditional
per-audio-sample scan or a new retained revision cache. Head collisions on
the same raw pitch/tick are suppressed before emission, so the scheduler
is not handed two identical notes at once. Stop, mute, retrigger and clip
relaunch retain existing source ownership and gate cleanup.

Event Heads selects *unrendered* MIDI input material. Other Source Weaving
alignments remain unchanged. The optional offset settings are saved in
the existing Source Route record and Undo snapshot; legacy route strings
and old Sets load exactly as before. Instrument and HB Render automation
continue using their existing Step/Linear driver path.

## Current limits

- This is a live, opt-in pitch reader: it does **not** create new pitches
  between anchors, an independent audio-granular cloud, or any extra voices.
- The rhythm generator or donor determines attacks and gates. Scrubbing
  head position changes source pitch/chord selection only; activity/density
  still comes from the rhythm source. No donor attacks means no emitted grains.
- Existing recording is intentionally **Own**, not a flattened capture of
  Source Weaving. Source route settings do save/reload/Undo. Recordable
  automation of head positions/shape, deterministic live performance Bake,
  and a dedicated Cloud X/Y editor binding remain future steps. Field
  channels are already available as the live head-position drivers.
- Source Weaving only accepts a *playing, unmuted* pitch donor. Clip Fill
  can create an independent editable MIDI clip for the static counterpart.
- Real device latency, controller feel and audio crackle are not proven
  by automated tests; verify on Move/Launchpad before calling the device
  performance fully validated.

## Verification

The expanded native suite covers source-onset scarcity, two-head
collision/deduplication, simultaneous chord voices, independently saved
modes/offsets, reverse/ping-pong, clocked note-offs, loss/mute, stop,
recording bypass, source note reordering, follower pitch mapping,
serialization, invalid-command atomicity, and unchanged donor clips.
Shared Joint Play tests exercise the real panel hierarchy, legacy
routing messages, new head controls and native readback.

## Next

Build a **single 2D Cloud touch editor** that binds its X/Y gestures to
two existing Field channels, without another sensor protocol. Then add
recordable head movement and verify live preview/recorded recipe/Bake parity.
Optional harmony connector operations can increase source novelty independently
of donor rhythm density. Keep one native note owner and no second scheduler.
