# Source Weaving

Each Joint Play actor can take pitches, rhythm and expression from different playing clips.
Open the actor's **Sources** panel (also listed in Joint Setup):

1. Choose Pitch Source and Pitch Clip.
2. Choose Rhythm Source and Rhythm Clip.
3. Choose Sequential or Timeline alignment.
4. Optionally choose Expression Source and Expression Clip (knobs 7 and 8).
5. Turn Source Weaving On.

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
empty). Expression Source independently overrides velocity and recorded poly-pressure;
per-note operations remain on the destination. Instrument parameter routing is
described below. Other HB parameter and operation timelines stay on their existing
tracks; their source selectors remain future work.

Expression always samples the latest eligible raw note at its source's own phase,
wrapping to the last note before the first onset. It is independent of the pitch
Sequential/Timeline choice. For a chord, the last stored note at the selected
onset supplies one expression pattern to all emitted voices. Empty expression
material supplies velocity 100 and no pressure. Suppressed and zero-velocity
notes are excluded. An explicitly selected stopped, muted or missing expression
clip silences new attacks without consuming sequential pitches.

The selected note's pressure offsets restart at each accepted rhythm attack and
run in the rhythm source's tick domain until gate release; they are not streamed
continuously from the expression track or stretched to fill the gate. Expression
speed, loop length and relaunch change which note is sampled at the next attack.
Edits and source changes affect future attacks only; held notes keep their
captured expression and original rhythm-clock releases. Changing only expression
does not reset the pitch cursor. Own retains the earlier behavior, including each
note's own expression when the actor also supplies its pitches.

Expression routes participate in the existing save/load and undo system. Old
seven-field routes load as Own. Recording still uses the actor's own playback
path and never records borrowed expression into donor or destination material.

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
loop positions, speed ratios and active gate counts. The sources array is ordered
pitch, rhythm, expression, instrument, HB render. These reads are on demand.
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

## Instrument automation sources (Movy 213)

Open the actor's **Source Automation** panel and select Instrument Source and
Instrument Clip. Source Weaving must be enabled. Own retains normal automation.
This routes existing `synth:parameter` lanes only: HB (`midi_fx1:`), effect and
mixer lanes continue their existing behavior.

Assign the desired synth parameter to an automation lane on both tracks using
the existing automation controls. Matching uses the full target name, such as
`synth:cutoff`, even if it is knob/lane 6 on the donor and lane 2 on the actor.
No lanes, instruments or parameter assignments are created or copied. Values
are normalized 0–127 and interpreted in the destination parameter's range;
matching names across different instruments does not promise the same Hz/time.

The raw donor clip's existing lock reader follows its own loop, speed and launch
phase, including held locks and note-triggered resets to its own lane base.
It does not follow the donor's Source Weaving routes. Values update on source or
actor step transitions and before any notes on that master tick, independently
of rhythm attacks, rests and pitch alignment. At a loop's beginning, the existing
cyclic position reader can carry a lock from the preceding end of the loop,
including on first launch. No new interpolation or Fit to Window is introduced.

Unmatched or missing lanes, source stop/mute and unavailable source clips fall
back to the actor's own position-resolved automation. Turning the route Off or
selecting Own also restores that timeline. Actor stop/mute and transport stop
restore its managed instrument lanes to the actor's base values. Source changes
never release notes early or change their recorded pressure ownership.

Recording the actor bypasses borrowing and retains its own recording path.
Automation command edits refresh on the next musical tick; note material captured
into a donor becomes visible at the next source/actor step. Save/load and native/UI
undo reuse the route and lane state already persisted. Seven- and nine-field old
routes load with Instrument Source = Own.

The runtime retains only a step/launch/availability watermark to schedule reads.
It stores no second parameter values or raw-clip cache: applied values remain in
`auto_cur`, and values are resolved through `Clip::effective_at`. Lookahead
hashing and the old pitch-cache scaffold remain unchanged.

## HB render automation sources (Movy 214)

The **Source Automation** panel now also provides **HB Render Source** and
**HB Render Clip**, independently of Instrument Source. Assign matching HB
parameters to automation lanes on the donor and actor. Supported targets are
`midi_fx1:chord_form`, `chord_quality`, `chromatic_quality`, `chord_inversion`,
`chord_voicing`, `chord_extensions`, `render_velocity_percent`, `arp_gate` and
`strum_spread` (each with the `midi_fx1:` prefix).

These are local rendering settings. Shared key/harmony, role/routing, chord mode,
arp playback/rate/hold, reset/clear actions and held/per-note operation controls
remain with their existing owners. This selector does not borrow those lanes.
Existing held notes retain their note-off and pressure ownership; changing a
render setting affects subsequent rendering through HarmonyBus's existing logic.

HB render automation uses the same lock reader and applied-value owner as
instrument automation, with an independent donor clock, phase and loop length.
Source changes and relaunches resolve the selected raw clip on the next tick.
Unequal loops continue independently; alignment does not stretch automation.
Both categories resolve before notes, including during rests. Missing/muted/
stopped donors or unmatched lanes fall back to the actor's own timeline;
actor stop/mute restores its base. Recording the actor bypasses both selectors.
Own/Off restores the actor timeline. Save/load and native/UI undo include the new
route; seven-, nine- and eleven-field saves default HB Render Source to Own.

No duplicate parameter or harmonic state, interpolation or new material cache
is introduced. Operation-source routing, other HB categories, Fit to Window and
the lookahead revision audit remain future work. Validation includes 413
sequencer tests, 292 DSP tests, dedicated browser suites and the production
Movy → Schwung → HarmonyBus fixture checking render velocity before the first
note, mute fallback, base restoration and paired releases. The two scheduler
benchmarks run explicitly in release mode. No physical device testing is implied.
## Conductor overview and Source Preview (Movy 216)

In Joint Play, use the jog dial to open **Conductor Overview**. This read-only
page shows the selected quartet's melody actor's effective harmony, authority,
root and bass, sounding key, the conductor's next known chord, and override
candidate/pending counts. The authority can be the existing conductor bus or a
track's live/input override. `Conductor Next` describes the learned conductor
progression; it does not predict the lifetime of a live override. No source
priority, defaults, saved role or audible routing changes are made. Compact
chord inversions use a colon (C:E means C over E) because the stock string
renderer treats a slash as a file-path separator.

Each actor's **Source Preview** page is available from Joint Setup, its Track
page and its Sources page. Pitch, Rhythm, Expression, Instrument and HB Render show the
resolved track/clip and its own loop percentage, or mark it inactive. These are
configured source identities even when Source Weaving is off or recording uses
own material. Playback/alignment and held-gate count appear alongside them.

**Sequencer Notes** shows distinct pitches held by the actual sequencer gate
owner (up to four names plus a remaining count). These are inputs to HarmonyBus,
not final sounding pitches after HB harmony, chord, arp or other processing.
A stopped source can leave earlier gates visible until their normal release.
Instrument-source unavailability still uses the existing own-automation fallback.

The new `source_preview_<zero-based actor>` native parameter supplies a bounded
schema-1 JSON snapshot for future remote displays. Reads do not advance pitch
cursors, re-run conditions, emit notes or change gate ownership. UI fields share
one snapshot for up to 100 ms, requested only through the existing panel refresh;
there is no independent timer or audio-block diagnostic callback. Missing or old
engines show `Unavailable`. The existing `harmony_source_snapshot` API is reused.

This increment provides on-device inspection. It does not yet add a graphical
source/result timeline, progression editing, follow-track toggles or a new Remote
UI page. A future timeline must use accepted scheduler events and distinguish
pre-HB material from final sounding output.
