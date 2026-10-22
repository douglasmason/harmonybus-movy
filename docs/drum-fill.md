# Selected drum fills — Movy 0.34.1-hbclean.230

Turn an existing drum clip into a fill variation using the ordinary clip editor.
Stop playback and recording, select a drum pad and its clip, then open Clip
Parameters (Shift + Step 3 from Track view).

- Knob 5 selects the existing timing grid (1/16 through one bar).
- Knob 6 or the jog selects Last Beat, Last 2 Beats or Last Bar.
- Knob 7 displays the selected drum's MIDI note number.
- Knob 8 selects fill velocity (1–127; initially 100).
- Press the jog to write the fill. One Undo restores the preceding clip.

This replaces that drum's attacks inside the chosen tail of the active loop.
It leaves other drum lanes, notes outside that window, loop length, clip speed,
quantization, swing, trigger conditions and automation intact. Existing trigger
conditions can therefore suppress a written attack. The notes have short gates,
no harmonic input mapping or note-bound operations, and remain editable through
ordinary step/Grid tools. Grids longer than the selected span produce one attack.
Short loops clip the span to their own start; they never grow.

Copy a groove to another clip before filling it to keep both versions. Launch
that fill clip using existing scenes or Song Sections. The fill repeats with its
clip; this increment does not automatically insert a one-shot transition or
restore the groove on the next bar. No new scheduler or saved recipe is added.

The editor refuses melodic modules, empty clips, playback (including pending
start), recording, invalid input and insufficient note capacity. Capacity is
checked before changing notes. The UI's request toast is not an engine success
acknowledgement; if the clip is full the existing notes remain intact.

## Output scope

For a stock/host drum track 1, Movy's existing clip output emits the sample note
on MIDI channel 1. The receiving stock track must already be configured to accept
that channel, with pitches matching its kit. This release does not select a kit
or assume General MIDI sample assignments. Stop releases the existing note owner.
Other drum modules use their existing local chain routing.

When all tracks are Movy-hosted for Joint Play, track 1 is the Root/conductor;
it is not repurposed as drums. A separately owned drum destination for that mode,
live drum input routing and automatic section-boundary fills remain further work.
The melodic Fill Gaps and Quantize + Fill tools retain their existing behavior.

## Verification and browser handoff

Native regressions cover selected-lane replacement, loop bounds, repeat stability,
save/reload, Undo, malformed commands, transport/recording guards and atomic
capacity failure. The production UI test exercises selection, explicit apply,
velocity, display and one Undo. The production Movy DSP fixture verifies channel
1, exact pitch/velocity and matching releases, including an early stop; it does
not emulate Move's proprietary drum instrument or assert physical-device audio.
Full browser logic, native/DSP regressions, inherited benchmarks and ARM packaging
gate the installable release, followed by uploaded-package checksum verification.

`dfill <track 0..15> <pitch 0..127> <span 96|192|384> <grid 24|48|96|192|384> <velocity 1..127>`
is an ordinary undoable edit. Drum identity uses the existing UI-owned `tdrum`
contract. Saved notes use the existing clip format. Matching UI/DSP identity is
`0.71.0-drum-fill1`. Browser hosts reuse the production editor and command batch;
no JavaScript fill generator or timer is needed. No Site or physical device was
deployed by this release.
