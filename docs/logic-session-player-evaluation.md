# Logic Session Players → HarmonyBus / Movy

Evidence review and development checkpoint — 5 November 2026

## Decision

Keep the existing actor generator, source routing, HarmonyBus renderer and Record
workflow. Do not create a second Session Player framework or a new input mode.
The most useful new musical work is adjustable rhythmic relationships, explicit
note continuity for pads, and temporary variations of saved generator recipes.
These are extensions to existing mechanisms, not replacements for them.

Follow-up development: recorded Comp/Bass recipes and their live previews now
donate rhythm through the existing clip source dispatch without Bake. This is
the first dependency for rank 1, not adjustable affinity or generated receivers.
See [scope and controls](generator-rhythm-sources.md); pitch/expression donation
and free-audition source identities remain separate work.

This session implements a narrower prerequisite: remove unused automation-curve
reads from recorded generator playback. It changes neither the musical model nor
controls. Larger additions below remain proposals.

## 1. Evidence and version boundaries

### Repositories actually inspected

| Component | Audited baseline | Evidence and limitations |
|---|---|---|
| HarmonyBus | `627014069a9b47e84744dae46042a808e05e1349`, main; installer 0.2.312 | Recent commits export retained chord queues and fix queue lifetime/scheduling. Native C implementation and targeted tests inspected/run. |
| Movy integration | `0c1c112`, main; installer 0.34.1-hbclean.319 | Latest change is Session-as-Shift and return from Clips. Earlier changes address queue copying, parameter reply allocation and microphone worker safety. |
| Movy source | `DimaDake/schwung-movy@5c01a4fe7745b730ee98111194fc64328ea2659b` | This repository is an integration/patch stack, not the complete standalone Movy tree. Prepared that exact upstream source and compiled/tested the result. |
| HB pin consumed by Movy | `d8f0b6c92ae4957a73e462dc5e570f133ab2e612` | Main adds publication metadata afterward. No engine change was inferred from the newer installer pointer. |
| Schwung build fixture | `a6f7ec9e…`, 1.7.3 chain fixture; packaged shared UI `35f401c3…`, 1.8.2 | `scripts/patch_settings_case.py` verifies/normalizes the older fixture to the pinned 1.8.2 shared UI. The build fixture and the user's installed host are distinct facts. |
| Upstream host now | [1.9.2](https://github.com/charlesvestal/schwung/releases/tag/v1.9.2), published 5 November | 1.9.0 moves speech synthesis outside the audio process; 1.9.2 fixes external MIDI channel forwarding and FX delivery. This session does not upgrade or verify the physical device. |

There were no open PRs in either project when checked. Both repositories retain
many historical branches. An unmerged branch name is not evidence of missing
functionality: the recent Session modifier branch, for example, was squash-merged
as `6086adf`. Main source and reachable commits, not branch names or old prose,
determine implementation status here.

Relevant current architecture is in `core/README.md` in HB and the actual
`integration/comp-generator`, `integration/actor-source`, `integration/variation`,
`integration/performance`, and `dev/local` code in this repository. Older docs
contain historical limitations followed by newer additions; source was checked
where those descriptions conflict. The obsolete Grid Sequencer instruction to
cycle Session modes is corrected in this change.

### Apple chronology and platform availability

Apple's live App Store listings were checked after search snippets disagreed.
**Mac 13.0 was released on the day of this review; iPad remains 3.4.** Do not use
cached Mac 12.4/iPad 3.3 snippets as the latest-version claim. [A1–A3]

| Release | Relevant changes | Attribution |
|---|---|---|
| Mac 11 / iPad 2, 13 May 2024 | Bass and Keyboard join the older Drummer; chord-following, styles and expressive performance controls are established features. | [A4] |
| Mac 12 / iPad 3, 28 January 2026 | Synth Bass/Keyboard expansion and audio/MIDI Chord ID. New synth styles include Modulated Pad, Rhythmic Chords, Pump Bass, 808 Bass and Sequenced Bass. Simple Pad appears in the current synth group; do not assume all sustained-pad behavior originated in January. | [A5–A8] |
| Mac 12.3 / iPad 3.3, 30 June 2026 | Chord ID improvements include inversions/slash chords, richer qualities and more robust solo-instrument detection. Alchemy granular synchronization and Beat Breaker additions are sound/production features, not a new actor-generation framework. | [A2, A3] |
| Mac 12.4 / iPad 3.4, 29 September 2026 | Maintenance updates. Release notes include valid scale choices for suspended chords and sequencer fixes. These are not new synth-player families. | [A2, A3, A9] |
| Mac 13, 5 November 2026 | New Play Surface includes chord-following pads and expressive controls; Step Sequencer gains multi-selection. Unified Browser and an Assistant beta are broader workflow additions. No equivalent iPad 4 release was verified. | [A1, A2] |

All of the following are documented on **both** Mac and iPad: synth styles,
Sequenced Bass Chord Response, pad Tie Notes, Follow Rhythm, regeneration,
chord-relative Step Sequencer rows and audio/MIDI Chord ID. Their interfaces and
instrument support differ; this is feature availability, not a claim of complete
desktop/iPad parity. The Mac 13 additions must be treated separately. [A7–A18]

Apple's illustrated guides and product demonstrations show the interaction:
pattern accents determine generated activity; synth players also emit modulation
and articulation information. They do not disclose the generator implementation
or offer evidence of a transferable model/training method. No hands-on Logic
project, audio comparison, or unavailable video transcript was treated as tested.
[A19]

### Behaviors worth understanding precisely

* **Sequenced Bass Chord Response:** all notes, bass notes, the first bass note,
  phrase-start adaptation, or no chord shift (while respecting the scale).
  This is a pitch-selection policy, not the same thing as voice leading or tying
  held notes. It is documented for Sequenced Bass, not every player. [A10, A11]
* **Tie Notes:** Simple/Modulated Pad can retain identical sounding pitches over
  adjacent harmonies. Keeping pitch class while changing octave is not a tie.
  Strum and phrasing are separate controls. [A12, A13]
* **Follow Rhythm:** choose a track and/or emphasize chord boundaries per region.
  Drummer applies this to kick/snare; Percussionist is excluded. It does not
  establish a documented universal continuous follow-strength parameter.
  [A14, A15]
* **LFO and envelope:** synth styles except Simple Pad expose LFOs with musical
  synchronization and assignable CC targets. Modulated Pad shapes sustained sound
  with an envelope rather than merely repeatedly sending new note-ons. [A20, A13]
* **Slides:** pitch-bend, Studio Bass articulation and overlapping-note strategies
  are distinct renderer choices. An external synth must support the selected
  strategy; generic MIDI does not guarantee a useful glide. [A11]
* **Regeneration and settings locks:** regenerate a region without changing its
  visible settings; preserve selected settings when changing style. Apple does
  not document reproducible seeds or a general harmony/groove/contour constraint
  algebra here. [A16, A17, A21, A22]
* **Automation caveat:** instrument/region automation and generated CC motion
  are documented. The inspected material does not establish that every player
  generation control, especially Complexity, can be continuously automated on
  both platforms. Do not equate the presence of an Automation view with that
  stronger claim. HB's named generator control lanes are independently verified.

## 2. Feature matrix against current code

Classes: **1** implemented; **2** implemented with meaningful gaps;
**3** existing primitives support part of it; **4** missing and worthwhile;
**5** not worth adopting in this scope; **6** opportunity to improve substantially.
The class applies to the comparison in the row, not a claim of feature identity.

| Capability | Logic | Actual HB/Movy evidence | Class / conclusion |
|---|---|---|---|
| Shared player controls | Common style, complexity, intensity and performance editor [A21, A22] | `generator.rs`, `comp-generator.ts`: shared Comp/Bass configuration, style catalog and named lanes | **1** — reuse; no new framework |
| Breadth of actors | Keyboard, bass, acoustic/electronic drums, percussion [A7, A19] | Generator's `Style.bass` distinguishes two actors; Melody has motifs/variation; drums have clip fill and temporary fill performer | **2** — not a universal five-actor generator |
| Complexity versus intensity | Independent density and strength [A21] | `Config::note`: optional thresholds preserve essential attacks; velocity scales independently | **1** — already distinct |
| Multi-bar phrasing | Region and style-dependent phrases/fills [A13, A21] | `styles.json`, `part-library/catalog.json`, phrase tests: 1/2/4-bar sources; intentional rests; four-bar seeded detail cycle | **2** — authored phrases exist; automatic phrase-aware transitions are narrower |
| Regenerate | Region variation with settings retained [A16, A17] | Seed changes free auditions; seed is intentionally fixed for saved recipes/recorded clips and during takes | **3** — saved-recipe variation audition is a real gap |
| Performance automation | Generated modulation plus ordinary automation; all generation knobs not verified | `LABELS`, `generator_capture_tick`, `generator_overdub_step`: Complexity/Intensity on steps, Style on bars, accepted curves recorded | **1** — implemented for those exact three controls |
| Audition then commit | Preview/regeneration and region editing [A16, A21] | Explore → ordinary Record, undo, count-in, protected destination; user recipes and overdub; no clip write during free audition | **6** — already a strong live workflow; extend it consistently |
| Global harmonic following | Chord Track or region chords [A23] | HB shared context/key state; conductor tracks; late relative input mapping; `shared_context`, `follower_input`, HB `key_context.h` | **1** — core design, not a missing feature |
| Bass-only / first-note response | Sequenced Bass policies [A10, A11] | Input roles/RPOs distinguish musical roles; no equivalent per-event response selector found | **3** — annotate/select role, retain existing mapping |
| Phrase-boundary harmonic response | Sequenced Bass phrase-start option [A10] | Lookahead/buffer govern harmony timing; style changes have bar boundaries; neither pins a whole follower phrase's harmonic reference | **3** — explicit response timing needed |
| Preserve rhythm on harmony change | Separate rhythmic/pitch choices [A10, A14] | HB `retrigger_held=0` affects next attacks only; generated rhythm remains separate from pitch material | **1** — event-preserving policy exists |
| Rearticulation and common-tone pads | Tie Notes and held-pad behavior [A12] | Single-note follower keeps unchanged output; chord-player owns/diffs voices, but fresh/revoice retrigger paths exist | **2** — no demonstrated uniform pad-continuity policy across all chord paths |
| Voice leading / inversions | Player voicing/inversion choices [A12, A24] | `closest_split.h`, `key_voicing.h`, `chord_register.h`, follower/key travel and chord settings; tested complete destination voicings | **1** — do not rebuild |
| Harmonic interpretation | Chords/scales and bass/inversion information [A10, A23] | Expressed quality versus derived implied chord-scale family; contextual discovery; secondary/parallel/Key Center operations | **6** — explicit intent survives transformations and rootless rendering |
| Follow another rhythm | Per-region track/chord following [A14, A15] | `source_attack`, source routes and Clip Weave; separate pitch/rhythm/expression/instrument/operation/gesture donors | **2** — substantial support, but usually exact borrowing |
| Loose following / counter-rhythm | Not verified as a universal strength control | No graded accent affinity or kick/snare lane filter in the inspected live route; separate raw donor clips work | **4** — high-value small musical extension |
| Generated sources as donors | Players coordinate through tracks [A14] | Recipe docs require Bake before pitch/rhythm donation; raw `clip.notes` readers do not generally see virtual generated material | **3** — key dependency for generator-to-generator coordination |
| Drum fills and transitions | Fill amount/complexity and kit-piece patterns [A21] | `drum_fill_runtime.rs`: lane-specific temporary tail, Record capture, shared clock; song sections/participation/shaping also exist | **2** — expand existing performer only where useful |
| Groove / feel / humanization | Swing, feel, humanize, dynamics [A21, A22] | Humanize, render rhythm, clip speed/swing and variation exist; generator adapter does not implement every ordinary clip timing transform | **2** — composition limits matter; Bake rejects lossy cases |
| Harmony-aware step rows | Chord degrees, extensions, region/global pitch source on both [A8, A18] | Grid stores pre-HB input notes and operation gates; HB maps relative input; no dedicated semantic degree-row display | **3** — improve row labels/control first; no new sequencer |
| Conditions / probability / repeats | Existing per-step controls plus January enhancements [A8, A25] | `grid.rs` and upstream clip triggers; shared probability, Repeat/Speed operations and gate/velocity controls | **1** for core primitives; full Logic inspector parity unnecessary |
| Non-4/4 phrase authoring | Additional 5/4, 7/8 pattern lengths [A8] | Generator validates 16/32/64 steps and uses 16-step bars, 384-tick 4/4 timing | **4** eventually — broader clock/format work, not a low-risk style addition |
| Rhythmic chord gates | Rhythmic Chords [A13] | Shared attack/rest/tie patterns, auto-chord, arp/strum, Comp patterns; separate pitch material | **1** for core behavior; curated recipes are cheaper than new actors |
| Pumping / evolving textures | Envelope/LFO-driven sound [A13, A20] | Motion, Field, stock LFO routing, named synth automation; no general phrase/accent envelope-fit policy demonstrated | **3** — reuse modulation targets; distinguish gates from envelopes |
| 808 articulations / glides | Style-specific slides/envelopes [A11] | Abstract note/operation/pressure and modulation primitives; no portable end-to-end 808 articulation contract found | **3** — renderer capability work, not a special bass engine |
| Offline Chord ID | Analyze audio/MIDI regions, write editable chords [A6, A26] | HB infers MIDI harmonic context; Scale Finder collects chroma; no comparable offline polyphonic audio transcription workflow | **5** for on-device replication now; optional future offline import |
| Live function inference | Not the same task as region Chord ID | `harmonic-function.mjs`: pinned seven-note hypothesis, T/PD/D/Unknown, separate chromatic flag, dwell and ambiguity rejection; advisory browser UI | **6** — preserve uncertainty and explicit user application |
| Constrained variation | Regenerate/settings locks [A16, A22] | `Variation`: deterministic gate/dynamics/omission locks, protected events, invariant pitch/onsets; source weaving separates dimensions | **2** — motif contour/phrase constraints and temporary saved-seed forks remain missing |
| Playable chord surface | Mac 13 Play Surface [A1, A2] | Chord Play, RPO/motif operations, Launchpad layouts, shared native/browser controls | **1** — current controls are already more central to the live design |
| Natural-language assistant / large content browser | Mac 13 [A1] | Not a core live musical requirement | **5** — keep away from timing-critical generation |
| Capture / section structure | Flashback Capture, arrangement-sensitive players [A27] | Movy Capture, song sections, section participation and shaping are present | **2** — first audit interaction with temporary recipes; don't invent another song engine |

### Important implementation boundaries

The stored objects are not uniformly a pure symbolic AST. Ordinary `Note` values
still contain a numeric input pitch, `InputKey`, actions and pressure; a `rendered`
flag separates already-rendered material. Generator clips additionally store a
recipe/configuration and automation. That is a useful abstract-first design:
numeric input references are not automatically final MIDI output.

HB's portable package currently contains stateless harmony, assignment, rhythm
and operation vocabulary. The stateful bus, key changes, held owners, arp and
motif runtime remain in HB's existing instance. Movy owns clocks, clips and
recording. Do not instantiate another harmonic bus for a browser or generator.

Scale Finder's native microphone path is implemented, not merely planned:
bounded PCM capture feeds a demoted worker; analysis and diagnostics use epochs
to reject stale sessions. Browser microphone analysis and the optional function
timeline are separate. The function timeline does not currently choose chords,
change the live key, or drive actors. Copy remains the explicit key/scale commit.
Desktop synthetic checks do not establish accuracy with a live band or speakers.

## 3. Ranked recommendations

Ratings are judgments, not measured utilities. H/M/L mean high/medium/low benefit
or fit. Performance risk and effort are better when low. Novelty means genuinely
missing in the audited implementation. Priority weighs musical value and live use
more heavily than breadth or similarity to Logic.

| Rank / candidate | Musical value | Live use | Fit | Novelty | Move interaction | Performance risk | Effort | Generality |
|---|---|---|---|---|---|---|---|---|
| 0. Remove unused generator control reads | M | H, invisible | H | M | No controls | Low / reduces work | Small | Both current generators |
| 1. Accent affinity: follow/answer a chosen rhythm | H | H | H | H | Source + Amount; advanced filter remote | Medium | Medium | Bass/Comp/Melody/Drums |
| 2. Explicit common-tone continuity | H for pads | H | H | M | Rearticulate / Preserve | Medium–high ownership risk | Medium | Chords, pads, sustained bass |
| 3. Audition a variation of a saved recipe | H | H | H | H | Variation / Revert / Record | Low–medium | Medium | Shared generator/variation |
| 4. Response timing and role scope | H | M | H | M | Next Attack / Phrase; advanced scope remote | Medium | Medium–large | All pitched actors |
| 5. Named rhythmic-envelope recipes | M–H | H | H | M | Shape + Amount | Medium CC traffic | Medium | Sound and note modulation |
| 6. Extend current generator to drums/melody | M | M | M | M | Same controls | Medium | Large | Shared lifecycle, distinct event content |
| 7. Non-4/4 source phrases | M–H | M | M | H | Phrase/meter configuration | Medium | Large | Whole sequencer |
| 8. Functional evidence influences accompaniment | M, unproven | M | M | H | Explicit opt-in, pinned hypothesis | Medium, worker only | Large validation burden | Several actors |

**Rank 1 dependency:** first choose the source contract. A kick-only ordinary
clip already works as an exact rhythmic donor. A mixed drum clip needs a lane
filter; an unbaked generated donor needs access to its accepted abstract attacks.
Do not claim either from today's raw-note Source Weaving API.

**Strongest case for doing less:** existing recipes, a separate kick-only donor,
Clip Variation and the shared rhythm library may satisfy most performances.
Try those combinations before adding knobs. The new relationship control earns
its complexity only if a musician can hear useful intermediate/contrary results
without configuring multiple pages.

**Common tones:** keeping every old pitch can sound wrong after a real change of
harmony, and tying across deliberate attacks removes groove. Restrict preservation
to harmonic revoicing within the same owner and exact output pitch/channel. Fresh
strikes and explicit rhythmic gates must still articulate. Start with this small
policy before building broad phrase-level harmonic snapshots.

**Saved-seed variation:** keeping the seed fixed currently protects take replay.
The safer first extension is a temporary fork committed to an empty clip, reusing
the existing destination/Undo rules. Arbitrary mid-loop seed automation would need
new persistence and replay semantics and should not be slipped into Seed editing.

**More actors:** `Style.bass` cannot simply be relabeled as a generic player enum:
drums need simultaneous kit-lane events and different articulation. Share the
audition/Record/parameter lifecycle first, and generalize the event producer only
after a second producer proves the necessary interface.

## 4. Architecture proposal

Keep four distinct decisions. Combining these into more Travel enum values would
produce an unmanageable cross-product and ambiguous saved-state migrations.

| Decision | Owner | Reused mechanism | Proposed extension |
|---|---|---|---|
| Musical material and rhythm | Movy clip/generator | `Config`, actor catalog, accepted source attacks | Optional phrase identity and immutable source view |
| When/which harmonic context applies | HB event context | Conductor timeline, Key Center and existing follower timing | Opt-in attack/phrase response boundary plus event-role scope |
| Which pitches/voicing result | HB renderer | RPOs, scale resolution, follower/key travel, closest assignment | Reuse unchanged; no absolute-note pattern copy |
| How sound continues/articulates | Existing voice owner and instrument route | Gate ownership, revoice diff, note/CC output | Continuity policy and explicit instrument capabilities |

Rhythmic relationships should be bounded transformations of source intent. First
derive an accent/onset view at the existing source clock. A destination's seeded
selector then accepts, accents or avoids eligible events with a strength value.
Keep its own core attacks/rest constraints, harmonic reference and duration policy.
Use raw source views or an immutable previous prepared window, never recursive
evaluation of A-following-B-following-A. Cycles must have deterministic semantics
independent of track order. No new timer or playback thread is needed.

A phrase response policy should capture an eligible reference at a defined phrase
boundary while treating explicit Key Center operations as a separate axis. The
first design should retain the current live key transformation and delay only the
chosen chord-response component; freezing the whole global context would silently
ignore a performed modulation. Specify behavior on loop trim, scene launch, stop,
manual chord override and unknown harmony before implementation.

Articulations belong at different levels:

* A desired connection, accent, gate or slide is musical intent associated with
  an event/transition.
* Repetition, rhythm replacement and envelope timing are transformations using
  the existing clock and source references.
* CC number, pitch-bend range, channel ownership, MPE, keyswitches and overlap
  interpretation belong to the instrument renderer/profile. Reset bends and
  modulation on cancellation/reroute; never assume every synth obeys CC74 alike.

Functional inference should initially influence only low-stakes candidate
ranking or fill restraint, after an explicit opt-in and a pinned key. Unknown
must mean no suggestion, not an invented tonic. A valid dominant label cannot
uniquely identify the next chord. Keep the user-selected conductor authoritative.
Test abstention and false positives before adding more chord vocabulary.

## 5. Consolidation and UI

1. **Keep the shared actor catalog canonical.** `styles.json` already references
   catalog attacks, and the patch builder rejects collisions/invalid phrases.
   Add original musical content through those definitions rather than per-surface
   patterns or a parallel browser generator.
2. **Connect generated material to the existing source contract.** Today Bake is
   the bridge. Prefer a bounded accepted-event view over duplicating note
   generation in Source Weaving. Distinguish raw authored versus performed
   probabilistic events; sharing the latter should not reroll the donor.
3. **Share variation identity, not every policy.** Generator optional attacks,
   Clip Variation and humanization all use deterministic decisions, but differ
   in what must remain invariant. Reuse seed/event identity only after golden
   traces protect existing saved performances.
4. **Consolidate documentation and panel vocabulary.** Historical docs use old
   Session cycling and describe limitations later removed. Prefer current capability
   summaries with links to historical release notes. Existing generated metadata
   and shared panel components should remain the source for controls.
5. **Preserve distinct timing roles.** HB rhythmic rendering, Movy source attacks,
   Clip Weave and instrument LFOs are not automatically duplicate sequencers.
   They run at different boundaries. Consolidate a shared vocabulary/contract
   before attempting to merge their state machines.

On Move, retain **Session → mode selector**, Session as alternate Shift, and the
double-click Clips/previous-view behavior. Use existing actor Libraries/Generator
and Joint panels. Keep Style, Complexity, Intensity and Variation prominent;
expose an explicit Regenerate action only when its preview and commit semantics
are implemented. Do not repurpose Sample, Loop, Copy, X or Mute globally.

On Remote UI, expose source filtering, preserved dimensions, phrase length,
response timing and articulation capability details through the same engine
commands. Show the active recipe, pending boundary and Record destination.
The browser emulator must consume the same controller/metadata; neither browser
animation frames nor a JavaScript harmony clone should drive musical time.
Launchpad should invoke the same actions with source-aware release ownership.

### Useful combinations available now

* **Bass on a kick:** use a kick-only ordinary donor clip and Source Weaving's
  rhythm source, retaining the bass's mapped root material. This is exact
  following; it is not yet loose affinity or a mixed-kit kick filter.
* **Comp and bass duet:** start both existing Explore sources, use Complexity
  for optional details and Intensity for accents, then Record the chosen actor.
  Selecting the other actor does not redirect an already armed take.
* **Variation without changing melody:** lock unwanted Clip Variation dimensions.
  Its current transformation keeps pitches/onsets unchanged. Generator recipes
  have their own composition limits; do not assume every clip transform applies
  before Bake.

## 6. Implemented change and validation

`generator_tick` used to resolve three automation lanes on every tick even when
ordinary recorded playback discarded the result and resolved them again at the
candidate attack. It now reads those base curves only where an active saved-source
preview consumes them. Normal playback still resolves controls at the actual swung
attack, so there is no stale step cache and no invalidation protocol.

The regression fixture records an eight-bar performance with control/style
changes, replays it and compares every emitted attack/release. It requires **128
configuration evaluations rather than the previous 3,200**: 3,072 discarded reads
are eliminated. This is a 96% reduction in this particular evaluation count, not
a 96% CPU improvement. Each configuration resolution previously scanned up to
three automation lanes. No new release-build allocation, clock, persistent field
or musical parameter is introduced. Test-only thread-local counters are excluded
from production builds.

A second regression edits intensity after a source grid step but before its swung
attack, verifying that the sounding note uses the new value. Existing tests cover
free exploration, saved-source previews, user recipes, control acceptance,
record/replay/Bake, count-in, Undo, companion actors, swing and block sizes.

The baseline and changed full native seq-core/movy-dsp suites passed locally;
the changed run has 942 passing tests and six intentionally ignored benchmarks.
TypeScript typecheck and browser build passed. Eleven focused controller suites
passed, covering generator controls, overdub, both actors, duet, phrases, saved
recipes, Restore, variation, Field, Grid and Session modifiers. Seven targeted HB
native suites passed: harmony core, probability, follower timing, Auto Chord
Repeat, key travel, rhythm generation and adaptive operations.

The full production Movy → Schwung chain → HB audio harness passed, including
generated Comp/Bass, duet, recipe recall/Record/Undo, changing harmonic context,
queue retention/copy and balanced releases. These checks exercise the actual
renderers; they do not establish physical Move deadline behavior. Merge identity
and hosted CI results are reported with the PR/session outcome. No physical Move
listening, DAC capture, firmware installation or browser deployment is claimed.

## 7. Remaining work and acceptance gates

| Next work | Acceptance before merge/release |
|---|---|
| Finish performance validation on Move | Compare recorded generator loops and queued chords, controls and Launchpad input with identical set/tempo; capture existing CPU/deadline telemetry and audible output. |
| Rhythmic affinity prototype | Demonstrate musically useful Own/Follow/Answer endpoints and intermediate strength; stable seeds; isolated kit-lane selection; no recursive routes; muted/missing donor policy; unchanged protected attacks. |
| Common-tone continuity | Exact MIDI traces across chord and Key Center changes, fresh strikes, partial overlap, shared channels, release tails, mute, stop and cancellation; no stuck notes or disappearing intended attacks. |
| Saved recipe variation fork | Audition leaves serialization/Undo untouched; Record binds one destination and seed; Revert restores original; save/reload reproduces result; capacity errors are atomic. |
| Harmonic response policies | Separate chord response from key travel, voicing and articulation; test phrase boundaries under trim, variable lengths, transport restart and unpredictable live harmony. |
| Synth articulation profiles | Capability negotiation and bounded CC rate; reset/ownership tests; audition on at least one real external mono synth and one hosted instrument. |
| Functional suggestions | Labeled musical fixtures with silence, dyads, ambiguous/modal harmony and noise; report abstention/false-positive rates; manual conductor always wins. |

There is no claim that all timing-critical paths are allocation-free. For example,
source-note cloning can copy pressure vectors, and commands/status/recording have
their own allocation behavior. Those deserve separate measured audits. Moving
more generation onto the audio path without a bounded source contract would work
against the project's reliability goal.

## Primary Apple sources

Sources were read on 5 November 2026. Manual URLs may redirect to their current
edition; version attribution above uses release notes/App Store history rather
than assuming the latest manual's behavior existed in every earlier release.

* [A1 — Current Mac release notes, 13.0](https://support.apple.com/en-us/109503)
* [A2 — Mac App Store version history](https://apps.apple.com/us/app/logic-pro/id634148309?mt=12)
* [A3 — iPad App Store version history](https://apps.apple.com/us/app/logic-pro-make-music/id1615087040)
* [A4 — May 2024 Session Player introduction](https://www.apple.com/newsroom/2024/05/logic-pro-takes-music-making-to-the-next-level-with-new-ai-features/)
* [A5 — January 2026 announcement and availability](https://www.apple.com/newsroom/2026/01/introducing-apple-creator-studio-an-inspiring-collection-of-creative-apps/)
* [A6 — iPad release notes](https://support.apple.com/en-us/101628)
* [A7 — Mac Synth Player styles](https://support.apple.com/en-eg/guide/logicpro/lgcpc49d7e59/mac)
* [A8 — Mac 12 features including Step Sequencer changes](https://support.apple.com/en-gu/guide/logicpro/lgcp4a62a494/mac)
* [A9 — iPad 3.4 release notes](https://support.apple.com/en-sg/101628)
* [A10 — Mac Synth Bass response policies](https://support.apple.com/en-eg/guide/logicpro/lgcp7d1b5306/mac)
* [A11 — iPad Synth Bass and slide modes](https://support.apple.com/en-gb/guide/logicpro-ipad/lpipd090cc55/ipados)
* [A12 — iPad Synth Keyboard, ties and phrasing](https://support.apple.com/en-au/guide/logicpro-ipad/lpipc59c26f8/3.3/ipados/26)
* [A13 — Mac Synth Keyboard and envelope behavior](https://support.apple.com/en-kg/guide/logicpro/lgcp4ea55ff5/12.3/mac/15.6)
* [A14 — Mac Follow Rhythm](https://support.apple.com/en-is/guide/logicpro/lgcpca8dca3d/12.3/mac/15.6)
* [A15 — iPad Follow Rhythm](https://support.apple.com/nl-be/guide/logicpro-ipad/lpip3a4ec67d/3.3/ipados/26)
* [A16 — Mac regeneration](https://support.apple.com/en-ie/guide/logicpro/lgcp717c9b17/mac)
* [A17 — iPad regeneration](https://support.apple.com/en-ie/guide/logicpro-ipad/lpip424be82f/ipados)
* [A18 — iPad chord-relative Step Sequencer](https://support.apple.com/en-sg/guide/logicpro-ipad/lpipca7af242/ipados)
* [A19 — Apple's illustrated product demonstrations](https://www.apple.com/logic-pro/)
* [A20 — Synth LFO synchronization and targets](https://support.apple.com/en-lamr/guide/logicpro/lgcp8b66376b/mac)
* [A21 — Mac performance controls](https://support.apple.com/en-ca/guide/logicpro/lgcp74b34026/mac)
* [A22 — iPad performance controls and locks](https://support.apple.com/zh-hk/guide/logicpro-ipad/lpip6efdfca1/3.3/ipados/26)
* [A23 — Chord Track versus region chords](https://support.apple.com/guide/logicpro/chords-and-session-players-lgcp70dd5af3/12.3/mac/15.6)
* [A24 — Keyboard performance controls](https://support.apple.com/en-is/guide/logicpro/lgcpde2a77cd/mac)
* [A25 — Mac 12 release notes and step conditions](https://support.apple.com/en-au/109503)
* [A26 — iPad audio/MIDI Chord ID workflow](https://support.apple.com/en-ng/guide/logicpro-ipad/lpipc614f032/ipados)
* [A27 — Mac 11 release notes, capture and arrangement fixes](https://support.apple.com/en-ae/126835)
