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
https://github.com/douglasmason/harmonybus-movy
```

The corrected clean release reports version **0.34.1-hbclean.39** and requires **HarmonyBus 0.2.124 or newer**, installed separately. HB 0.2.95's missing quant-grid symbol can prevent module loading; earlier clean candidates also had malformed preset strings. After updating both modules, reload them and create a brand-new Set to check the prepared layout.

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

Pad Pulse Rate: Off, 1/16, 1/8, 1/4 (default), 1/2, 1 Bar, 2 Bars, 4 Bars. Shape: Smooth (default), Triangle, Square. Both colors have eight choices. Off makes overlays steady, blending shared tones. Move's fixed palette approximates blends in discrete steps. All instances save the same shared display settings; a stale track restore cannot overwrite a live change.

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
