**Movy hbclean.172 / HarmonyBus 0.2.253:** Update both modules. Harm Play Settings groups Key Center Scale with key travel for Conductor, Follower Recorded and Follower Live. The two follower policies default to Same as Conductor and apply when Follower Travel is None (including legacy Direct). Choices: Relative, Closest Chord Tone, Closest Scale Tone and Closest Split. Relative now uses one tonic displacement across the melody instead of independently folding each note. Chromatic remains On by default; approach targets move before their approach is constructed. Recorded input/approach intent stays editable and key travel is a playback setting, not a per-note capture.

**Movy hbclean.163 / HarmonyBus 0.2.246:** Harm Play Settings knob 7 is Advance Motif: touch once per step while holding a target pad. With no active motif/held target it does nothing. It adds no clip input press. Harmony Setup in Steps now has Reset Track, activated with Shift + touch; it resets HarmonyBus settings using that track number, preserving clips, instruments, mixer settings, shared defaults and other tracks. Update both modules.

Chord + Arp and chord-state controls adopt already-held target pads independently of Retrigger Held. One-shot Chord + Arp ends on the adopted target’s release; explicit latch persists. Rapid release/repress now preserves an attack and restarts a momentary arp without waiting for the old arp division. Secondary V is labeled Secondary V (Dom) and uses a semitone-below leading-tone approach to diminished targets.

Movy hbclean.162 groups Approach Operation choices by musical function, with group names in the peek heading. All stock motifs now precede numbered user motifs. Operation lanes and the motif library share the same musical ordering; chord-form and dominant-scale selectors group related choices. Saved operation IDs and motif numbers are unchanged. Pair with HarmonyBus 0.2.245.

HarmonyBus 0.2.245 / Movy hbclean.161 adds Dominant Color on Harm Play Settings knob 5. Touch applies the selected dominant family to the current track, release restores the underlying major/minor settings, clockwise turn latches, and counterclockwise turn switches it off. Shift-turn selects a family (Altered V initially). Hold is solid teal; latch pulses teal. Only the selected family is saved; active holds/latches reset on stop or reload. Altered V keeps secondary preparation chords on their simplified baseline.

Target Scale Source is now knob 6. The Simple Major, Minor and Dim families move to Harmony Setup in Steps mode. The control remains usable alongside the sixteen Harm Play step assignments. A conductor color suspends learned predictions while active and reuses its saved baseline timeline on release; it does not replace that timeline with a temporary performance.

Dominant to Major and Dominant to Minor now default to Simplified Target: major destinations use Major and minor destinations use Harmonic Minor. None disables dominant substitution and keeps the parent collection. Every enabled dominant family retains the dominant root, major third and flat seventh. Altered V affects V only; secondary preparation chords use the simplified target baseline. Existing saved family selections are preserved.

Copy-tap filters the HarmonyBus panels by mode. Steps contains setup and diagnostics; Perform 1 contains operation controls and performance tools; Perform 2 contains Harm Play, secondary harmony and chord/arp controls. Startup and project load always select Steps. Copy hold retains native copying; switching modes does not reset latched musical operations.

Learned next-harmony timelines are saved per conductor track and clip slot. Matching clips recover their predictions on the first playback after a reload; edits and incompatible render settings invalidate the corresponding record. The stopped opening-chord preview remains independent. Trail Decay has one larger preview below readable text controls; selectors clear the surrounding controls.

Secondary Fifth is now a separate parent-scale degree operation. Secondary II, IV and VI (Dom) simplify the target in Auto and use its dominant-preparation family; Altered V remains V-only. Ordinary secondaries preserve the parent collection by default. Parent/Simplified explicitly overrides Auto target simplification. Existing operation IDs are unchanged.

The performance footer now shows compact mode/track, sounding key center and parent scale, and current > next harmony as key-relative Roman numerals. Unknown harmony is --; h7 means half-diminished. Long scale names are abbreviated to fit. Footer data rides the existing pad snapshot without additional host reads.

**HarmonyBus 0.2.244 / Movy hbclean.160 — reinforced target trails.**

Trail reinforcement starts a single target onset at 80% of Trail Strength and a repeat within the selected history window at 100%. Dim Trail decays toward 30% of Trail Strength; Blend into Background still fades to the background. Repeats refresh the peak and decay continuously. Pitch Class combines octave hits. Generated chord voices and arp repeats do not count. The native history retains two onsets per pitch, including hits between UI polls. Install HarmonyBus 0.2.244 and Movy hbclean.160 together; Movy retains single-hit compatibility with older history snapshots. Validated against Schwung 1.7.3.

**HarmonyBus 0.2.243 / Movy hbclean.159 — target scales and full Harm Play banks.**

This release pins Schwung 1.7.3 for the shared controller, host ABI, palette and full native audio-chain checks.

Harm Play 1 and 2 now expose all sixteen saved operation/motif assignments, matching step buttons 1–8 and 9–16. Harm Play Settings holds Key Center, Parallel Scale, Motif Latch and Chord + Arp on knobs 1–4; the step buttons remain playable from this page. Shift-turn Parallel Scale still selects its scale. The four special controls retain teal feedback, captured releases and latch behavior. Key Change Scale and Conductor Travel remain on Key & Scale.

Settings knobs 5–8 are Target Scale Source, Simple Major, Simple Minor and Simple Dim. These are saved per track:

- **Auto** uses the parent collection for ordinary secondary degrees and simplifies the destination for Secondary V and Leading Tone. Existing Simple Chord/Simple Scale operation choices remain active in Auto.
- **Parent** keeps the destination's parent collection, including the established borrowed/chromatic-target fallback. **Simplified** uses the selected destination-quality family. Both explicit choices override legacy per-operation simplification flags.
- Major: Major (default), Lydian or Harmonic Major. Minor: Natural Minor (default), Dorian, Harmonic Minor or Melodic Minor. Diminished/half-diminished: Locrian (default) or Locrian #2.

The destination's third and fifth select the quality family. Existing Dominant to Major/Minor treatment is applied afterward; a named dominant-family choice can therefore override the simplified collection on ii/V/leading-tone approaches. Parent / Minimal leaves the chosen collection in place. Dominant and leading-tone chord function is retained. Live chords, single-note approaches and motif/cadence rendering share the resolver; stored source pitches and assignment IDs are unchanged. Old states without these controls load Auto with the default families, so explicit dominant/leading-tone approaches now use Auto's tonicized destination collection. Existing held voices finish with their onset pitches.

Standalone HarmonyBus exposes the same four choices on Secondary Scales. Install both versions for the complete Movy settings page. Device audio crackles remain a hardware verification item.

**HarmonyBus 0.2.242 / Movy hbclean.155.** Adds Live Harmony Override (default scope) and Live + Recorded Harmony Override, using resolved musical intent with conductor harmony underneath. Chord + Arp now offers six combinations: Chord Only, Arp Only or Both, resolving on first target press or release. Persistent latches stay active.

Movy adds Pad Trails under Shift + Step 9: turn the dial through Set Parameters, Pad Colors, Pad Trails and Trail Decay. Trails remember a resolved single target per input gesture, never every generated chord voice or arp repeat. Exact pitch is the default; pitch class is optional. History is matched against each pad's displayed current/next target. Choose infinite, beat, current-chord or previous-plus-current-chord history, color/strength/pulse, linear or exponential decay, and exponential shape 0.5/1/2/4. Exponential duration is a half-life. Chord Forms stays grouped as before.

Color order is harmony/pulse, trail overlay, played highlight, then approach-row brightness. Trails share the existing bounded pad snapshot; animation performs no native reads. Copy-mode layout changes reuse cached metadata and release physical holds without resetting all performance state. Hardware crackle behavior still needs Move testing.

**HarmonyBus 0.2.241 / Movy hbclean.154 — conductor-owned shared context.** While recording a conductor, Key Center landings, Parallel Scale starts/ends and explicit parent-scale changes are saved on that clip's musical timeline, including changes performed without a note. Follower uses remain live-only. Ordinary chord/arp settings, timing and humanize remain current rendering controls; this does not introduce general knob automation. Infer remains a live base-scale selection.

**Audio diagnostics:** Shift + Step 12 opens the CPU meter and starts a fresh opt-in measurement. Turn the large dial to switch between track costs and AUDIO PEAK. Repeat Shift + Step 12 to reset; Back stops measurement. AUDIO PEAK shows the entire worst measured callback against its block duration, plus that same block's input/config, sequencer, clip metadata, MIDI/context, HB preparation, click/module-load, and chain-render times in microseconds. OVER counts callbacks exceeding the raw block duration; >70% is a headroom warning, not a hardware xrun count. Stage maxima and block counts also travel in the existing status/CPU log. Measurement uses fixed counters and monotonic timestamps, no callback logging or allocation.

This measures Movy's callback, not stock Schwung instruments outside Movy, host scheduling before entry, UI parameter callbacks, or the audio driver's actual underruns. Crackles with low readings still require those paths or signal discontinuities to be investigated. Desktop timings establish that the instrumentation works, not that Move meets its deadlines.


Panel cleanup: **Key & Scale** replaces Global Transpose and adds Sounding Key. Touch Hold lives in operation Conditions; Arp Clear lives in Arp / Strum. Foll Root no longer duplicates dominant/borrowed controls from Track Scales. **Context Sources** is the detailed ownership view. Chord Forms is unchanged.


Conductor contributions are aggregated before each sequencer MIDI batch. A clip owns its contributions; ending a gesture, stopping a clip or replacing a set removes that ownership, without restoring stale global snapshots. A gesture crossing the loop boundary remains active until its recorded ending. Playback from the middle reconstructs the circular timeline. Explicit selections use the most recent active contribution (higher track number breaks exact ties); live gestures override recorded contributions until released. Key/parent changes persist in the clip until replaced; a momentary take closes at recording end, while a latch remains persistent. Master Transpose applies once outside the stored key changes. The target note of a recorded key landing retains the key context in which it was performed, avoiding a second key mapping on later loops; its chord form can still be edited.

**Context Sources** shows Sounding Key, Base Key, Key Owner, Parallel Owner, Parent Owner, Transpose, Sounding Scale and capture status. `T2 REC` / `T2 LIVE` identify the winning owner; `+` indicates additional overridden contributions. Existing operation lights reflect the current track's ownership. The page uses one bounded snapshot read; no new pad animation or per-cell polling. Sparse events use binary lookup, and global replay writes happen on changes rather than every audio block.

Validation includes native ownership/transpose/onset tests, the sequencer and DSP suites, loop carry and persistence, and the full Movy/Schwung/HB chain recording and replaying independent conductor contributions. Device crackle resolution remains a hardware verification item. Future-key-event lookahead visualization is not added in this release; the new panel reports the effective shared context.

**HarmonyBus 0.2.240 / Movy hbclean.153:** Pads Global > Pad Colors > Harmony Off keeps an input-scale/tonic background and played-input feedback without current/next-harmony coloring, harmony pulses or rendered-output grouping. The native snapshot skips per-pad voice previews and lookahead color analysis in this mode; unchanged layouts no longer repeatedly submit preview inputs. This is a display choice and does not disable musical follower mapping or lookahead timing.

Transport heartbeats, clip-position updates and opening-preview telemetry no longer trigger the general all-track settings/Chord+Arp resynchronization path. The existing conductor-before-follower barrier and ordinary settings synchronization remain. A 16-track desktop benchmark reduced the heartbeat dispatch portion from about 47 to 12 microseconds; this is not a hardware deadline measurement or confirmation that device crackles are resolved.

**HarmonyBus 0.2.239 / Movy hbclean.152:** Track Scales has independent Dominant to Major and Dominant to Minor preferences. Parent / Minimal is the major default; Harmonic Minor is the minor default. Both offer Parent / Minimal, Harmonic Minor, Melodic Minor, Altered V, Major and Harmonic Major. Selection follows the resolution target's quality before borrowing, including explicit secondary intent. Named families apply to generated preceding ii and V; Altered V leaves the preceding ii in its parent context and uses harmonic minor for leading-tone treatment. Explicit chord tones remain authoritative. Auto Local preserves available parent modes rather than always rebuilding major/natural minor. Harmonic Major is also in the shared regular and parallel scale library. Key changes preserve dominant and leading-tone function, including conductor output. Ordinary Scale Degree input does not inherit the preceding dominant's temporary scale.

Movy submits changed melodic pads as one bounded native cable frame, removing Schwung's 16-LED-per-UI-tick staging on supported hosts; immediate melodic feedback uses the same path. Rejected frames retry and the existing 40-packet budget remains. HB no longer repeatedly reads saved set files to discover channel ownership in an audio callback; unresolved Auto channels wait for authoritative host source tags (or an explicit source channel). These changes remove identified sources of work and display staggering, but the reported device crackles still require hardware verification.

**HarmonyBus 0.2.238 / Movy hbclean.151:** Blues is available in both Parallel Scale and the regular scale library. It uses Dorian melodic degrees with dominant chord quality on every root, retaining chord forms (major triads, dominant sevenths, dominant ninths). The old six-note keyboard scale remains at its saved ID as Blues 6-note. Scale definitions now come from HarmonyBus `data/scales.json`: intervals, names, stable host/keyboard IDs and chord policy generate native tables, module choices and the pinned Movy catalog. Relative Major/Minor remains a separate parallel operation. CI rejects stale generated catalogs.

**HarmonyBus 0.2.237 / Movy hbclean.150:** Shift-turn Chord + Arp selects Chord Only, Arp Only, or Both. Ordinary clockwise/counterclockwise turns permanently latch on/off; the existing teal latch pulse remains. Chord Only bypasses arpeggiation, Arp Only uses played notes without chord expansion, and Both combines them. Selection is saved; old sets retain Both. Mode boundaries release old voices safely. Pad-preview reads now remain limited to one per 50 ms even during rapid gesture changes; note feedback and native LED pulses remain independent. This reduces display traffic but does not establish or eliminate the reported hardware audio scratchiness.

**hbclean.149 startup hotfix:** A cached editor now checks the track port it captured. When Set loading changes hosting, the opening editor is rebuilt against the current port; stable pages remain cached. Performance ownership also follows the replacement page. The regression test reproduces a stale Version dial and wrong-destination writes on the opening track before the fix, then verifies recovery and reverse host switching. HarmonyBus stays at 0.2.236.

**0.2.236 / Movy hbclean.148:** Root Only, Root + Third and Root + Seventh join the shared chord forms. Chords owns Quality and Inversion; Chord Forms has independent Current Color and Next Color selectors. Multi-tone Next Pulse uses distinct peak strengths (first 100%, second 75%, third 55%). Adjacent Pad Shading defaults Off, with its resting pattern cached independently of pulse/play brightness.

Parallel Scale adds Relative Major/Minor. Key Center feedback distinguishes a changed tonic from a scale-only change and shows the current/destination tonic with a minor suffix. Master Transpose moves an active key context consistently. Conductor input is reinterpreted before voicing its current chord form; recorded source data and note-off ownership remain intact. Closest and Closest Split use cached joint assignments balancing movement, register and pitch-class collisions; diversity is a preference, not an unconditional requirement. Destination pools remain mandatory and assignment travel is bounded to six semitones (MIDI-boundary fallback uses the nearest legal note).

Repeated preview-layout writes are suppressed, identity key maps bypass harmony reclassification, and repeated transformed harmonies are cached. Native and browser checks cover these changes; reduced desktop processing cost does not establish that hardware audio dropouts are eliminated.

**Approach controls:** Shift-turn always edits the operation with a list peek. Ordinary turns latch only outside approach-row layouts, with explicit On/Off feedback and a pulsing latch LED. In approach layouts, knobs select the spatial rows and ordinary turns do nothing; entering these layouts clears permanent approach-bank latches. Steps trigger without changing rows. Harm Perform 1 defaults to V, II, CCB, CCA, LT, TTS and Backdoor V; Harm Perform 2 contains sequences. Knob 8 on both remains Chord + Arp.

**hbclean.147 / HarmonyBus 0.2.235 / Schwung 1.6.3:** Retry nonempty native fallback metadata until HarmonyBus supplies full widget types and named enum controls. This covers the erroneous Version dial seen on the initially opened track and after re-adding HB. The fallback footer now says STEPS without the misleading NO HB message.

**hbclean.146 / HarmonyBus 0.2.235:** The first selected track recovers the full HarmonyBus editor when either its page layout or parameter metadata arrives late. Startup no longer gets stuck in generic parameter pages. Complete editors stop retrying metadata.

**Movy hbclean.133 / HarmonyBus 0.2.224:** Chromatic approach pads stay black with Auto Chord enabled. Short emitted notes get a bounded Play Color flash without changing MIDI gates. Knob 8 on both Harm Perform panels uses the shared Chord + Arp operation: touch for a temporary gesture, turn to latch on/off.

**Movy hbclean.132 / HarmonyBus 0.2.223:** Approach Harmony replaces Pitch Play. Connector Below/Above follow Connector Harmony; new Leading Tone and Upper Dim options keep diminished quality, while Tritone Sub keeps dominant quality. Choose the new operations in Ops lanes or Harm Perform banks. Saved connector IDs retain their original sound.

**Movy hbclean.131 / Schwung 1.6.1:** Compatibility checks now use Schwung 1.6.1. Native track colors prefer Move’s live song state, so unsaved color edits appear across Movy’s four banks; older hosts retain the bounded saved-file fallback. HarmonyBus remains 0.2.221. Transport continues using the native host clock, and musical key/scale overrides are preserved.

**Fixed operation knobs:** Ops 1–8 and Ops 9–16 permanently map to lanes 1–16. Shift + turn changes the operation assigned to that lane. Named controls keep their fixed function and Shift + turn edits their amount or mode. Shift editing never changes which lane a knob controls.

**0.2.221 / Movy hbclean.130:** Harm Perform knobs use tap for one use, hold for momentary application, clockwise turn to latch, and counterclockwise turn to unlatch. Shift + turn changes the assigned operation or motif without arming it. Overlapping performance touches compose a finite sequence, ignoring each entry's saved latch preference without changing those preferences. The separate Performance Latch panel is removed; Harm Perform panels are at the end. White is solid for trigger/hold and pulses smoothly for an active permanent latch. Triple Approach shows three amber row assignments; other layouts show only the latest selection. Sounding outputs use the full configured Play Color, including regular green, regardless of whether their input pad is held.

**Defaults:** Follower inversion Played Top Note, conductor inversion Auto, arp order Shuffle.

**hbclean.129:** Fresh-set render channels repeat 1–4 across tracks 1–4, 5–8, 9–12, and 13–16. Saved sets retain their routing choices. Track roles are unchanged. Follower/input scale defaults to Major. Receive Channel defaults to Off (requires HB 0.2.218); saved explicit receive channels are preserved. Native track colors retry briefly after set entry/resume to pick up delayed saves; all banks and motif display use the shared color mapping.

**hbclean.128:** Rendered-only notes use a solid dim Play Color (green by default), independent of the background. Matching live or recorded input keeps full Play Color. Selected approach controls pulse white over amber when latched; triggered and held controls remain solid white.

**hbclean.127:** Ordinary parameter knobs use white brightness on both rows. Performance controls use solid white for armed/triggered and held states, smoothly pulsing white for permanent latch, and no idle purple. Amber marks every control assigned to an approach row and the selected Motifs knob.

**Approach routing fix (HB 0.2.217 / Movy hbclean.127):** Dedicated Approach and Triple Approach layouts enable follower approach pads independently of chromatic mapping and travel. Sound and play-color previews use the same eligibility rule. Operation knob LEDs own their indicators; generic parameter-value lights cannot overwrite them.

**FIFO Approach / Perform 2 (HarmonyBus 0.2.217, Movy hbclean.127):** Copy cycles Steps, Perform 1 and Perform 2. Perform 2 knobs and step buttons share the same 16-slot operation/motif bank on every layout. Each new touch enters a persistent three-item FIFO, without requiring overlapping touches. Triple Approach plays the queue from the top row down: row 3 (oldest), row 2, row 1 (newest), then the scale target. A fourth touch evicts the oldest assignment. Each row advances its own assigned motif; single Approach uses the latest touch. The display mirrors rows 3–2–1, highlights the newest assignment, and retains a compact slot summary. Tap/hold/latch performance and overlapping performance sequences remain independent of the row FIFO. Existing bank assignments are preserved; the eight triple motifs remain optional library choices.

> **hbclean.123 / HarmonyBus 0.2.214:** Secondary II consolidates Scale Above. Secondary LT consolidates Chromatic Below and remains a semitone below the target; Auto Chord uses the Chromatic Chord setting. Secondary VII follows the effective scale’s seventh degree and can differ from LT. Legacy saved assignments and recorded note intent remain compatible. Pitch Play and Secondary panels now access the same Secondary II lane.

> **hbclean.122 / HarmonyBus 0.2.213:** Copy tap adds Approach mode. Step buttons arm Motifs 1–16; play a scale pad to supply the target. Turn Approach Rows knobs to assign transformations or motif slots, and overlap touches to sequence them in touch order. Approach-pad presses advance that sequence; lower scale pads stay available. Motif Bank pages assign stock/User references without replacing Perform lanes.

> **hbclean.121 / HarmonyBus 0.2.212:** Operation knobs keep their fixed lane: clockwise latches on, counterclockwise off, tap arms one use, hold is momentary. Rendered-only notes blend faint Play Color into the normal pad color; matching live or recorded input uses solid Play Color. Input without sounding output preserves the background. Play Color Off disables both highlights.

> **hbclean.120 / HarmonyBus 0.2.210:** Play lights follow final rendered notes from live or recorded Auto Chord, arps, motifs and motion effects. Physical pad holds remain immediate; recorded source notes and retained arp pools no longer masquerade as sounding output. Includes the host LED delivery fix.

> **hbclean.119 / HarmonyBus 0.2.208:** Fix dropped harmony colors and stuck play highlights in Schwung overtake mode. Send each pad LED as its own host packet and cache only accepted updates. Verified against the pinned host queue, including pending green highlights replaced by harmony colors.

> **hbclean.118 / HarmonyBus 0.2.208:** Fix stuck green play highlights after quick live taps and switching Auto Chord off. Immediate pad feedback now invalidates the shared pad-color cache, so the next complete repaint restores the harmony background without playing the note again.

> **hbclean.117 / HarmonyBus 0.2.205:** Fix the bottom-to-top pad refresh during Full Both Lookahead transitions. Publish each changed pad grid in one host call, sample animation time once for the grid, preserve unsent colors for retry, and keep one LED budget for the entire app tick (the sequencer no longer resets it halfway through). HB itself is unchanged.

> **hbclean.116 / HarmonyBus 0.2.205:** Preview opening conductor harmony before Play; reserve complete pad-light changes and prioritize metronome LEDs without overwriting Perform or motif editing. Role Defaults changes labels and values together; Foll Notes and Pads Global move to the end.

> **hbclean.115 / HarmonyBus 0.2.204:** Edit opens Chords for a Chord/Arp State lane. Chords and Arp share Edit Target, with atomic destination changes and a lane label. Preserved track settings return when the operation ends.

> **hbclean.113 / HarmonyBus 0.2.202:** Next Harm, Chord Timing and Follower Root publish complete live display frames at up to 25 Hz rather than staggered per-knob reads. Keeps the independent latch/trigger LED polling fix. Prepared sets retain Full Loop context with the new three-choice selector. Install both modules.

> **hbclean.113:** Native green/lime track colors use explicit green hardware palette entries and matching dim partners instead of RGB-nearest teal or unrelated muted hues. Other colors and selection pulsing retain their existing behavior.

> **hbclean.112:** Removes Pitch Cadences as well as both Mixed Cadences panels. Motif intent supplies the melodic/harmonic distinction. Includes the Chords/Arp ordering and independent trigger LED refresh from hbclean.110–111. Cadence operation entries remain available pending motif-library consolidation. HarmonyBus stays at 0.2.200.

> **hbclean.111:** Removes the two Mixed Cadences shortcut panels from all Movy step modes. Every cadence operation remains available in the Operation lane selector pending motif-library consolidation. Visible operation LEDs now poll their existing 50 ms status cache independently of screen repainting, so consumed triggers clear and request a display refresh without unrelated knob movement. Includes hbclean.110 panel ordering; HarmonyBus stays at 0.2.200.

> **hbclean.110:** Chords and Arp / Strum are now panels 4 and 5, immediately after Main, Global and Follower Root. Conductor/follower role defaults, setting-source diagnostics and general diagnostics follow everyday shared controls. Copy-mode HB Ops or Motifs pages are appended after all shared panels, at the very end. Track scales remain among everyday settings. No settings or saved values change; HarmonyBus stays at 0.2.200.

> **hbclean.109 / HarmonyBus 0.2.200:** In Movy, short-tap **Copy** to cycle **Steps → HB Ops → Motifs**. The selected track opens the matching HB panel. Copy plus steps, clips or bars still copies; Delete and Mute keep their normal editing behavior. Session, Loop, Shift and active recording keep Copy's editing role. Finish motif entry before cycling. Key, scale and routing pages come first; common play controls remain at the end, with operation and motif pages shown in their respective modes. Long touched parameter labels/values are bounded to prevent header overlap, including Chords knob 7. This is a Movy update; HarmonyBus stays at 0.2.200.

> **hbclean.108 / HarmonyBus 0.2.200:** Untimed motif entry uses the normal step recorder with intent, rests, ties and anchors; automatic/tap motif playback, shared Render Rhythm, and played/lowest/highest arp anchors.

> hbclean.107: Starts inside HarmonyBus so the main dial changes panels immediately. Adds mixed-cadence controls, extended recorded-operation compatibility and role-default presets; requires HarmonyBus 0.2.199.

> **hbclean.106 / HarmonyBus 0.2.198:** Expanded secondary controls and three scale policies, separate connector and tritone controls, and backward-compatible ra3 operation recording.

> hbclean.105 / HarmonyBus 0.2.197: fixed Ops 1–8 / 9–16, named Pitch Play / Pitch Cadences, Chord Play and Harmony Play settings, tritone-sub approaches and three-press cadences. Expanded recordings preserve named operations and read old clips. Install both modules.

> hbclean.104 / HarmonyBus 0.2.196: Backdoor II/V, chromatic-target cadences and expanded chord families. Whole Tone/Augmented scales synchronize with HB and preserve saved-note projection; recorded actions retain the new operation roles. Install both modules.

> hbclean.103 / HarmonyBus 0.2.195: Unified operation gestures: tap to arm, hold momentarily, double-tap persistently. Knob and step LEDs pulse for persistent activation and stay solid for armed/held activation. The separate Next Latch control is removed.

> hbclean.98 / HarmonyBus 0.2.189: Choose Inversion → Top Note on the existing Chords panel to anchor the generated voicing to the rendered played melody. Chord Mode selects the supporting chord and Voicing selects spacing. Includes the native bank color sync from hbclean.97.

> hbclean.97: Movy mirrors the saved native four-track colors across all banks: 1/5/9/13, 2/6/10/14, 3/7/11/15 and 4/8/12/16. Reads occur on set changes and return from the native view. Native colors are approximated with the closest available MIDI LED palette entries; selection pulses and muted dimming remain separate. No HarmonyBus update is required beyond 0.2.188.

Color synchronization uses the active set's saved `Song.abl`, not native LED highlights. After changing a native track color, allow Move to save, then return to Movy. Unsaved changes are not visible to this reader. Unsupported color IDs, missing files and incomplete saves retain the fallback or last valid assignment; a different set does not inherit the old set's colors. No repeated Song reads occur during normal ticks or knob/pad gestures. The RGB reference for Move's saved IDs is [extending-move's color table](https://github.com/charlesvestal/extending-move/blob/main/core/pad_colors.py). This is saved-color synchronization, not exact live RGB mirroring.

> hbclean.96 / HarmonyBus 0.2.188: Operations settings use one native editor snapshot per lane, operation or condition-selector turn. Tests measure 28/39 host reads reduced to 1, with dependent values and peek highlights updated together. Pending edits still reach the old lane before switching.

> hbclean.95 / HarmonyBus 0.2.187: Auto Chord Repeat is available in the operation selector. Assign it to a Follow Touch lane for tap-latch or momentary repeat using the existing Auto Chord/Arp details. Turning it off restores panel settings. Mode boundaries release held notes; press again to play in the new mode.

> hbclean.94 / HarmonyBus 0.2.186: Approach layout alternates scale-tone rows with chromatic approaches above them. Piano gaps and approach rows show native rendered scale/current/next membership. Movy root/scale controls stay linked to the follower input.

> hbclean.93: Touch and release feedback refreshes native HarmonyBus pad colors before general engine polling, including lane 16. Includes the first-slot startup default.

> hbclean.92: Open the first chain slot (HarmonyBus) at startup and reinitialization instead of the second-slot instrument. Manual slot navigation and module-panel continuity between tracks are preserved.

> Selected track buttons stay steadily white even when muted; other tracks retain mute dimming. New pad defaults: Input Tonic = Grey, Play Color = Track.

> hbclean.91 / HarmonyBus 0.2.183: Follow Map adds a plain lane-6 Off/On toggle beside the assignable lane-5 touch knob. Descriptions read Next Once / Next Latch by default. Touching lane 6 only shows its description; turning switches it off/on. Numeric enum names now agree across the card, touched header and peek.

> hbclean.90 / HarmonyBus 0.2.181: Touch/release frames now draw before synchronous engine and LED status reads. The next tick resumes normal work, so repeated touches cannot starve playback control or pad previews.

> hbclean.89 / HarmonyBus 0.2.181: Follow Map includes Map Touch, defaulting to operation lane 5 (Next Harmony). Lane 5 auto-clears at the next chord change; lane 6 stays latched. Auto Off occupies the duplicate Cycle slot on Conditions, with Normal/Chord Change/Manual policies for harmony and approach patterns. Turning selects a lane; tap latches, hold is momentary. The eight Follow Touch assignments and Map Touch assignment are global across tracks. Pad previews follow the active mapping.

> hbclean.88 / HarmonyBus 0.2.180: Follow Touch provides eight assignable operation-lane knobs, defaulting to 1, 2, 3, 4, 13, 14, 15, 16. Turn to choose a lane; tap to trigger or hold for momentary operation. New sets place Scale Above and Chrom Below on lanes 15 and 16. Their tap order selects the three-note enclosure. Chromatic is independently switchable for every Travel mode and defaults to On. Saved assignments and travel sounds remain compatible.

> hbclean.87: with HarmonyBus 0.2.179, the six piano gap positions play chromatic approaches to their lower pads in Closest Split Chromatic travel. Mapping uses effective harmony at render time. Other travel modes retain empty gaps; coloring rules are unchanged. Independent onset ownership supports overlapping approach/resolution notes and recorded playback. Step-hold note editing retains empty gaps. Includes hbclean.86 touch/release improvements and new-set color defaults.

> hbclean.86: pad-control knobs capture both MIDI release formats and paint cached touch/release feedback before optional host reads. Encoder turns and final writes remain active. New Sets use Both Full Lookahead, Yellow current, Red lookahead, Orange both, Green play, Grey input tonic, 1/4 pulse rate and None pulse shape. Pair with HarmonyBus 0.2.178. Piano layout and coloring rules are unchanged.

> hbclean.85: selected track buttons use the hardware smooth slow pulse between track color and white, retaining the muted dim color.

> hbclean.84: the selected track button pulses white over its track color; muted tracks retain a dim color phase.

> hbclean.83: switching tracks while a hosted module panel is open follows the same module and panel on the new track. Missing modules retain the destination track view. HarmonyBus remains 0.2.176.

> hbclean.82: pair with HarmonyBus 0.2.176 for the global Play Color knob. Live presses, recorded playback and retained inputs share the selected color; Off exposes their harmony/background. Effective shares Current Color, freeing the existing knob slot. Standard is removed from the HB selector. Update both modules.

> hbclean.81: pair with HarmonyBus 0.2.175. A conductor timeline now completes only after the wrap boundary's MIDI has been processed, so restart learning locks after the first complete traversal instead of potentially invalidating an incomplete pass and waiting another cycle. Independent startup pad polling from .80 remains in place.

> hbclean.80: start HarmonyBus pad polling before the initial melodic-pad paint and retain the last complete harmony snapshot across transient host reads. Full Lookahead colors no longer have any accidental dependency on visiting Pads Global. Tested with HarmonyBus 0.2.174.

> hbclean.79: retain recorded Chord Form operation outcomes (operation 19) and validate them through the production bridge. Tested with HarmonyBus 0.2.173. Raw Auto Chord recording, Tempo, track selection lights and Pause note releases from .78 remain in place.

> hbclean.78: normal Record and retrospective Capture preserve raw Auto Chord inputs for both roles. Previously baked recordings remain literal. Selected track button is steady white; a muted selection alternates white/dim track color. Clip metadata includes slot identity and rendering-relevant note/operation content for HB 0.2.171 retained predictions. HB Humanize / Tools Tempo drives the existing shared transport control, including a final retry for older whole-second host timestamp polling. No stored sets are rewritten.

## hbclean.77: global recorded-input humanize

Pair with HarmonyBus 0.2.168. The existing Play Tools panel is now Humanize / Tools, with shared Timing (0–30 ms), Velocity (0–30%) and Gate (0–30%) controls, all initially off. Timing and Gate affect recorded followers; Velocity also affects recorded conductors. Conductor timing stays exact to protect harmonic analysis. Chords move together, variation repeats each loop and differs between tracks. Live notes, the track currently recording, and saved note content remain unchanged. Timing is limited to sequencer tick resolution and clip boundaries; existing quantization and harmony-buffer rules still apply. Velocity changes recorded attacks before the existing render-velocity gain. Humanize consumes no operation lanes. Old Follow Play Reset/Bypass controls retain their original meanings.

## hbclean.75: quiet recorded-input context

Clip Parameters replaces its static Click hint with a read-only INPUT cell for nonempty melodic clips: Fixed, Mapped, Render, or Mixed. Touch INPUT to see source/current scales or the pitch behavior. The wheel still applies the selected clip edit. An OFFPAD count appears only while recorded pitches have no exact pad in the visible layout; touch it for note names. No pad colors, pitch mapping, or playback behavior change. Metadata is queried at most four times per second, only while this panel is open. Compatible with HarmonyBus 0.2.167.

> Capture fix (pending release): retrospective Capture preserves the already-rendered identity of conductor chord/arp voices, matching normal Record. Captured voices replay directly instead of generating new chords/arps from every saved voice. Applies while stopped or playing, through tempo reselection and save/reload. Follower inputs retain their source-key behavior. Existing captures saved by older versions cannot be reliably identified and are not rewritten.

> hbclean.68 / HB 0.2.159: hold a track button and turn Volume to adjust both local audio gain and HB Render To velocity. Recorded notes stay unchanged; Undo/Redo restores both values. Velocity changes affect subsequent note attacks, including arp/echo hits. No new panel.

**Update-safe storage:** hbclean.68 writes sets, saved chains, version history and preferences under `/data/UserData/movy/`, outside the replaceable module folder. Future custom GitHub/archive installations can replace Movy's code without deleting this data. Existing module-local data is left alone if present but is not imported into the new location; this change protects new saves rather than recovering old ones.

> hbclean.67 / HB 0.2.158: recorded operation actions and clip-reader intervals retain original notes; global operation settings and grids; independent track lookahead; follower-only active-render harmony coloring. Follower Travel lists None first.

> hbclean.66 / HB 0.2.157: captured performance touch releases return immediately after cleanup, bypassing generic knob reads. Short approach taps show the native button burst; the default tap/hold threshold is 350 ms.

> hbclean.65 with HB 0.2.156: follower recordings retain their input degrees across global root/scale changes. Green pads show remapped inputs before auto-chord/arp. Saved source pitches remain unchanged; chromatic approaches retain explicit roles. Legacy notes adopt the first active follower input key after upgrade.

> hbclean.64 restores green recorded-input playback highlights above harmony pad backgrounds, in fourths, piano and Inline layouts. Note-off restores the background.

> hbclean.64: note pads show exact retained raw arp inputs in green, including released latched inputs. Output transformations and generated chord tones cannot create ghost highlights. One bounded snapshot carries harmony colors and the input pool together. Pair with HarmonyBus 0.2.151 for Single/Overlap latch choices and Clear on Harmony Change.

> hbclean.60: tool display name is now **01 Movy (HarmonyBus Clean)** so Schwung lists it before File Browser. Module identity and saved data are unchanged. Keep HarmonyBus 0.2.149.

> hbclean.59: paired with HarmonyBus 0.2.149. Approach knob touches and operation step controls report immediate presses and timed releases to shared DSP gesture state. Short taps arm/toggle; holds release off. Tap order chooses enclosure order, and unused modifiers can be disarmed independently. Hold Time is in Global (250 ms default, 150–500 ms); operation Touch Mode offers Hold, Toggle and Tap/Hold. Captured releases retain their original owner; teardown cancels without arming.

> hbclean.58: stop reloading HarmonyBus contracts on every paint; use cached knob-touch feedback before background polling; retain whole diagnostic frames when snapshot reads fail, including the first read. Tested with simulated 100 ms host reads. Pair with HarmonyBus 0.2.148 for Cycle arp rates and Shuffle.

> hbclean.57: touching or releasing a hosted parameter knob immediately redraws its full-name/value header, without needing a turn. Verified through actual MIDI input on arp, follower and lookahead pages. HarmonyBus 0.2.147 adds corrected latch modes and Clear Arp.

> hbclean.56: refresh held-note analysis independently of ordinary control changes, and update complete diagnostic rows in the fallback renderer. Musical mapping is unchanged.

> hbclean.55: prioritize the empty-clip beat lights immediately after transport polling, before automation reads and other UI work. Recording and audio timing are unchanged.

> hbclean.54: extend complete-page snapshot refresh to the Harmony Flow row in HarmonyBus 0.2.142. Switching analysis pages immediately refreshes the newly selected page.

> hbclean.53: update follower note rows together from HarmonyBus 0.2.141 snapshots at up to 25 Hz. One read fetches all eight cells, preserving raw-note/input-role correspondence during transitions. Older HarmonyBus versions retain ordinary polling.

> hbclean.52 pairs with HB 0.2.137. New follower tracks use Scale content. Opening or loading Movy during native playback adopts the native beat and clip positions without toggling Play. A deleted native set with a stale published UUID gets a separate blank working state after a two-second absence check across all set pages; existing data is not reused as the new set.

> hbclean.51 fixes Record from stopped: with Play Link on, stock Move starts and Movy counts in from its Start signal. Use HB 0.2.136 for the idle scheduler performance fix. All operations and new-set defaults remain.

> New in hbclean.50 with HB 0.2.135: automatic cycle conditions for Clip Repeat, Reverse, Time Shift and Speed. Auto On runs in the sequencer even with the editor closed. Manual holds override the schedule; recording bypasses the recording track. Highest-numbered eligible automatic clip lane wins when several qualify.

> Release hbclean.50 pairs with HarmonyBus 0.2.135: 16 assignable step-row slots, with approaches/enclosures in slots 13–16 by default. Clip Repeat, Reverse, Time Shift and Speed operate while held on existing playing clips. The normal transport keeps moving; release returns to it. Source clips and new-set HB/Plaits defaults are preserved. See [operation controls](https://github.com/douglasmason/harmonybus/blob/main/docs/operations.md).

> Release hbclean.46 restores native Schwung option-list peeks for Lane and Operation. Keep HarmonyBus 0.2.130; update Movy only.





# HarmonyBus Movy

Dedicated Movy build with HarmonyBus preloaded on all 16 Movy source tracks.

This package preserves Movy's module id (`movy`) so installing it temporarily replaces the standard Movy module. HarmonyBus remains a separate installed Schwung module.

Every brand-new Set contains HarmonyBus in MIDI FX 1 on all 16 tracks. Tracks 1–12 have a Plaits monitoring synth; tracks 13–16 have no instrument.

| Movy tracks | HB role | Render To / Receive Channel |
|---|---|---|
| 1, 5, 9 | Conductor | Render 3 |
| 2, 6, 10 | Follower | Render 2 |
| 3, 7, 11 | Follower | Render 3 |
| 4, 8, 12 | Follower | Render 4 |
| 13 | Receiver | Receive 1 |
| 14 | Receiver | Receive 2 |
| 15 | Receiver | Receive 3 |
| 16 | Receiver | Receive 4 |

Source Ch is 1 on conductor/follower instances. All 16 local audio outputs start muted; sequencing, HB processing, and rendered MIDI remain active. To hear a receiver, load an instrument after HB and unmute its local audio. Receivers play already-rendered notes without remapping or rebroadcasting them. The existing channel broadcasts remain available to stock Move/Schwung tracks. Schwung owns hosted parameter pages and transient peeks. Native Move transport follow starts enabled.

Native Move tracks are separate from Movy's source bank. Set native destination tracks 2-4 to receive MIDI channels 2-4 respectively.

Defaults apply only when creating a brand-new Set. Reopening a saved Set preserves its chains and manually edited HB settings.

## Install

Install from the repository URL in Schwung's GitHub/repository installer:

```text
douglasmason/harmonybus-movy
```

This release is **0.34.1-hbclean.155** and requires **HarmonyBus 0.2.242**, installed separately:

```text
douglasmason/harmonybus
```

Update both modules, then restart Move. Existing Sets can use the new controls. Open **Shift + Step 9**, turn the large dial to **Pad Trails**, and turn Trails On. The next page controls decay.

The empty-clip visual metronome uses a display-only clock projected from each engine status reading, capped at 100 ms of extrapolation if readings stop arriving. This removes the wait for the next status poll; it does not compensate for hardware LED latency or a blocked UI thread. Sequencing, clip playheads and MIDI rendering continue to use the engine's own timing.

The clean release counter starts at 20 so Schwung's numeric version comparison recognizes it as newer than hb.19.

`main/release.json` is the installer entry point. Publish and verify the clean release asset before advancing `main` to a tested `clean-hb` commit. Historical hb.16-hb.19 build workflows are manual so updating the installer entry cannot republish an older package.

This is an experimental hardware-test build. Reinstall standard Movy to restore the upstream module.

## Combined conductor cycles

With HarmonyBus in MIDI FX 1, Movy supplies the playing clip's effective loop length,
launch phase, and content revision directly to HB. Only contributing Conductor-role
clips enter the combined cycle; followers and empty/stopped/MIDI-muted lanes do not.
Local audio mute does not remove MIDI contributions. A 3-bar and a 4-bar conductor
produce a 12-bar learning cycle. Playback speed and nonzero loop starts are included.

Clip edits, phase changes, launches, stops, and conductor membership changes reset
the learned model. Repeated playback and selecting a different edit target do not.
Probability or multi-pass conditional clips display Non-repeating; excessive cycle
lengths or more than 64 learned harmony transitions are reported rather than
silently truncating prediction. Lookahead remains Off by default.

Update both modules and restart Move. Existing sets with HB in MIDI FX 1 can use
the new timing bridge; creating a new set is only required for the preloaded layout.

## Conductor-first boundary processing

Each audio block delivers all sequencer MIDI, resolves the conductor harmonies,
then renders chains and releases due follower notes. This ordering is independent
of track index, local audio mute and worker-lane placement. Buffered notes map to
the harmony at release; note-offs keep the pitch emitted by their paired note-on.
HarmonyBus processes each conductor timer only once per block.

In **hbclean.31**, the bridge reports the last completed sequencer tick. Movy
internally points at the next tick after generating MIDI; publishing that next
position previously released buffered followers one tick before the new chord
arrived. The corrected playhead keeps release timing and conductor MIDI aligned
while preserving clip launch origins and combined loop lengths. Existing sets
benefit after updating Movy and restarting; recreating a set is unnecessary.

Regression tests run the actual sequencer across several block sizes and loop
wraps, then replay its metadata and MIDI through HarmonyBus. Thirteen rapid
repeated presses spanning a bar line must use the new chord both locally and at
Render To. This test fails with the old playhead timing.

## Clip edits and timing guide

Open Clip Params with **Shift + Step 3**. Knob 5 selects the edit grid
(1/16, 1/8, 1/4, 1/2, 1 Bar). Knob 6 or the main wheel selects **Fill Gaps**
or **Quantize + Fill**. Press the main wheel to apply one Undo-able edit.
This edits the selected melodic clip's current loop; stop recording first.

Fill Gaps sets each onset group's duration to the next playback onset, accounting
for current quantization and swing, with the last group ending at the loop end.
Quantize + Fill first snaps stored starts to the chosen grid. Existing overlaps
are trimmed. Automation and conditions stay at their existing steps. Active
notes keep their scheduled note-offs; edits affect subsequent note-ons.

HB's Follower Buffer is per track, defaults to 1/16 note for fresh settings, and supports
musical durations. Existing saved values survive. On-grid notes stay on-grid,
even with a buffer wider than the grid interval.

The canonical [timing guide with SVG diagrams](https://github.com/douglasmason/harmonybus/blob/main/docs/timing-guide.md)
lives in HarmonyBus. Its PDF is generated in that repo's release workflow.

HB 0.2.104 adds negative lookahead (late harmony) with the capture window before the shifted boundary, and resolves recognized two-note Movy voicings before due followers. Lookahead stays Off by default; new sets use a 1/16-note buffer per follower. See the [timing guide](https://github.com/douglasmason/harmonybus/blob/main/docs/timing-guide.md).


The release gate now loads the actual Movy, Schwung chain and HB native modules together with a deterministic PCM instrument. It exercises raw/chord pads on conductor/follower tracks, local audio, routed note-on/off pairs, generated recording and playback after changing chord form. This covers the host callback boundary; device audio remains a separate verification.

## Playhead polling

During playback, position polling now also runs after 40 ms elapsed, so busy UI ticks do not require waiting eight ticks for a refresh. This preserves the normal polling cadence while reducing avoidable step-button lag. Hardware response still depends on UI scheduling; the elapsed-time behavior is covered by a deterministic browser logic test.

## Saving and performance controls

Movy saves automatically; no save toggle is required. Hosted parameter changes now request a save even when no clip notes changed. Autosave runs at least once per roughly three seconds of elapsed time while the UI is running, rather than waiting 600 slow UI ticks. Notes and UI settings are covered by fresh-session reload tests. Immediate power loss before a save completes can still lose the latest edits.

State is attached to the active native Move Set. A new native Set must acquire a permanent identity; Movy already asks Move to commit it. If a restart still opens an empty pattern, check that you reopened the same native Set and keep the existing Set for diagnosis.

Empty-clip beat LEDs are emitted before potentially expensive set-save work. Modifier release commits Off before controller bookkeeping. These reduce avoidable UI delay; hardware LEDs and capacitive events still share the host UI path, so this is not a guarantee of sample-accurate visuals or touch timing.

Fresh conductor tracks 1, 5 and 9 have Scale Degree chord mode enabled. Existing saved chord modes are preserved. Reset Learn fires once per touch, with no extra reset on release. Clear Notes is removed from the HB arp panel, leaving eight controls.


### Recorded follower pressure

Normal Record stores polyphonic pressure changes with each held input note. On playback, those changes drive HB Repeat Arp hit velocities; the follower notes still map to the current conductor harmony. Curves remain relative to the note onset through quantization and clip speed changes, and follow note copies, transposition, loop wrap, and save/reload. Pressure is applied before arp generation for the audio block. Older sets have no curves and retain their original velocities. Retrospective Capture remains note-only.

## Harmony pad colors

Movy hbclean.43 with HarmonyBus 0.2.129 provides one shared Pads Global panel inside HB, accessible from any track. Display settings apply to all HB tracks and save with the Set; the old Movy Settings controls are removed. Standard preserves the original pad feedback. Current, Effective, Lookahead and Both color pads by their RENDERED pitches, using the active track's follower mapping, chord voicing, modifiers and live Foll Play settings. Each input pitch class is previewed through the effective rendering context once; the resulting pitches are compared with the selected chord. All octaves share the same classification. No notes are sent and one-shot modifiers are not consumed by previewing.

Current tests the rendered pitches against the current conductor chord. Lookahead tests them against the signed lookahead harmony before follower-buffer adjustment, and remains unlit until prediction is ready. Effective tests them against the harmony actually used to render, including predictive follower buffering (bypassed by Repeat Arp). Both overlays Current and Lookahead half a pulse cycle apart. Existing saved display selections retain their meanings and numeric values; Lookahead is appended.

For example, with C as the follower reference, Relative travel and Scale content over G major, input C renders G and lights as a chord tone; input D renders A and does not, even though the input pitch D belongs to G major. In chord mode all rendered voices must belong to the selected chord to receive its highlight; chords with additional scale tones retain the scale background.

The input-key root always has track color as its background. Other pads whose rendered voices all belong to the effective scale have dim-white backgrounds; chromatic results are dark. Current defaults to cyan and Lookahead/Effective to yellow. Overlay pulses leave the background visible between peaks. Last-played, held and immediate pad-down feedback cannot override this scheme.

Pad Pulse Rate: Off, 1/16, 1/8, 1/4 (default), 1/2, 1 Bar, 2 Bars, 4 Bars. Shape: Smooth, Triangle, Square, None (default, flat-line graphic). Both colors have eight choices. Off makes overlays steady, blending shared tones. Move's fixed palette approximates blends in discrete steps. All instances save the same shared display settings; a stale track restore cannot overwrite a live change.

Polling is read-only, at most once per 50 ms, and paused during performance-touch gestures. Pulses follow the master transport when running, or tempo when stopped. Standard returns only the lightweight shared settings, without calculating note previews. Drum and session pads retain their normal display. The five controls are Pad Colors, Pulse Rate, Pulse Shape, Current Color and Lookahead Color. Only the rendering classification varies by track. Stock Schwung can show this panel, but its native pad LEDs require host support; Movy hbclean.43 supplies that integration.

## Step Row performance controls (hbclean.44)

Open Settings with Shift+Step 2, select Step Row with the wheel, and use K1 to choose STEPS or PERFORM. The default is STEPS. This preference is global and persists across sets. PERFORM targets the active track's HarmonyBus in MIDI FX 1, including while viewing another instrument. The footer identifies the target. Shift, Loop, Session and dedicated step editing retain their normal actions.

Hold steps 1–4 to force the corresponding operation lane. Hold 5 for chromatic below or 6 for scale above. Press 7 to arm scale above → chromatic below → target; press 8 for the reverse approach. Enclosures use the next three note/chord onsets, and trigger release does not cancel them. Steps 9–16 are reserved. Changing back to STEPS clears holds and enclosures immediately.

Two HB editing panels share the selected operation lane. Knob touch does not activate these new operations. Source clips remain unchanged; see [the signal path and recording details](https://github.com/douglasmason/harmonybus/blob/main/docs/operations.md). Release gates exercise native loading, recording and UI behavior; physical gestures and audio on Move remain unverified for this release.


### Input keys and layouts (.63)

Set Parameters now has one Layout selector: Chromatic 4ths, Piano, In Key 4ths, and Inline. Inline keeps its existing four-row mapping: each row starts one octave higher. Existing saved mode/layout values remain compatible.

On a HarmonyBus follower in MIDI FX 1, the keyboard scale and follower input scale update each other. Infer shows its current resolved scale without switching itself to an explicit scale. Inference follows the current observed harmony, not lookahead or output transposition. Follower Scale is shared globally: switching tracks never selects a different scale. Conductor tracks also read and edit this shared keyboard scale. The active follower supplies the keyboard root; editing Root selects the same explicit root in HB. The nine shared scales are available on HarmonyBus tracks; other tracks retain Movy's complete scale list.

Standard pad display shows input roots in track color, other chord-role inputs in grey mixed with track color, other scale inputs in grey, and chromatic inputs dark. Piano keeps playable chromatic keys dim grey and gaps black. Held inputs show white; latched arp highlights still identify exact raw input notes. Fourths, Piano, and Inline all use their existing pad-to-note maps. Explicit harmony animation modes remain available.

This synchronization applies to Movy's keyboard. Stock Move's native Key menu still needs a supported host read/write bridge; this build does not claim to synchronize that native menu.

Movy hbclean.74 combines the retrospective Capture fix with live pad previews during modifier holds. Touch and release invalidate the preview for the next LED tick, while held previews retain the bounded 50 ms cadence. Parameter polling and saves remain deferred during performance gestures.

The .77 release supports all seven melodic-minor modes from HarmonyBus 0.2.169 in pad layouts, scale selection, recorded degree projection and input context readouts. Existing pentatonic, blues and chromatic keyboard IDs remain unchanged. Update both modules for the new scales.
### Motifs and Render Rhythm (.108)

The integration reads HB's effective Render Rhythm settings on
parameter edits/loads and retimes known clip attacks in the sequencer. Beat/Bar
windows can advance or delay attacks; chord groups, gates and pressure offsets
stay together. Settings latch at clip-cycle boundaries, and clip storage is not
edited. Install HarmonyBus 0.2.200 for live output scheduling and the
shared Inherit / Off / Override controls. The release workflow runs the sequencer tests and builds the device
artifact before updating the installer pointer.

0.34.1-hbclean.114: Copy cycles Steps / Perform. A Play Motif lane opens its contextual editor; panel and physical Record share ownership. Record, lane step, and knob pulse together using cached native animation. Requires HB 0.2.203.

Track selection pulse: allow the track-color base to drain before its white animation, and repaint only the four track buttons after startup settles.

## Key changes — hbclean.145

Harm Play knobs 5–8 are Key Center, Parallel Scale, Motif Latch, and Chord + Arp, with teal feedback. Shift-turn knob 6 chooses the parallel scale. Global Transpose contains Key Change Scale (Simplified Major/Minor, Mode from Parent, Use Parallel Scale) and Conductor Travel (Relative, Closest Chord Tone). The first landing note uses the previous key; following notes and recorded playback render in the new key, including MIDI to Schwung stock tracks. Source notes remain unchanged. Relative keeps its degree and selects the nearest octave; followers retain their own travel settings. Requires the accompanying HarmonyBus 0.2.235 release.


### Harm Play controls and settings (hbclean.172)

Perform 2 places Harm Play Controls immediately before Harm Play Settings.
Controls activate Key Center, Parallel Scale, Motif Latch, Chord + Arp,
Dominant Color, Release and Advance Motif. Settings has eight knobs:
Key Center Scale; Key Travel: Conductor; Key Travel: Follower Rec;
Key Travel: Follower Live; Parallel Scale; Target Scale Source;
Dominant Color Family; Release Length.
Touch a setting to peek its choices; turn to edit without activating an operation.
Follower key travel policies are global by live/recorded context, default to Same as
Conductor, and only affect Follower Travel=None (or saved legacy Direct). Other
follower travel modes keep their own mapping. Closest Split uses the track's Split
setting: parent degrees for explicit 135/1357 groups, harmony/active membership
for the other groups. Closest Scale Tone uses the new parent scale, rather than
forcing chord tones. Relative preserves degree contour with a consistent tonic
shift; closest modes intentionally permit melodic reshaping to limit travel.
Chromatic On resolves the next target first and keeps the semitone-below approach.
Explicit approach-row and motif intent is also constructed from its mapped target.
Existing recordings keep their source and approach metadata; their current track
Follower Travel and global key-travel choices determine playback.
The optional Chord + Arp Mode settings duplicate was removed to fit these controls;
its Shift-turn shortcut on Harm Play Controls remains available.
Shift-touch/turn Key Center shows its scale-choice list; Parallel Scale and Dominant
Color shortcuts also show their choices. Pad settings remain under Shift + Step 9.
