# Source Weaving

Each Joint Play actor can take pitches and rhythm from different playing clips.
Open the actor's **Sources** panel (also listed in Joint Setup):

1. Choose Pitch Source and Pitch Clip.
2. Choose Rhythm Source and Rhythm Clip.
3. Choose Sequential or Timeline alignment.
4. Turn Source Weaving On.

Own means the actor's currently playing clip. Numbered sources identify a track
and clip slot. Both source slots and the actor's destination clip must be playing;
a missing, stopped or muted source produces silence. Empty destination material
is allowed when pitches are borrowed from another clip. Audio-mute source chains
if you want to hear only the actor; sequencer mute disables their source material.
Source clips are never copied into or overwritten by the destination.

Sequential consumes the next pitch/chord group at each accepted rhythm attack,
cycling after the final group. Rests and failed rhythm conditions consume nothing.
Timeline samples the latest pitch group at the pitch source's own loop position,
wrapping to its last group before its first onset. Sampling uses the shared master
tick so track numbering cannot affect the result. Rhythm timing, conditions,
quantization, swing and gate durations come from the existing source scheduler.
The source clock services each gate even when the actor has another playback speed.

Pitch-source note keys and rendered-note identity are preserved. Expression and
per-note operations default to the destination actor's own material at its current
phase (velocity 100 and no per-note expression/operations when that material is
empty). Instrument automation and actor operation timelines stay on their existing
tracks. Separate selectors for those additional dimensions are future work.

## Three starting patches

- **Melody:** Pitch Source = the melody clip's track/slot, Rhythm Source = the
  rhythm clip's track/slot, Alignment = Sequential.
- **Bass:** Keep one register-anchor note in the bass actor's own clip. Pitch
  Source = Own, Rhythm Source = the desired rhythm clip. In the bass track's
  existing HB settings choose Chord Mode = Conductor Chord and Chord Form =
  Root Only. The existing conductor remains the harmonic authority.
- **Comp:** Use the same arrangement on the comp actor; choose Conductor Chord
  with the desired chord form and inversion. Existing chord/arp settings generate
  the voicing. No second chord engine is involved.

Source routing replaces recorded Follow/Guide input to that actor while enabled.
Live pads keep their existing routing. Recording an actor temporarily uses its
normal own-material playback path; borrowed notes are not written into its clip.
Source changes affect subsequent attacks. Existing gates and pressure releases
keep their original pitch/clock ownership. A pitch-source relaunch or transport
restart resets its sequential cursor; conductor harmony changes do not.

Clip Weave remains the existing momentary/operation-lane rhythm reader. Source
Weaving is persistent actor routing. They share note emission and gate ownership;
Source Weaving consumes the rhythm attacks that the source scheduler accepts.

## Diagnostics and implementation

Native `source_route_<zero-based actor>` returns the persisted route, and
`source_diagnostics` returns JSON with resolved source identities, active state,
loop positions, speed ratios and active gate counts. These reads are on demand.
The normal Joint settings metadata also exposes the controls to compatible remote
surfaces.

The initial integration uses bounded direct source views at accepted attacks.
It does not install a second cache lifecycle or hash/extract clips on idle audio
blocks. No source pointers or indices survive between attacks. The older draft
pitch-cache adapter remains test scaffolding, not a live cache. Existing harmonic
lookahead caching is unchanged; its producer's existing tick-level hashing still
needs a separately audited edit/record/load revision conversion.

Hardware validation: try each patch above, change source clips while notes are
held, compare half/double-speed sources, record/overdub, then stop and restart.
Check that notes release, the three/four-bar phases continue independently, and
Move/Launchpad input latency and audible crackling do not worsen. Desktop timing
measurements cannot establish device audio performance.
