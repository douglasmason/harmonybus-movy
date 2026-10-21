# Source Weaving integration audit

Status: draft groundwork, not playable cross-clip source routing. No installer
pointer, module version, or physical device was changed by this work.

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

## Refactor implemented in this draft

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
