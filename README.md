# HarmonyBus Movy

Dedicated Movy build with HarmonyBus preloaded on all 16 Movy source tracks.

This package preserves Movy's module id (`movy`) so installing it temporarily replaces the standard Movy module. HarmonyBus remains a separate installed Schwung module.

Every brand-new Set contains HarmonyBus in MIDI FX 1 and a Plaits monitoring synth on each Movy track. The tracks form four identical quartets:

| Movy tracks | HB role | Render To Ch |
|---|---|---|
| 1, 5, 9, 13 | Conductor | 3 |
| 2, 6, 10, 14 | Follower | 2 |
| 3, 7, 11, 15 | Follower | 3 |
| 4, 8, 12, 16 | Follower | 4 |

Source Ch is 1 on every HB instance. All 16 local audio outputs start muted; sequencing, HB processing, and rendered MIDI remain active. Schwung owns hosted parameter pages and transient peeks. Native Move transport follow starts enabled.

Native Move tracks are separate from Movy's source bank. Set native destination tracks 2-4 to receive MIDI channels 2-4 respectively.

Defaults apply only when creating a brand-new Set. Reopening a saved Set preserves its chains and manually edited HB settings.

## Install

Install from the repository URL in Schwung's GitHub/repository installer:

```text
https://github.com/douglasmason/harmonybus-movy
```

The corrected clean release reports version **0.34.1-hbclean.28** and requires **HarmonyBus 0.2.106 or newer**, installed separately. HB 0.2.95's missing quant-grid symbol can prevent module loading; earlier clean candidates also had malformed preset strings. After updating both modules, reload them and create a brand-new Set to check the prepared layout.

With Chord Mode enabled on a Movy conductor track, recording now stores the generated chord voices, including their individual starts and note-offs. Playback marks those saved voices so HB passes them through to the conductor synth and Render To channel without building another chord. Raw notes in older clips still use the current chord mode. Auto Chord also exposes Chord Quality, Chromatic Keys and a one-shot Chromatic Below control on both conductor and follower instances.

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

In **hbclean.28**, the bridge reports the last completed sequencer tick. Movy
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

HB's Follower Buffer is global, defaults to 1/16 note for fresh settings, and supports
musical durations. Existing saved values survive. On-grid notes stay on-grid,
even with a buffer wider than the grid interval.

The canonical [timing guide with SVG diagrams](https://github.com/douglasmason/harmonybus/blob/main/docs/timing-guide.md)
lives in HarmonyBus. Its PDF is generated in that repo's release workflow.

HB 0.2.104 adds negative lookahead (late harmony) with the capture window before the shifted boundary, and resolves recognized two-note Movy voicings before due followers. Lookahead stays Off by default; new sets use a 1/16-note global buffer. See the [timing guide](https://github.com/douglasmason/harmonybus/blob/main/docs/timing-guide.md).
