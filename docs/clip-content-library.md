# Clip content: shared model and next interaction

## Current implementation

Comp and bass share the native part loader, clip-owned rendering recipe, global user-slot storage, Undo, and settings/automation recall. `integration/part-library/catalog.json` is the single source for stock names, notes and setting overrides. The build compiles it into static Rust data and copies it for UI previews; the audio path does not parse the catalog. The Move load review draws stock source-note timing and register from this same data. This is a source-content preview, not a prediction of the final voiced chord.

Motif-to-Clip already builds a phrase through HarmonyBus's `motif_clip.h`, `rhythm_generator_clip.h` and `motif_loader.h`, then passes its input notes and operation intent to Movy's atomic `motif_load.rs`. Its preview offers Replace, Append and Overdub. Target placement is Saved/End/Start/Both/Omit; Unit controls timing, Rhythm can redistribute it, and Even Units adds padding. Rhythm Generate can use motif material or the target alone. Live Automatic motifs also have arrival and late-fit rules; those rules are not a general clip-length fit control.

Clip-page Fill Gaps is separate: it extends existing melodic notes to the next attack or loop end. Quantize + Fill first snaps their starts to the chosen grid. Neither operation selects new musical content. Keep this useful edit; do not silently redefine it as a preset loader.

## Next UI: Fill within Clips View

Use a dedicated Fill panel/mode within Clips View, preserving the existing Session-button cycle. Keep the grid as the destination. Retain independent choices for drums, harmony, bass, comping and melody, but do not consume five knobs permanently with category selectors. A role-selection page chooses which role to edit; a common content page exposes Source, Rhythm, Pitch material, Target length, Placement, Variation/seed and Write mode. Role-specific parameter pages expose musical controls. Exact physical control assignments need to be checked against existing knob-touch row behavior before implementation.

Source can be Library, Generate or Remix. Library recalls authored content and its recipe. Generate builds new material from constraints. Remix retains selected properties of existing/library material while changing others. All three produce the same prepared plan and use the same preview and write operation. Preserve an Original rhythm option so selecting a preset does not silently discard its authored phrasing.
Turning or touching a content knob temporarily shows a timeline, notes or drum lanes, duration, and the selected entry. Returning to the grid retains the choices. A pad press selects the actual visible track/clip and loads the matching category. Use the existing track/layout assignments, including the configurable drum/conductor row, rather than assuming a pad row is permanently a role. Four visible rows still require the existing layout/bank navigation to reach additional tracks.

The Fill mode indicator must remain visible after the temporary preview closes: pads write content in this mode, whereas ordinary Clips pads launch it. Show success only after the native edit acknowledges it, update clip occupancy/label, and briefly highlight the destination. Keep a single Undo transaction. Loading and launching remain distinct actions. Existing recording and stale-preview checks remain authoritative.

The richer browser/Remote UI should render the same content plan as a larger timeline with drum lanes, chord labels, source degrees and automation summaries. Rendering a preview must not trigger notes, advance random choices, or run a second sequencer. Cache the immutable plan until a selection, target, or length changes.

## Shared rhythm and pitch material

Use one rhythm library for reusable timing structures: attacks, rests, ties, accent weights, gates, meter and phrase length. Pitch libraries hold role-specific musical material: harmonic progressions, motif intervals and target anchors, bass functions, comp voicing intent, or drum-kit assignments. A combined style is a saved reference to rhythm, pitch material, parameters and rendering settings rather than a duplicated bank of fully expanded clips.

Shared rhythm does not mean identical interpretation. Role adapters map an attack to a bass note, a comp chord, a melody event or a drum hit. Drum arrangements may require several named lanes; comp attacks may emit simultaneous notes. Entries declare lane semantics and supported adapters. Incompatible combinations must be explained in the preview rather than silently dropping lanes. Rest/tie semantics, motif landing anchors and chord boundaries remain meaningful during recombination.

## Generation and remix

Generate on content edits or an explicit variation request, outside the realtime audio callback. Prepare a deterministic plan from source versions, parameters, seed, target duration and any harmony snapshot used by the algorithm. Preview and commit consume that exact plan; painting the screen must not reroll it. Role-dependent plans are resolved once the destination track is known. If the destination invalidates a preview, show a new review rather than committing unseen content. Changes to conductor harmony invalidate only plans that actually consulted that harmony; generic relative material can remain reusable.

Candidate controls, to be introduced incrementally:

| Role | Musical parameters |
| --- | --- |
| Melody | Chromatic approach frequency, density, range, contour, interval limits, repetition, target/landing strength |
| Bass | Root/fifth emphasis, approach frequency, range, motion, syncopation, repetition |
| Comping | Attack density, syncopation, voicing width, register, chord-tone count, voice-leading strength |
| Drums | Lane activity, accent, swing, syncopation, fill amount, variation |

Chromaticity is a preference for eligible chromatic approaches, not permission to bypass harmony mapping or a promise that a small clip contains an exact percentage. Comp, bass and melody output must still use Relative or Closest Split. Before exposing chromatic controls, verify the native mapping can express and retain the intended chromatic approach; if it cannot, extend the semantic representation and tests rather than emitting raw MIDI or presenting an ineffective knob.

Allow rhythm and pitch to be locked independently while changing the other. Save the generator recipe and seed alongside the materialized, editable events and required settings/automation. Explicit regeneration replaces or remixes content; ordinary playback and reopening a session do not regenerate it. Preview must distinguish mapped source intent from a harmony-resolved audition. Start with rhythm recombination, drums, bass and comp; melody remains lowest priority.

Existing gap-fill editing stays distinct from generative Fill. Reuse existing motif and rhythm builders where appropriate, extending them through the common plan interface instead of adding another scheduling engine.

## Consolidation boundary

Keep musical source builders: stock/user clips, motif/progression definitions, and rhythm/autofill material. They feed one prepared content plan containing editable source notes, timing, semantic actions, input mapping, rendering defaults, and named automation. Share target validation, placement, preview data and the atomic write/Undo boundary. Do not duplicate motif anchoring, harmonic mapping, rhythm generation or playback scheduling in the UI.

Repeat tiles a phrase at its original rate; Fit changes its timing to a target window. Automation, ties, pressure, simultaneous chord notes, operation intervals and motif landing anchors must follow the same transformation. A whole-clip stretch is not automatically correct for a motif whose target must land at the window end. Existing ordinary clip speed/length controls should remain distinct from materializing new fitted contents.

Conductor material describes harmony and defaults to direct conductor MIDI. Optional comp interpretation uses a separate mapped comp clip for rhythm and voicing. Selecting a progression must not silently enable comp playback or suppress conductor output. Comp, bass and melody entries require Relative or Closest Split input mapping. Drums use their exact sample-note mapping. A future multi-part style can reference several ordinary entries; it does not need another arrangement engine.

This document describes the next interaction and consolidation work. The full Clips View Fill mode, general Repeat/Fit placement and richer browser content browser are not implemented in hbclean.246.

## Relationship to merged Source Weaving

Source Weaving is already on main, beginning with PR #82 and extended through hbclean.230. It combines live clip sources for pitch, rhythm, expression, instrument/HB automation, note operations, Grid holds and gestures; supported dimensions include Fit to Window. Library/generation fills create source material. Weaving chooses how that material is performed. These layers share ordinary clips, harmonic mapping, timing, note ownership and automation; filling a clip does not need another live weaving engine.

The current library increment adds an explicit Own content / Keep weaving choice to its load review. Keep preserves the destination's existing routes; loading a donor does not reset actors that reference it. Tests exercise borrowed rhythm after bass loading, donor replacement during held notes, paired releases, routing persistence and Undo. This is an integration step, not a baked-weave renderer or a completed rhythm/pitch recombination UI. A future Bake action must match the existing scheduler's conditions and ownership semantics and should not be approximated with a second UI sequencer.

## Extract from any clip

Clip editing and the library are bidirectional. Offer Save Rhythm, Save Pitch/Phrase, and Save Full Clip/Recipe for an existing clip. Extracted material uses the same library schemas as stock and generated entries; do not introduce a separate bank or extraction-only format. A saved entry is a stable snapshot that remains valid after its source clip changes or is deleted. Following later source edits is an explicitly linked-source operation, using existing weaving references rather than silently changing saved entries.

Rhythm extraction captures onset groups, rests, ties, gates and accent relationships with meter and source length. Simultaneous chord tones constitute one attack group, while independent drum lanes retain their identities. Keep lane structure and declare adapter compatibility; offer an explicit flattening/remapping choice rather than silently collapsing a drum arrangement. Choose whether to capture authored conditions or one realized variation: do not bake stochastic playback without identifying the realization and seed.

Pitch/phrase extraction preserves ordered pitch/chord groups, input-key identity, relative degrees, register relationships, semantic operations and landing anchors. It is an untimed phrase only where that is musically meaningful; anchors and operations can constrain how a replacement rhythm is applied. Shared automation and expression remain separately reusable dimensions rather than being arbitrarily attached to the pitch bank. Full recipes reference these components plus their required render settings and named automation.

Every clip can be an extraction starting point, but raw/rendered MIDI is not automatically valid mapped melody/bass/comp material. Offer source-key confirmation and a reviewed normalization step; preserve the original clip. Drum pitches are kit/sample identities, not scale degrees. Do not infer lost harmonic intent with false certainty. Library entries destined for bass, comp or melody must satisfy the existing Relative/Closest Split mapping constraint.

Extracted components may serve existing live weaving or the shared prepared-plan generator to create a new editable clip. Materializing a library source as a clip lets it use today's weaving references and scheduler; a future direct library-source adapter must reuse that ownership and timing path. Preview, save and regeneration must not run a parallel sequencer. These extraction controls are planned follow-up work, not part of the current bass-library release.

### Clip contents are first-class picker choices

The user does not need to save or manually extract a clip before selecting it. Every dimension picker includes saved library material and clips from the current Set, identified by track/slot and a content preview. Selecting a clip as a rhythm or pitch source automatically projects that dimension through the same source adapter. Save to Library is an optional persistence action, never a prerequisite for reuse.

For live weaving, retain existing clip references so later edits follow the established playback rules; no temporary library entry or copied clip is required. For Fill/Generate/Remix, capture a stable prepared projection of the chosen clips, their source identities and revisions. Preview and commit use the same result; a relevant source edit invalidates that review or requires explicit regeneration. Library snapshots remain independent of the original clip. These are explicit live-reference and prepared-content semantics, not two extraction implementations.

## Implemented first increment: 248

[Clip Fill](clip-fill.md) now exposes independent existing-clip pitch and rhythm sources directly in Clips View, temporary source-note previews, Sequential/Fit pitch selection, target length and pad-to-replace with Undo. It reuses live weaving's onset selection. No new user-library saving workflow was added. The release document states its current source/mapping restrictions; general drum-lane extraction, richer browser controls and generation remain follow-up work.
