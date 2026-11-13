# Sparse-safe MIDI event heads — first implementation

This is an **edit-time Clip Fill mode**, not a new audio instrument or
continuous live playhead. It uses the same authoritative Clip Fill preview,
source fingerprint, destination check, one-Undo commit and stock Move MIDI
emission as ordinary Fill. No new realtime scheduler, clock, or note-off owner.

## Why an event reader?

An arbitrary short time-window sampled from sparse MIDI is usually empty.
Event heads instead index the next **note-onset group**: all notes with the
same tick are one chord grain. Source rests do not reduce density. A single
source note can generate an eighth-note rhythm; a three-note source can
generate interlocking patterns. **Original** Fill retains source rests if
that is the intended musical result. Generated pitches stay within the
source groups; harmonic/interval invention is deliberately separate future
work through the existing operations and follower rendering.

## Native Move controls — Clips View → Fill Clips

Choose a melodic source clip and turn knob 6 to **Event heads**.

| Control | Purpose |
| --- | --- |
| K1 / K2 | Source track / clip |
| K3 | Generated attack interval: 1/16, 1/8 (default), 1/4, 1/2, 1 bar |
| K4 | One forward head, forward+reverse (default), forward+ping-pong, two forward |
| K5 | Output length, 1–16 bars |
| K6 | Sequence / Fit / Original / Event heads |
| Shift+K1 | First head's event-index offset, 0–15 |
| Shift+K3 | Second head's event-index offset, 0–15 |
| K7 | Own / keep Source Weaving on destination |
| K8 | Exit Fill |

Press a destination clip pad to commit, never to launch it. The ordinary
single-Undo path applies. A/B draft memories, staleness refusal, read-only
previews and track/clip selection are shared with existing Fill. K3/K4 return
to the previously chosen rhythm source when leaving Event heads.

## Musical and safety semantics

- Each head advances by **one source onset group per generated attack**. Thus
  a long source silence produces no blank grains; and chord groups stay
  simultaneous rather than being scattered one voice at a time.
- The two heads have independent event offsets and direction modes.
  Duplicate output `(tick, pitch)` collisions are merged instead of
  triggering two same-pitch gates on one destination track.
- Output notes retain source pitch, velocity, input key, recorded per-note
  actions and pressure points within the new gate. Gates end at least one
  tick before the next attack on that head, respecting the selected length.
- Clip source is not modified. The exact source revision and settings
  are hashed into a preview signature. Unseen source edits cause atomic
  commit refusal; no UI render advances heads or rerolls material.
- A dense four-voice chord at 1/16 over 16 bars can exceed the stock clip's
  512-note limit; this is a visible error, not a truncated or partial clip.
- Only plain, abstract **melodic** source notes currently qualify. Rendered
  notes, generators, clip automation, timed operations, conditions, or altered
  source timing cannot be transformed safely without explicitly translating
  their semantics and are rejected. Drums retain Original Fill.
- Already-recorded source notes that were transiently suppressed/fired during
  playback remain valid material. No on-device audio quality claim is made
  without physical testing.

## Architecture and next increment

`integration/clip-fill/midi_grain.rs` supplies a reusable deterministic
event-group transform. `clip_fill.rs` calls it only in alignment mode 3,
leaving legacy six/eight-field Fill requests and other modes unchanged.
`patch_clip_fill.py` installs the same Rust module in the upstream seq-core.
The ordinary native clip engine renders the resulting notes to stock Move
instruments.

The next step should reuse the **same onset/head policy** at accepted
Source Weaving rhythm attacks for a live reader. Its rhythm can come from an
existing Euclidean/drum/generator source, so sparse pitch sources need not
emit sparse rhythms. After that, add recorded/automatable head position and
Cloud X/Y/pressure through the existing driver surfaces. Avoid introducing
another sequencer or adding an independent voice/gate system.

## Verification

Native tests cover one-note and three-note sources, dual head collisions,
ping-pong/offsets, chord grouping, pressure/gate truncation, capacity,
invalid controls, source immutability, source revision, native preview/write,
and Undo. Shared Move UI tests cover mode selection, no extra preview reads,
offset edits, acknowledged writes, and returning to Original/Drum Fill.
Physical Move/Launchpad play-feel and audio crackle checks remain necessary.
