# Generated parts can follow rhythm

Recorded Comp, Bass and Euclidean recipes can borrow attacks from another playing
clip, including an unbaked generator. Their pitch material, dynamics and harmonic
rendering stay with the receiving actor. The receiver keeps its own phrase clock:
adding more kicks does not rush through its bass contour.

On the receiving actor's existing **Sources** page, enable Source Weaving, select
Rhythm Source and Rhythm Clip, then use **K7 Rhythm Lane** for All or one raw note
and **K8 Follow Amount** for Own (0), exact following (100), or a repeatable blend.
For example, select a drum clip's kick lane for a recorded Root/Fifth bass. Extra
kicks repeat the material appropriate to that point in the bass phrase; its fifth
still arrives in the same phrase region. Source Preview reports **Generator
follow** or **Generator own**. These are existing shared controls on Move, Remote
UI and the browser, with no new Session mode or button assignment.

## Scope and musical contract

* At an accepted donor attack, sample the latest eligible abstract generator
  position at or before the receiver's captured phase, respecting its swing.
  Before its first position, wrap to the final eligible position. Empty recipes
  and unrecorded tails remain silent.
* Resolve current generator controls once per borrowed attack. Complexity,
  intensity and recorded curves remain live; preview edits retain their existing
  step/bar boundaries. The selected note comes from the current recipe, not a
  stale rendered-note cache or a counter advanced by donor hits.
* Follow Amount uses the same complementary deterministic mask as ordinary clip
  weaving. Common simultaneous attacks fire once. Zero restores the native
  generator attacks and any authored notes mixed into the recipe clip.
* Borrowed gates use the donor clock and selected lane's raw duration, with the
  receiver's existing recipe gate scale, variation and Bass cutoff. Changes to
  Follow Amount do not cancel a held gate. Donated rhythm remains the generator's
  original raw attacks; routes never recursively donate borrowed attacks.
* Only the incoming rhythm dimension is extended. Pitch Source, Expression Source
  and pitch-alignment modes do not replace generated material. Existing rendering,
  automation, operation and harmony policies keep their existing owners.
* Free Explore, first takes, active/pending recording and Cloud receivers keep
  their established own timing. Finish recording before borrowing rhythm. Cloud
  needs an explicit relationship between donor attacks and multitouch grain rate.
* Record still captures the generator's own recipe/control performance, not a
  flattened borrowed-rhythm take. Route settings are saved and undoable as before;
  Follow Amount is not a newly recordable automation lane.
* A stopped, muted or unavailable donor contributes no borrowed attacks. Its
  absence does not secretly restore Own at 100. Disable Source Weaving to restore
  the full own performance. Bake refuses an enabled external rhythm route, because
  ordinary baked clips have different pitch-selection semantics.

## Architecture and alternatives

This extends the existing accepted-source dispatcher and `Config::note`. The
normal generator tick continues to decide and donate its raw rhythm once. A
selected borrowed hit resolves controls once and searches at most 256 pure
candidate positions. Shared emission owns gate scaling, Bass articulation and
release tracking. A small per-tick copy of preview controls makes before/after
track ordering agree, without retaining generated events or advancing clocks.

The strongest reason to keep generated receivers self-timed is simplicity: it
avoids a new rule for what a generator means between its own attacks. That remains
the behavior with Source Weaving off, for Cloud/free exploration and while
recording. The explicit route earns this extension because generated bass/comp
can now join an existing groove without Bake or a second player framework.

Sequential selection would be cheaper to explain as “next note per kick,” but
changing kick density would move the bass contour through the phrase. Building a
materialized clip/cache would share more ordinary routing code but introduce
invalidation for preview controls, curves, swing and loop edits. Phase sampling
is bounded and preserves phrase placement with less state. Its tradeoff is that
extra attacks repeat the current material; it is not automatic counterpoint,
answering, fills, accent strength or protected-motif regeneration.

## Verification

Native regressions cover explicit pitch/velocity traces, every Follow Amount,
paired releases, donor clock ownership, curve-read counts, all recorded non-Cloud
styles, zero-hit Euclidean recipes, partial tails, preview/swing/opposing speeds,
nonzero loops, both track orders, recording/free/Cloud exclusions, donor loss,
probability, generated cycles, save/load/Undo and 32/128/1024-frame blocks.
Shared-controller tests check honest generator status. The production Movy →
Schwung → HarmonyBus audio harness checks Own/50/100, receiving Bass material,
audible PCM and balanced releases. Release benchmarks exercise 0/50/100.

These bounds do not make the entire existing emission path allocation-free, and
desktop/CI checks do not establish physical Move crackle or controller latency
performance. Device audition with queued chords and external controllers remains
the hardware acceptance step. Publishing a release does not install it on Move
or update the separately hosted browser trial.
