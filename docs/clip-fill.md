# Clip Fill — Movy 0.34.1-hbclean.257

Pair with HarmonyBus 0.2.297. Clips Setup knob 5 opens Fill. Existing clips are the sources: nothing has to be saved into a library. Source clips may be stopped, muted or in another bank. Back, jog or knob 8 exits Fill; leaving Clips disarms it.

| Knob | Selection |
| --- | --- |
| 1 / 2 | Pitch source track / clip |
| 3 / 4 | Rhythm source track / clip |
| 5 | Target length, 1–16 bars |
| 6 | Sequential pitch groups / Fit pitch phrase / Original phrase |
| 7 | Own content / Keep existing Source Weaving |
| 8 | Exit |

Turning a source control or touching a knob shows a temporary note preview. The grid remains the destination: press a pad to **replace** that clip. The actual configured row and bank determine its track. Successful native acknowledgement shows the destination and updates occupancy; failed edits cannot claim success. This does not start transport, launch the destination or change clip selection. Existing playing destination content is replaced with its gates released and loop restarted. One Undo restores the clip and routing.

Rhythm repeats at its authored rate to the target duration; the final gate is clipped to the end. Fit changes pitch phrase selection, not rhythm tempo. Simultaneous pitch notes remain a chord group. Rhythm attacks at the same tick are combined with maximum gate and accent; drums can supply this union of hits. Pitch source input keys, register and per-note operations are preserved, velocity comes from rhythm, and pressure is not extracted. The preview displays up to 64 source notes and reports the full count. It is not an audition or a prediction of voiced HarmonyBus output.

Melodic Fill supports conductor destinations and follower destinations with Relative or Closest Split mapping. Pitch material must have saved input-key identity or a full recorded chord-selection descriptor and cannot be rendered/raw output. Chord-selection descriptors are conductor-only. Source rendering recipes are retained where present; otherwise the destination's mapped settings are used. A follower rendering recipe cannot be loaded onto a conductor, or vice versa. Rhythm quantization/speed overrides, rhythm conditions and live rhythm operations, and pitch shared/interval operations are rejected rather than silently baked incorrectly. Instrument automation, melodic expression timelines, drum-lane selection, built-in choices and generators are not yet extracted. Existing clips with ordinary source notes, including the stock bass/comp entries, are supported.

## Preview-only pitch and rhythm rotation

In **Sequence** or **Fit** mode, hold **Shift** and turn knob 1 to rotate the
ordered pitch groups, or **Shift** and turn knob 3 to rotate rhythm attack
positions by sixteenth-note divisions. The Fill header shows `P0 R0` at the
original positions, with both controls independent and wrapping through 0–15.

The pitch rotation changes which complete source chord/note group is selected
at a rhythm attack. It never transposes notes, breaks simultaneous chords,
rewrites scale degrees, alters recorded operations or bypasses the destination's
HarmonyBus travel rules. The rhythm rotation shifts the donor pattern against
its own loop, preserving each attack's authored accent/gate and repeating the
result normally. Selecting `P0 R0` returns to the exact source combination.

Rotations remain drafts until an ordinary destination pad is pressed. The
same native Clip Fill builder computes both the preview and the subsequent
atomic write; a changed source invalidates that preview. No background
reroll, new scheduler, live MIDI, or extra scan of playing clips is involved.
**One normal Undo** restores the clip and its Source Weaving routing.

Original mode deliberately disables rotation in this first increment:
it preserves conductor chord progression boundaries, motif landing intent,
ties/rests and exact drum kit lane addresses. Drum Fill remains the existing
whole-groove operation. A future source-aware groove rotator should explicitly
define how ties, cross-loop gates and per-lane accents move before enabling it.

The old six-field Fill request remains supported. Two optional phase fields
are present only when either rotation is nonzero, so older users and saved
clips continue to behave identically.

## A/B Fill memories

During a single Fill session, save and recall two complete draft variations
without replacing a clip:

| Gesture | Action |
| --- | --- |
| Shift + knob 5 | Save current preview as A |
| Shift + knob 6 | Save current preview as B |
| Shift + knob 7 | Recall A |
| Shift + knob 8 | Recall B |

The header shows `A*`/`B*` when the current draft matches a memory,
`A+`/`B+` for other saved memories, and `A-`/`B-` for empty ones. Each memory captures the pitch/rhythm source clips, target bar
length, Sequence/Fit/Original selection, independent pitch/rhythm rotations,
Source Weaving ownership choice, the exact preview response and its source
fingerprint. Both slots reset when reopening Fill; they are deliberately
**temporary working memories**, not newly serialized clip data.

Saving requires a settled, valid preview; it does not read native sources,
send MIDI or change any stored clip. Recalling explicitly validates the saved
preview once against the current sources. If a donor changed in the meantime,
the recall is refused rather than silently substituting different content.
The current draft remains intact. A successful recall restores the original
controls and cached visual preview immediately, but still does not write to
a clip until an ordinary destination pad is pressed.

The same existing atomic clip-write guard and single Undo apply to commits
from either memory. These are **visual comparisons only**, not audible
previews of the final HarmonyBus-mapped notes. Drum Original is supported
as a memory, but it retains its existing non-rotating groove behavior.

## Drum grooves

Select an existing drum track/clip with knobs 1/2. Fill uses Original automatically:
the groove repeats at its authored rate to knob 5's target length. Knobs 3/4 are
inactive. Knob 6 pages the temporary preview through four drum lanes at a time;
it returns to the melodic alignment selector when a melodic source is selected.
The preview labels lanes by MIDI note number, shows stronger accents with taller
marks, and reports displayed/total hits. It displays at most 64 hits; the written
clip contains every supported hit, subject to the existing 512-note capacity.

Press a drum destination pad to replace that clip. Drum identity comes from the
existing local drum-module or Drum Clip Out setting. Routing, kit and instrument
selection remain the destination's. No HarmonyBus module is required for a drum
destination and no General MIDI kit mapping is assumed. MIDI pitches remain exact
kit addresses, including simultaneous hits. Velocity, authored gates, gaps and
per-note pressure survive; the last gate and its pressure curve stop at the target
end. Silent source loops create silent clips with the chosen length. Harmonic key,
transpose, rendered-note flags and HarmonyBus recipes are not applied to drums.

Drum and melodic sources cannot be written onto the other destination type.
Drum sources with automation locks, note operations, trigger conditions, live
operation lanes, quantization or speed overrides are rejected. This increment
copies authored grooves; it does not render those transformations. Existing
source edits and source/destination drum-role changes invalidate stale previews.
Previewing, lane paging and writing do not launch clips or change selection.
Replacing a playing clip releases its old gates and restarts its existing loop.
One Undo restores the preceding content and routing; Record/count-in blocks edits.

Performance Drum Fill remains a separate one-shot gesture. Individual drum-lane
rhythm extraction remains a follow-up; this release copies the complete groove.
The builder and the ordinary scheduler are shared with melodic Clip Fill, with
no new playback timer, source polling or saved library required.

Live weaving remains Joint Play actor Sources routing; it reads playing sources and follows later edits. Fill is an edit-time composition of authored contents. Preview and commit use the same native builder and shared weaving pitch-onset selector. Source edits invalidate the old preview; touch a knob to refresh. Source turns are coalesced after a 70 ms pause; pending previews cannot be written. The composer runs only for explicit previews/writes. Drawing and idle ticks perform no source IPC and no new playback scheduler is added.

Validation includes stopped clips, nonzero loop origins, simultaneous voices, Sequential/Fit selection, repeat boundaries, semantic input/actions, stale-source and destination rejection, capacity limits, recording guards, Set restore, Undo with weaving, ordinary scheduler note ownership, shared UI dispatch and framebuffer rendering. Physical Move testing remains required.

## Conductor phrases

Select an existing conductor clip as pitch source, including a progression made with Motif to Clip, connected-touch motif entry, or chord step recording. Choose **Original** on knob 6 to repeat its authored phrase to the target bar length: gates retain ties, gaps retain rests, and each repeated phrase introduces its original attacks. The final gate is clipped at the target end. A rest-only source produces a silent clip of the chosen length. Knobs 3/4 are ignored in Original mode. No new library save is required.

Sequence and Fit still borrow attacks, gates and velocity from the rhythm source; use Original when the source's own rests and ties should survive unchanged. All modes preserve native chord descriptors and per-note motif operations. The preview shows source-note timing, not resolved chord voicings. Source/target fingerprints, recording guards, one Undo, and no automatic launch apply to conductor fills too.

This adds existing-clip conductor Fill. Direct factory motif selection remains in the existing Motif to Clip / Conductor Motifs panels. Instrument automation and expression are not extracted, and live operation lanes must use Source Weaving.
