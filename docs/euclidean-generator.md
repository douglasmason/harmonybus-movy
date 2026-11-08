# Live Euclidean followers

In **Chord Play → Libraries → Generator Browse**, choose **Comp** or **Bass**,
then the **Euclidean** family/style. The existing Generator page has:

| Knob | Control |
| --- | --- |
| 1 | Hits, 0–16 |
| 2 | Steps, 1–16 |
| 3 | Rotation, 0–15 |
| 4 | Rate: 1/16, 1/8, 1/4 or 1/2 note per step |
| 5 | Intensity |
| 6 touch | Explore / Stop |
| 7 touch | Bake the selected recorded recipe |
| 8 touch | Revert temporary edits to saved controls |

The same controller is used by native Move and the browser/remote surface.
Range remains on the existing chord settings pages; this generator uses all
eight knobs. Comp triggers mapped root inputs through the actor's chord/voicing
settings; Bass plays mapped single roots. Both follow conductor harmony.

Hits are bounded by Steps when sounding; rotation wraps by Steps and moves
attacks later. Zero hits is silence. Three hits over eight steps gives the same
3–3–2 pattern as HB Euclidean Fill. Increasing Hits may relocate existing attacks:
this is strict Euclidean generation, not additive Complexity variation.

Explore changes no saved clip or global User rhythm slot. Free exploration is
aligned to the existing transport and continues its cycle across bars, the
generator's four-bar window, and harmonic changes. Parameter edits are accepted
on the next sixteenth boundary and evaluated against that transport phase.
Changing Steps or Rate can reposition attacks; it does not start another clock.

Use the **existing physical Record button** with an empty clip on the selected
actor track. Normal count-in/bar launch anchors the new recipe at clip step zero.
Recorded recipes repeat with the clip's loop, so a cycle that does not divide its
length is cut at the loop boundary. Free audition can therefore change alignment
when a new recording begins. Harmony changes do not restart either source.

Hits, Steps, Rotation, Rate and Intensity use five named automation lanes.
Recording requires five available/matching lanes and never steals another lane.
Control preview, overdub, Revert, Undo, save/reload, User recipes and Bake all reuse
the existing generator paths. Bake materializes the recorded clip, including its
accepted controls. Existing gate ownership, swing, speed and release behavior are
retained. Euclidean attacks initially have a half-step gate at the selected rate;
saved recipe gate scaling applies through the usual path.

Recorded Euclidean clips can donate their attacks through Source Weaving. Free
exploration and incoming rhythm-following remain subject to the existing generator
limitations. This source does not redistribute motif interiors or launch whole
motifs; those are separate integrations.

The source adds bounded integer attack membership matching HB's existing Fill
convention. It reuses the transport, follower rendering, note emitter and gates.
Legacy authored and Cloud style IDs and wire formats are unchanged. The existing
Euclidean Fill editor remains available for the four shared User rhythm slots.

Validation covers every supported length/hit/rotation/rate combination, source
format validation, long-running phase, harmony changes, temporary state isolation,
all five automation controls, replay/reload/User recipe/Bake event equality,
zero-hit preview, Restore, lane exhaustion, and native-controller Record routing.
A physical Move listening test is still needed.
