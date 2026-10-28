# Actor phrase library — Movy hbclean.285

Comp and Bass each gain four authored phrases in the existing generator browser.
Choose **Libraries → Browse → Actor → Genre → Phrase**, then select a style.
The short style labels include `2b` or `4b` so their length is visible on Move.

| Style | Length | Comp | Bass |
| --- | --- | --- | --- |
| Pop Answer | 2 bars | An opening statement followed by an offbeat answer | Root anchors, a fifth and a late return |
| Funk Pocket | 2 bars | Short syncopated stabs with gaps between them | Root, fifth and octave figures around the Comp attacks |
| Bossa | 2 bars | Alternating syncopated chord attacks | Root/fifth half-bar anchors with optional pickups |
| Soul Space | 4 bars | Longer chords, open space and a fourth-bar response | Sustained anchors with optional connecting figures |

These are original starting patterns for audition and refinement. Bossa is also
listed under Latin. Complexity adds authored optional attacks while retaining
the core phrase and intentional rests, including at 100%. Intensity changes
velocity while preserving the authored accent relationships, pitches and timing.
Seed varies the optional-attack thresholds in a repeatable four-bar cycle.

Explore is temporary. Comp and Bass can play together, and switching the editing
actor leaves the other one running. Press the **existing Record button** to save
the selected actor's recipe and Complexity, Intensity and Style automation. The
recording destination remains fixed until that pass ends; Undo removes the pass.
There is no new recording control or automatic clip fill when choosing a phrase.

The phrase follows the existing transport/clip position. Style changes are still
accepted at bar boundaries: selecting a new phrase enters its corresponding bar
at the current position, rather than restarting a private clock. Recording a new
clip uses the ordinary count-in/launch and starts the recipe at clip position zero.
Trimmed loops retain their clip-relative phrase position. A shorter recorded take
contains only the bars actually recorded; it is never extended to fit a phrase.

The shared actor catalog supplies both the generator's core attacks and the stock
Comp/Bass library. Optional details remain in the generator's style definitions.
The saved generator stores style, seed, control curves and captured actor settings;
HB resolves the relative input pitches against the current harmony during playback.
Bake produces editable relative-input notes through the same source decisions.
The existing eight generator IDs and stock library entries retain their identity.

## Validation

Native tests cover full phrase structure and repetition, preserved rests, monotonic
Complexity, independent Intensity, temporary audition, recorded automation, reload,
Bake and Undo for all eight new styles. Shared-controller tests browse every phrase
and exercise the physical Record path and its single Undo pass. The production
Movy → Schwung → HB fixture runs each Comp/Bass pair through a full four-bar wrap,
checking mapped MIDI, balanced releases and unchanged saved content. Existing duet,
motif, native, browser, device-startup and package checks remain required.

Pair with **HarmonyBus 0.2.310**. No HB source or host update is required. Automated
checks do not replace listening and playing on physical Move; device audition has
not been performed for this release.
