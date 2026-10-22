# Clip Participation — Movy 0.34.1-hbclean.228

Give a follower clip a musical rest while other actors keep borrowing its
material. The clip continues advancing at its own speed and phase.

## Use

Stop, then open **Joint Setup → Song Sections → Clip Participation**. Choose
**Entry**, the physical **Track** (1–16), and **Clip Sound: Normal / Rest**.
Use **Keep** on the parent Song Sections page when that clip should retain its
phase across the section boundary. Sound and clip transitions are independent:
Rest cannot keep a donor available if Scene/Stop stops its playback.

For example, keep a three-bar bass clip running as a pitch donor, set its own
Clip Sound to Rest during an introduction, and set Normal for the next section.
Other actors continue reading the bass material. The bass enters from its
current phase on the next scheduled attack; it does not restart or replay
attacks skipped during the rest.

Normal is the default and preserves existing behavior, including user mutes.
Rest affects raw HB follower clip notes on that physical track. At the actual
section boundary, the existing gate owner releases its current sequencer notes
once; subsequent clip attacks are suppressed until Normal returns. No additional
note ledger, scheduler, clock, or donor cache is introduced.

## Scope and ownership

- Source clips, independent speeds/cycles, automation, recorded Grid holds,
  Source Weaving routes and underlying mixer/routing settings keep running.
- Live playing remains available, including a live note sharing a pitch with
  the sequenced note being released. Conductors, pre-rendered notes and actively
  recording tracks bypass this policy. Live/generated Follow behavior is outside
  this clip-output policy.
- This is a musical rest, **not an all-output hard mute**. HB release tails and
  instrument/effect tails follow their existing release settings. It does not
  silence externally running stock clips or change MIDI channel assignments.
- Note-bound operations have no new attack to act on during Rest. Independently
  scheduled automation and holds retain existing behavior and may affect live
  playing. Energy/Space still apply to eligible attacks when Normal returns.
- Editing is stopped-only, including the pending-start guard. Clearing a recipe,
  leaving it for an unconfigured occurrence, or manually clearing the Song returns
  to Normal through existing rules. Stop deactivates the policy.

The local audio mixer and routed MIDI are separate existing paths. Rewriting
their settings would obscure ownership and restoration. This bounded control
uses the sequencer's existing note lifecycle and deliberately leaves a universal
audio/MIDI hard mute for a separate design if needed.

## Persistence and shared host contract

Normal set save/autosave and Undo include the setting. Existing `sg`, `ss1`,
`sh1`, `song_section_<index>` and `song_shape_<index>` are unchanged. A nonzero
rest mask adds **`sp1 <index> <rest_mask>`** after the corresponding `ss1` line.
Bit0 is physical track1, through bit15/track16. Older sets default to Normal.
Older builds ignore `sp1` and lose it when re-saving.

Targeted edits reuse the existing undoable command family:

```text
songsection <index> sound <track 0..15> <0 Normal | 1 Rest>
```

`song_participation_<index>` returns `index rest_mask`, or no value for an
absent entry. The production schema-1 `song_section` JSON gains:

```json
{"participation":{"scope":"follower-clips","target_rest_mask":10,"effective_rest_mask":10}}
```

Target belongs to the current occurrence. Effective excludes non-followers and
recording tracks, and is zero while stopped or before first launch. It describes
policy eligibility, not measured silence: rendered notes, live voices and tails
remain outside the policy. Reads do not advance time or change state.

The shared controller uses the existing Entry/Track selectors and ordinary
bounded read rotation. The browser adapter should allow/watch the new getter
prefix, preserve the production save blob and pass through the additive snapshot.
No JavaScript musical policy is needed. Matching UI/DSP identity is
`0.71.0-section-participation1`.

## Verification and release

Engine regressions cover exact Normal behavior, another actor reading a resting
donor, scaled donor phase and automation, sustained-note release at a boundary,
phase-preserving return to Normal, conductor/rendered/recording/live capture,
save/load/Undo, malformed/running edits and read neutrality. The actual shared
Schwung controller exercises Track and Clip Sound through the existing page.
Production-chain testing covers same-pitch live/recorded ownership at the rest
boundary and final release to silence.

The release includes Source Weaving 226 and Section Shape 224. Full native,
browser/controller, production-chain, inherited benchmark and ARM packaging
checks gate publication; the installer advances only after upload checksum
verification. No physical device or browser Site is deployed by this increment.
