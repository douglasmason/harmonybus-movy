# Source Weaving integration audit

Historical groundwork audit. See `source-weaving.md` for the implemented runtime routing and current behavior. The original audit changed no installer pointer, module version, or physical device.

Audited HarmonyBus `4f2c44b93118b6babfb9d792642602f451863814`, Movy integration
`369246998a8df5a4e5ba7db58f315231bee2011a`, and the fully patched upstream Movy
`5c01a4fe7745b730ee98111194fc64328ea2659b`.

| Capability | Existing implementation | Remaining integration |
| --- | --- | --- |
| Harmonic authority | HB conductor, follower transforms, shared key state | Route actor inputs through these same transforms |
| Clip identity | `hb_loop::Snapshot` already includes track **and slot** | Consume this identity everywhere; do not invent another one |
| Content revision | `hb_loop::snapshot` hashes stored musical data | Establish complete edit/load/record mutation notifications before removing repeated hashes |
| Harmonic cache | 128 track/slot entries with separate rendering/configuration keys in `clip_timeline_cache.h` | Keep raw material a separate projection of the same source revision |
| Clip Weave operation | `hb_weave`, operation 65, existing gates and emission path | Its gesture-relative donor rhythm is not independent source-track phase |
| Note lifecycle | `Engine::step_tick`, scaled gate countdown, retrigger and recorded pressure | Borrowed rhythm needs explicit clock-domain handling within this owner |
| Pitch groups | Draft source material adapter | Now compiled/tested against actual DSP; still no runtime consumer |
| Joint Play | Per-actor track aliases, Follow/Clip/Pads, rhythm panels | Independent pitch/rhythm references and compatible persistence |
| Recording | Suppress-until-wrap, separate live/recorded links and overwrite masks | Borrowed material must obey transient suppression without editing source flags |
| Source switching | Existing gates retain emitted pitch | Verify cross-source chord groups, pressure and changes of timing rate |
| Diagnostics | Existing remote state and profiling infrastructure | Effective routes, projection revision and source phases |
| Install | Existing releases remain untouched | Full playable integration and comprehensive release gates are outstanding |

## Original draft refactor (before live routing)

- Install source adapter modules in the real `movy-dsp` build. Previously their
  tests were not part of any Cargo target.
- Validate snapshot slot as well as track. The earlier comment claiming Snapshot
  had no slot was incorrect.
- Raw projection refresh consumes the already computed lookahead Snapshot.
  Production refresh does not independently hash the source clip.
- Raw projection keys use source identity and content revision. Launch origin is
  timing, not raw content; moving phase does not force re-extraction.
- Preserve temporarily suppressed notes in raw material. Their eligibility must
  be checked at emission; otherwise a cache built during recording can omit them
  after wrap indefinitely. Source-note indices are retained for that purpose.
- Bound extraction by the upstream `MAX_NOTES` cap. Zero-velocity events do not
  become pitch groups.
- Permit timing/material lookup for conditional clips. Lookahead's active=2
  means its harmonic repetition is not deterministic; it does not mean the clip
  has no valid source position or material. Probability is still the scheduler's
  responsibility.
- Add a pinned integration CI workflow for PR #82; it runs actual seq-core and
  movy-dsp tests without publishing a package.

## Lifecycle constraints before enabling playback

The producer must prepare harmonic and raw projections from the same snapshot
before further clip mutation. Cached indices may only be dereferenced while
that source revision is current. This draft deliberately does not retain a
second independent LRU or add another sequencer.

The existing snapshot hashes all relevant notes on musical tick updates in
`patch_loop_bridge.py`; it also scans for active notes. This audit does not claim
that work has been removed. Simply keying a new cache with that hash does not
make the producer event-driven. Upstream Clip fields are public and recording,
undo/load, direct command edits, and per-pass flags have distinct mutation paths.
A revision-counter conversion must cover those paths before trusting a counter.
The present hash also does not describe all future expression/automation source
dimensions; extending those projections requires defining their revision inputs.

Prefer extending the existing step-tick emission path. Borrowed rhythm gates
cannot silently count down at the destination clip rate when source rates differ.
Do not implement routing by rewriting output MIDI after gates have already been
owned, or by copying source clips into destination storage.

## Validation

Local baseline: 378 seq-core tests and 282 movy-dsp tests passed.
After this refactor: 378 seq-core tests and 290 movy-dsp tests passed, including
all eight source adapter tests. A fresh upstream application is also checked;
adding the module before the existing recorded-chords patch broke that patch's
context, so installation now occurs after the existing patch sequence.

These tests validate the draft projection contract, not playable weaving. No
cross-clip playback performance improvement, hardware audio result, independent
source-routing behavior, release artifact, or install readiness is claimed.

## Runtime integration follow-up

`patch_source_routing.py` now routes real accepted source attacks through the
existing note-emission and Gate implementation. Gate clocks retain the rhythm
source; existing note releases keep their owner across source changes.
Sequential/Timeline selection, Joint source panels, native persistence and
on-demand source diagnostics are implemented. The production chain fixture
exercises melody weaving plus Conductor Chord Root Only/Triad for bass/comp.

The raw cache was not activated: bounded direct source reads at attacks avoid
a second lifecycle, stale pointers, or full-clip hashing on idle blocks. The
draft projection modules remain regression scaffolding. Separate expression,
instrument/HB automation and operation source selectors are deferred; the actor
retains its own expression and operations. Existing lookahead producer hashing
is unchanged and remains a performance follow-up, not a claimed fix.

### Existing upstream harness mismatch

The legacy `browser-test/app-loop.mjs` was executed on both the routing build
and a fresh pre-routing baseline with the same pinned Schwung controller. Both
produced the same 11 navigation/browser assertions and stopped at the same
`move_midi_internal_send is not a function` harness error. It is not counted as
a passing suite. The new workflow uses the current release's dedicated Joint,
Session, Field and Grid checks plus the full upstream logic suite, rather than
claiming this legacy harness passes.

## Expression increment (Movy 212, based on main 211 / HB 288)

The expression selector reuses `Clip::Note.vel` and `Note.pressure`, the bounded
raw note reader, and `emit_clip_note`/`Gate`. It adds no automation lane, parameter
state, cache or harmonic authority. `source_positions` samples donor phase before
track iteration; pressure is captured per attack and runs in rhythm-clock ticks.
The route appends two optional fields, retaining the seven-field legacy parser.
Expression-only edits do not reset the pitch cursor. Destination automation,
grid and shared-context preparation still precede every borrowed attack.

Further timeline audit against the generated current source:

| Dimension | Reusable representation / reader | Work still required |
| --- | --- | --- |
| Velocity / pressure | Raw `Note.vel`, `Note.pressure`; existing gate pressure playback | Implemented independent donor; no continuous donor pressure streaming |
| Instrument automation | `Clip.locks`, `lock_at`, `Engine::emit_automation`, `OutEvent::Cc` | Resolve lane destination identity, base/reset semantics and stop/switch restoration before borrowing |
| HB parameter automation | Same numbered lock lanes and downstream CC dispatch | Distinguish HB targets from instrument targets; a lane number alone is not a portable parameter identity |
| Recorded HB context | `Clip.shared_events`, `shared_track`, existing shared/key playback owners | Preserve conductor authority and explicit release ownership; do not copy conductor state into an actor |
| Per-note operations | `Note.actions`, `RecordedActions`, existing emission helper | Remain destination-owned; a future independent selector must preserve note-relative mapping |
| Held operations / clip readers | `Clip.operation_intervals`, `Interval::window`, grid gates and existing performance owners | Define donor-clock interval sampling and switch/stop release before routing |

Rechecked `patch_loop_bridge.py`, `integration/hb_loop.rs` and HB's
`src/clip_timeline_cache.h`: snapshot hashing and the harmonic timeline cache are
still the existing path. The hash includes musical notes, locks and operation
intervals but does not constitute an expression-pressure revision. Expression
reads therefore remain bounded direct reads at attacks. No old scaffold cache is
activated, and no claim is made that the edit/record/load invalidation audit or
hashing optimization is complete.


## Instrument increment (Movy 213, based on 212 / HB 288)

The audit found `Clip::effective_at`, the existing pure cyclic automation reader,
and `Track::lane_label`, the persisted full target identity. Instrument borrowing
matches exact `synth:` labels across existing lanes, reads raw donor locks with
that reader, and emits through the existing destination `OutEvent::Cc` path.
HB, mixer and effect labels are excluded. No second parameter mapping or harmonic
state is introduced. The step watermark is scheduling state, not a material cache;
commands, launches, transport and load invalidate it. Direct automation auditions
also notify the existing `auto_cur` owner so a subsequent borrowed value cannot be
incorrectly suppressed as already applied. Recording note edits refresh by the
next step. The pre-track pass establishes automation-before-note order regardless
of track indices or playback speeds, including when there is no rhythm attack.

Remaining: independent HB-parameter selectors (with target/category semantics),
per-note/held operation selectors and Fit to Window. Instrument routing does not
solve those lifecycles or the harmonic revision/hash audit.


## Movy 214: independent HB render automation

Audited HarmonyBus a360d2f4a0331e6778a128638c39252865b195b8 setters before
selecting targets. Chord form/quality/chromatic quality/inversion/voicing/
extensions, render velocity percent, arp gate and strum spread update local
render configuration. Chord mode and arp playback flush/restart note state;
arp rate reschedules runtime timing; hold/clear and operation parameters own
latches or gestures; key/context parameters can mutate shared harmony. Those
categories are deliberately excluded from this increment. No HarmonyBus DSP
change is needed.

`source_automation.rs` generalizes the instrument engine with two donor phase
watermarks and one managed-lane mask. `automation_dimension` is an explicit
allowlist for HB rendering; exact target matching and `Clip::effective_at`
remain the readers, `auto_cur` remains the sole applied-value owner. No copied
lanes, recursive donor routes, harmonic state or persistent raw pointers.
Stop/mute/record/launch/edit invalidation is shared with instrument routing.
Routes add an optional final track/slot pair; old 7/9/11-field routes remain
valid. Diagnostics append HB render after instrument. Source Automation has
independent instrument and HB selectors; all four controls use existing undo.

New native regressions cover separate donors on either side of the actor index,
automation-before-note ordering, unequal clocks through rests, category
exclusions, route switching, donor stop, actor mute/record, releases and old
save parsing. The actual production-chain fixture confirms HB's 400% velocity
render reaches the first note, mute restores the actor lock, transport stop
restores base and the note-off pairs. Existing instrument lifecycle and all
previous pitch/rhythm/expression regressions still pass. Lookahead hashing and
the unused pitch-cache scaffold remain unchanged.

Remaining: held/per-note operation selectors, additional HB categories only
after their ownership semantics are defined, Fit to Window, and the existing
harmonic lookahead revision/hash audit.


## Movy 217: recorded note-operation source

Refreshed main and preserved concurrent Movy 215 Clip Variation. Audited three
existing operation representations: immutable `Note.actions`, clip-reader
`operation_intervals`, and `grid_gates` with live hold/config ownership. Only
`Note.actions` is routed in this increment. A single generic bounded phase-note
reader now serves expression and note operations. The new selector copies the
existing Actions value per accepted attack into the ordinary `emit_clip_note`
path; HB's RecordedActions event still precedes its matching note. The destination
continues to own grid/held state, recorded key context and note releases. Rendered
notes bypass operation reapplication through the existing emitter.

HB's recorded words encode note-relative outcomes and approach provenance;
copying them does not copy the donor's live lane assignments, pending key actions
or timed holds. HB continues to interpret them at the destination. Missing/muted/
stopped donors preserve normal actor actions; empty active donors clear the
recorded override, which does not disable the actor's live controls.

Six new native regressions cover pre-note chord events, track iteration order,
independent phase, chord ties, donor unavailability/empty material, pressure and
release ownership, unchanged grid masks, recording, rendered pitches, native
undo and old saves. The production-chain fixture verifies recorded Transpose +2
on the first note and actor fallback after donor mute, with both paired releases.
All 424 sequencer and 292 DSP tests pass, along with browser logic, 20 dedicated
suites, device-script checks and both explicit release benchmarks. No hardware
latency/crackle claim is made. Lookahead hashing remains unchanged.

Remaining: independent timed/held-operation routing, other HB categories, Fit to
Window and the lookahead edit/record/load revision audit. Avoid combining these
into a generic event bus: each already has an owner that should be reused.

Concurrent Movy 216 conductor/source overview was preserved before release.
Note-operation identity is appended to native previews and shown on the Source
Operations panel without displacing the existing eight-field Source Preview.


## Movy 219: Grid hold source

Refreshed to Movy main 22be239 and HB b907f48 (0.2.289), preserving stock-host
Field modulation. Grid gates are raw start/end/lane intervals. The existing
`grid_tick` owns both the emitted GridMask and destination clip-reader holds;
HB `motion_sequence_mask` owns sequencer holds separately from live `held` bits.
Its stopped-lane handling explicitly excludes live-held lanes. Reuse all these
owners: only mask lookup selects a donor, and a pre-track pass resolves routed
actors every master tick. A boolean marks actors needing one final restoration
after routing is disabled; no second hold/value cache is introduced.

Donor phase is captured before track iteration. Hold edges use that phase;
destination clip-reader gesture origins/age still use the actor's clip/clock.
Repeated grid_tick calls do not advance gesture age or duplicate mask edges.
Source switches that keep a lane down do not release/reacquire it. Source
unavailability falls back to own holds, while active empty material supplies zero.
Actor recording bypasses borrowing. Existing flush/stop paths release Grid holds
without taking ownership of live holds or sounding notes.

Regressions cover track-order independence, fast donor/slow actor releases during
rests, source availability, recording/Off/Own restoration, mute, empty sources,
relaunch, stop, raw nonrecursive reads, destination clip-reader ownership, save
compatibility and native undo. The production-chain fixture checks Transpose on
an accepted note, source-mute fallback and a simultaneous live hold surviving the
sequencer release. Browser tests exercise both donor controls through the shared
controller with existing undo enforcement. Native and ARM gates run in CI because
the refreshed local workspace has no Rust toolchain. No hardware deployment.

## Movy 220: recorded gesture sources

Based on Movy c00d5e4 (219) and HB b907f48 (0.2.289). `recorded_actions::Interval`
already reconstructs a `Performance`/`ReadWindow` without retaining state. Reuse
that reader at the scheduler's recorded fallback, after live/automatic and Grid
readers. Donor phase selects the interval and age; translated origins wrap tick
offsets into the actor loop. The ordinary scheduler still applies conditions,
accepted attacks, gate scaling and source selection. Foreign rhythm keeps its
existing scheduling owner. No changes to HB or shared harmonic state are needed.

The master snapshot includes playing slots (muted tracks resolve unavailable)
for this reader, preventing mid-tick launches from changing selection according
to track numbering. This is scheduling metadata, not a new musical cache.
Read raw intervals up to the existing 4096 cap; the donor's routes cannot recurse.
An available empty/inactive interval replaces own recorded gestures with none;
unavailable donors, recording and disabled routing use the old reader.

New native regressions exercise scheduler attacks/releases in both track orders,
independent donor rate and relaunch, all four readers and loop-offset mapping,
availability/recording, live/Grid priority, foreign-rhythm gate ownership,
snapshot launch behavior, save/undo and legacy routes. The production chain
fixture checks eight repeated attacks and paired releases through Movy → Schwung
→ HB. UI controls use the same native route and undo queue, on a separate panel
within the eight-knob limit. Fit to Window, additional HB automation categories
and the lookahead edit/record/load revision audit remain unfinished.

## Movy 223: close stored lookahead identity gaps

Refreshed to main 84b270f (Song Sections 222), preserving Field overview 221,
with HB b907f48 (0.2.289). The producer still reads public Clip/Track fields at
musical ticks and stopped refreshes. There is no complete existing clip-content
revision counter to substitute: `dirty` is a save/UI flag, playback mutates flags,
recording writes directly, and undo/load replace content. HB's separate rendering
keys and lane revisions do not cover these Movy mutations.

Concrete omissions fixed in the existing content hash: Grid gate start/end/lane,
shared context tick/kind/on/a/b/c, all trigger fields, and track automation lane
assignment, full target label and base. Counts and label lengths delimit the new
collections; a content-schema marker prevents reuse of old persisted hashes.
Notes, locks, key identity and timed gesture intervals keep their existing hash
coverage. Fired/cycle/current automation values remain runtime state, not content.

| Mutation path | Current coverage / evidence |
| --- | --- |
| Grid editor commands | Existing gtog mutates raw gates; new hash changes immediately |
| Shared context recording/replacement | Existing shared_capture and sorted record update raw events; regression checks both |
| Trigger edits | Full step/lane/probability/A/B/invert identity; nonperiodic activity rule unchanged |
| Automation assignments/base | Existing auto_label/auto_base reflected without relying on emitted current value |
| Undo/redo | Existing usnap/uswap restores content identity, not a monotonic counter |
| Save/load | Same serialized content recreates the same hash; no new save fields |
| Copy/launch | Content copied by existing clip clone; slot identity remains part of the hash |
| Mute/stop and relaunch | Existing activity/phase owner remains authoritative; mute does not mutate stored identity |
| Ordinary playback | Existing wrap test and runtime-field regression keep content identity stable |

This is a bounded correctness increment, not a completed cache redesign. It adds
some hash work and includes an explicit release benchmark for the producer.
A future optimization must first centralize or notify all public mutations,
including note capture/tails, edits, variation, context, load/undo, duplication and
launch timing. Do not use `dirty` as a complete cache revision and do not activate
the old source adapter cache. Pressure remains outside this harmonic projection.

Separate unresolved eligibility work: multi-source weaving cannot be assumed to
repeat at the destination clip period; recursive key context, live/automatic
reader gestures and stochastic rendering also need explicit forecast semantics.
This release fixes stored identity omissions only; it does not claim those
forecasts are now complete. Fit to Window remains unimplemented.

## Movy 225: conservative woven forecast eligibility

The existing producer described only the destination clip's period/revision,
including when raw foreign pitches/rhythm made an empty destination audible.
HB already interprets `active=2` as non-repeating, clears composed prediction
knowledge and detaches the active per-clip learner while retaining reusable own
content entries. Reuse that protocol; do not add a cache, a simulated scheduler
or an LCM-based claim about accepted attacks.

`Route::has_independent_sources` checks all eight references against the actor's
current slot. Source Weaving Off and None/explicit Own references remain eligible;
any independent reference remains conservative across donor loss and actor
recording fallback. Actor mute/stop/missing clips still return inactive. Empty
own note material cannot hide an independently routed conductor. The same pure
predicate suppresses incorrect stopped opening previews using the selected
startup slot. HB's role filter means woven followers do not block conductors.

Five DSP regressions cover dimension/alignment combinations, own/foreign slot
identity, empty and missing material, recording, read-only playback neutrality,
paired stop events, undo/save/load and stopped previews. The production audio
fixture verifies actual metadata-to-HB Non-repeating status with audible borrowed
notes and paired releases, followed by normal own learning eligibility. An
isolated test reuses HB's production learning harness to prove a ready own cache
is suspended on active=2, restored on active=1, and unaffected by woven followers;
it runs under UBSan. The larger audio fixture is not used to assert a particular
learning time because its earlier tests intentionally exercise dynamic HB state.

This establishes honest suspension, not accurate multi-source forecasts. Keep
revision hashing and its 223 coverage; other live/automatic/stochastic rendering
eligibility remains distinct. Integrated published Song Section shaping 224 (main a339c51) without conflicts;
the combined release gates include its audio fixtures and the Field route UI checks.

## Movy 226: pitch Fit to Window

Refreshed Movy d434948 / HB b907f48. Precise forecasts cannot be derived from
length LCM alone: sequential cursor, conditions and reader operations are stateful.
Keep 225 suspension and use the existing accepted-attack raw pitch reader for a
bounded, usable alignment increment. No forecast simulator or cache was added.

Replace Route's internal boolean with an explicit three-value Alignment enum;
the seventh serialized field retains 0/1 and gains 2. Native parsing rejects
other values atomically. Existing persistence and undo remain authoritative.
The phase function uses u64 multiplication of u32 offsets/lengths and integer
flooring. Actor position comes from the pre-track master-tick snapshot, so track
iteration cannot shift pitch selection. Source notes are read raw under MAX_NOTES.
The normal last-onset/chord selection and emit_clip_note path are reused.

Only pitch phase changes: actor-relative loop progress selects into the donor
window. Source availability, recording bypass, automation-before-note order,
key/render identity, expression/operation clocks and rhythm gate ownership retain
the existing paths. Alignment/source changes reset the Sequential cursor but do
not flush current gates or pressure owners. Source-donor relaunch phase is ignored
by Fit; actor relaunch follows the actor's ordinary reset. Edits are read on the
next accepted attack. Old saved routes remain compatible; new value 2 requires
this release and is rejected by older builds. Diagnostics add alignment and a
selection_phase_ticks field while preserving the prior timeline boolean and raw
phase fields; the Source Preview uses the fitted phase for its pitch display.

Regression coverage includes real scheduler chord/rest selection, faster/slower
donor clocks and track order, slow actor versus rhythm-owned releases, nonzero
loop windows, floor/wrap bounds, source-mute pressure/off retention, mode changes,
empty actors, raw edits, save/undo, recording and legacy modes. Production audio
compares Timeline and Fit with identical rhythm material and paired releases.
The existing explicit scheduler benchmark also runs both phase-based modes.
No hardware deployment or latency claim.
