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
- The rhythm generator or donor determines attacks and gates. Source grain
  density is independent, but not continuously controllable without changing
  that rhythm source. Its own rhythm source stays silent if no donor attacks.
- Existing recording is intentionally **Own**, not a flattened capture of
  Source Weaving. Source route settings do save/reload/Undo. Recordable
  automation of head positions/shape, deterministic live performance Bake,
  and direct Cloud 14-bit X/Y + pressure binding remain future steps.
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

Use existing Cloud/Field X/Y and pressure snapshots to *drive head position
and rhythmic density*, allowing fingertips on Remote UI or Launchpad to
scrub and hold MIDI read heads. Preserve discrete MIDI event attacks,
recordable operation/parameter automation, and one native note owner.
Then introduce optional chord-tone/motif connector operations (keeping
source fidelity separate from attack density) and a live-to-Bake parity
test. Avoid duplicating the existing Field noise, source scheduler, or
clip generation recipe.
