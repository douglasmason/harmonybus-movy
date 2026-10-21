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
