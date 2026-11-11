# Session-player completion

## Saved variations

Turn Variation Seed on a recorded generator recipe, or an actively auditioned saved library recipe. A recorded source is copied once into the existing transient library audition owner; repeated seed edits change only the desired seed. Seed changes take effect at the next bar. Restore returns to the saved seed and control curves at their existing step/bar boundaries. Stop discards the audition.

Choose an empty clip and use ordinary Record to commit. Record preserves the recipe, named automation, loop length and actor settings, with the selected seed. It never overwrites the original saved recipe. Seed edits are locked during recording/count-in. The existing preview commands remain outside Set persistence and Undo until Record.

This applies to recipes supported by the existing library validator: whole bars, zero loop start and transpose, 1x speed, mapped actor settings, and generator automation only. Edited notes or unrelated automation are rejected without mutation. Euclidean patterns use Rotation rather than a seed that would have no musical effect. A different seed need not sound different at extreme complexity or for seed-insensitive material.

## Rhythmic relation

Source Expression adds **Rhythm Relation: Follow / Answer Offbeats**. Follow is unchanged. Answer Offbeats protects the actor's own first half of each quarter beat; in the second half, Follow Amount deterministically blends its own accepted rhythm with the selected donor's accepted rhythm. At zero the actor keeps its own rhythm. At full amount, beat accents remain its own while offbeat attacks come from the donor. A donor with no offbeat attacks contributes no answers.

This is an explicit metrical response, not inferred phrase-level dialogue, a delayed echo, or essential-note classification. It adds a pure phase predicate to the shared Source Weaving mask, so ordinary clips and supported recorded generators use the same behavior. It keeps donor lane filtering, raw-source nonrecursion, pitch selection, gate clocks, recording bypass and deterministic ownership. No queue, allocation, extra RNG or new transport clock is introduced. Source Expression uses the existing unified settings surface on Move and Remote UI; Session and specialized buttons are unchanged.

## Sustained harmony

The bundled HB source adds Retrigger Held: Preserve Common. Together chords retain exact common pitch/channel voices during live harmonic refresh. Arp, strum, rhythmic gates and explicit new attacks keep their articulation. See HB's common-tone continuity notes. Existing Off/On values remain compatible.

## Physical validation still required

Desktop tests and CI do not establish audible stability on Move. This development environment cannot resolve/reach move.local:7700 and has no connected local browser. No device install or hosted browser trial update is claimed.

Use the existing audio check and reader, rather than introducing a second profiler:

1. Record installed Movy/HB/Schwung versions, Set, tempo, browser visibility and Launchpad configuration. Use the same Set and tempo throughout.
2. Capture an unchanged baseline, then one change per capture: queued conductor chords; saved variation audition and repeated seed/Revert edits; sustained pads with Preserve Common; rhythm Follow; Answer Offbeats; Launchpad X connected; visible Remote UI. Repeat the baseline afterward.
3. For each workload, open Shift + Step 12, jog to Audio, and click twice to start the existing 35-second check. Back permits playing during capture. Keep recording and set/track switches out of comparable runs; separately exercise Record, pause/restart and mode changes for stuck-note cleanup.
4. After LOG SAVED, collect audio-check-*.json from /data/UserData/schwung/ and compare using `python3 tools/audio-check/analyze.py experiment.json --baseline baseline.json`. Preserve original reports and note audible clicks separately. Internal test-tone agreement does not measure the host mix, driver or DAC.
5. Accept only complete, comparable captures; investigate reproducible callback budget/late-interval regressions, stuck notes, missed chord changes or audible crackles. Do not infer absence of crackles from low average CPU.

The report reader's 27 regression tests pass locally. Physical captures remain an explicit blocker, not a completed measurement.
