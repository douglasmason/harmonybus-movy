# Section Shape — Movy 0.34.1-hbclean.224

Give each Song Section a different attack strength and amount of space while
retaining its source material and independent donor loops.

## Use

1. Build a Song with Session → hold Loop → press odd step buttons for scenes.
2. Stop, then open **Joint Setup → Song Sections → Section Shape**.
3. Choose **Entry**, then turn **Energy** or **Space**. The entry becomes an
   explicit section, so adjacent presses of the same scene can have different
   shapes. Bars and Scene/Keep/Stop remain on the parent Song Sections page.
4. Play. The current section's shape applies to new follower clip attacks from
   its actual launch boundary. Existing sounding notes finish normally.

| Control | Range / default | Meaning |
| --- | --- | --- |
| Energy | −100…100 / 0 | Relative MIDI attack velocity: 50…150% of the incoming velocity, clipped to 1…127. No additional attacks. |
| Space | 0…100 / 0 | Eligible attack omission rises from 0…75%; remaining gates shorten from 100…25%, with a one-tick minimum. |
| Shape Scope | Read only | All playing HB follower clips across the set, independent of selected quartet or track. |

Start with Energy −40 / Space 40 for a restrained section, return to 0 / 0 for
the original material, and try Energy 30 / Space 0 for a stronger arrival.
Energy is an attack-strength control; the instrument's velocity response
determines how it sounds. It is not a loudness normalizer. Space is rhythmic
space, not reverb. Short phrases may not match an exact omission percentage.

Both controls at zero are an exact bypass. Energy alone retains gate and
overlap behavior. Increasing Space retains a nested subset of eligible attacks,
using the existing deterministic hash of destination actor and rhythm-source
clip/phase; no reroll occurs at section changes. Simultaneous eligible chord
tones share the decision. Master-bar and source-bar downbeats and notes carrying
recorded operation metadata are protected from omission, but may have shorter
gates. Existing Humanize/Variation settings can independently alter those notes.
Pressure points beyond a shortened gate are truncated by the existing owner.

## Ownership and limits

The overlay runs once at the destination's existing clip-emission point, after
Source Weaving and Clip Variation. Neither donor notes nor Variation, rhythm,
instrument, mix, or Field parameters are rewritten. Keep retains donor phase,
scale and cycle. The existing scheduler, transformed-note retrigger handling and
gate releases own all timing. There is no added clock, queue, random generator,
or session scan in the audio loop.

Conductors, pre-rendered clips, live pads and actively recording tracks bypass
the overlay. This increment does not shape HB live-generated motifs or create
new attacks, drum fills, actor audio mutes, live cues, ramps or an automatic song.
Audio participation independent of donor playback remains a separate follow-up.
The first version edits only while stopped, including the pending-start guard.
Manual clip launch clears the Song and its overlay through the existing rules;
Stop deactivates it. A later legacy/unconfigured section uses neutral shape.

## Save, Undo and observations

Normal set save/autosave/Undo stores the shape with the section recipe. Existing
`sg` and `ss1` lines and the `song_section_<index>` response are unchanged.
A non-neutral recipe adds `sh1 <index> <energy> <space>` immediately after its
`ss1` line. Old sets load with 0 / 0. Older builds ignore `sh1` and lose shaping
if they re-save; use 224 or later to preserve it.

Targeted commands reuse the existing undoable command family:

```text
songsection <index> energy <-100..100>
songsection <index> space <0..100>
```

The production parameter `song_shape_<index>` returns `index energy space` or
no value for an absent entry. The existing schema-1 `song_section` JSON gains
an additive field, without changing current/next/epoch/visit semantics:

```json
{"shape":{"scope":"follower-clips","active":true,"target":{"energy":30,"space":40},"effective":{"energy":30,"space":40}}}
```

Target belongs to the observed current occurrence. Effective is neutral while
stopped, before first launch or outside an explicit recipe. Active means the
section overlay is eligible, not that every track emits a note or is audible;
per-note conductor/rendered/recording exclusions still apply. Existing gates
retain the shape at their attack. Reads never advance musical or Field time.
Matching UI/DSP identity is `0.71.0-section-shape1`.

## Verification

Regression coverage includes exact neutral output with Variation, monotonic
Energy, nested deterministic omission, preserved downbeats/recorded operations,
paired releases, unchanged live capture and rendered/recording paths, unequal
3- and 4-bar woven donors across section boundaries, save/load/Undo and malformed
or running edits. The actual Schwung controller exercises Energy/Space and the
stopped guard. Native DSP, existing browser/Field/controller suites, production
chain audio and ARM packaging are release gates. The real HB chain verifies
output velocities 40/80/120 from a velocity-80 source and the shortened paired
gate at full Space. The combined 223 + shaping tree passes 456 sequencer and
298 DSP tests before release CI.

Physical Move playback and iPad listening require device verification. The
standalone browser session owns integration and deployment of these shared
sources; this release does not itself update the private browser trial.
