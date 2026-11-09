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
For direct touchscreen editing, open **Follower generators → Euclidean** in the
standalone workspace, or **Euclidean** in the Movy Tool's Schwung Remote UI.
Choose Comp or Bass, then **Choose Euclidean**. Opening the editor itself changes
no musical source. Cloud and Euclidean share the same workspace and connection.

The touch editor shows all eight controls together and one cycle of numbered
steps. Tap a step to rotate; it does not toggle individual hits. Strong and soft
hits use distinct brightness, and the cursor uses the engine's observed step.
Explore, Play/Stop, Record, Revert and Bake use the same controller paths as the
native surface. Recording feedback identifies the actual take's track and clip,
including when another actor is being browsed; Stop recording finishes that take.
Bake becomes available after a recipe is recorded and exploration is stopped.
Fast slider gestures are coalesced, delayed edits retain their target actor,
and hidden editors stop polling. For a connected physical Move, use the Movy
Tool's Remote UI; the device mirror does not supply these semantic controls.

Range remains on the existing chord settings pages; this generator uses all
eight knobs. Comp triggers mapped root inputs through the actor's chord/voicing
settings; Bass plays mapped single roots. Both follow conductor harmony.

The adjacent **Expression** page adds:

| Knob | Control |
| --- | --- |
| 1 | Accents, 0–16, bounded by the number of hits |
| 2 | Accent Depth, 0–100% |
| 3 | Gate, 1–100% of the selected step rate |
| 4 | Intensity |
| 6–8 touch | Explore / Stop, Bake, Revert |

Accents are distributed evenly among the rhythm's hits and rotate with them.
Depth keeps accented hits at the chosen intensity and lowers the other hits;
100% leaves the softer hits at minimum MIDI velocity rather than deleting them.
Zero Accents or zero Depth disables the emphasis. Depth starts at 50%, so
increasing Accents immediately gives audible emphasis. Gate changes note length,
not hit timing. Its default 50% exactly preserves earlier Euclidean playback.
Both pages retain step-button rotation, the normal Record button, and Revert.

On the **Euclidean Generator page**, the 16 step buttons show one cycle:
red for hits, dim for rests, white for the current position, and off beyond Steps.
With accents enabled, accented hits are bright red and softer hits are dark red.
On the display, full hit boxes are accented and inset hit boxes are softer.
Tap a valid step to place the unrotated pattern's first hit there. For example,
step 5 sets Rotation to 4. Zero-hit patterns remain silent. Taps outside the
cycle do nothing. The same gesture edits a temporary draft, previews a recorded
recipe, or records rotation automation during an ordinary take/overdub.

The display shows the pattern while no knob is touched; touching a knob shows
its usual controls. The cursor observes the engine's evaluated steps, including
swing, rate, and clip timing, and disappears when stopped or muted. Pending
control edits appear in the sounding pattern when the engine accepts them.
Feedback uses the existing bounded status refresh, so very fast steps can be
skipped visually. Leaving this page restores normal chord step controls.

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

New recordings use eight named automation lanes: Hits, Steps, Rotation, Rate,
Intensity, Accents, Accent Depth and Gate. Existing five-lane recipes still load,
audition, replay and bake with their original sound. Previewing expression adds
no persistent lanes. Recording a new expression control on an older recipe
allocates only that control's missing lane, atomically, and retains its earlier
default outside the recorded interval. Other automation lanes are never stolen;
insufficient space refuses the edit. Ordinary Undo restores lane additions too.
Control preview, overdub, Revert, Undo, save/reload, User recipes and Bake all reuse
the existing generator paths. Bake materializes the recorded clip, including its
accepted controls. Existing gate ownership, swing, speed and release behavior are
retained. Saved recipe gate scaling applies through the usual path.

Recorded Euclidean clips can donate their attacks through Source Weaving and
follow another clip's rhythm through the existing generated rhythm receiver.
When following a donor, the donor retains gate ownership; the Euclidean Gate
control shapes the actor's own attacks. Free exploration keeps its own clock.
This source does not redistribute motif interiors or launch whole
motifs; those are separate integrations.

The source adds bounded integer attack membership matching HB's existing Fill
convention. It reuses the transport, follower rendering, note emitter and gates.
Legacy authored and Cloud style IDs and wire formats are unchanged. The existing
Euclidean Fill editor remains available for the four shared User rhythm slots.

Validation covers every supported length/hit/rotation/rate combination, source
format validation, long-running phase, harmony changes, temporary state isolation,
all eight automation controls, replay/reload/User recipe/Bake event equality,
accent spacing and subset membership, zero-hit preview, Restore, legacy lane
upgrades, atomic lane exhaustion, and native-controller Record routing.
A physical Move listening test is still needed.
