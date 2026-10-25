# Clips performance and setup

Clips now opens a performance overview. Turn the jog right to Clips Setup,
then right again to the existing Master pipeline. The overview says
`Jog > Setup > Master`; Setup says `Jog > Master / Back`. The first Master
slot says `Jog left: Clips Setup`. Back leaves Setup or the Master slot grid
for Clips; inside a Master detail page, Back retains its existing behavior.
Jog click switches between the overview and Setup.

Left/right moves between the four track banks, clamping at either end. Browsing
does not select another track, issue transport commands or change scene recipes.
The existing up/down bank shortcut remains available. Browsers, input-mode
selection and other overlays retain ownership of their navigation.

## Setup knobs

1. **Row:** Bank (original mapping), Conductor (track 1), or Drums.
2. **Touch:** Normal (touching or turning opens the existing Master controls), Conductor clips, or Drum clips.
3. **Drum track:** track 5, 9 or 13, remembered separately for each bank.
4. **Drum Clip Out:** Chain or Drum Ch 1 for that selected source (Movy 245). This changes clip output only; see [Drum clip destinations](drum-output.md).

5. **Conductor:** Legacy or Track1 (Movy 248). While stopped, turn to Track1 to adopt the session conductor. Undo restores the previous layout; see [single conductor](single-conductor.md).

Knobs 6–8 are inactive in Setup. Row and Touch are independent per-Set
preferences. Defaults remain Bank/Normal, preserving the existing routing and
track presentation. Default drum sources are 5/5/9/13 across the four banks.
These preferences persist through the existing Set UI serializer and autosave.

The overview lists all four actual pad-row track numbers. An assigned touch row
identifies its track and shows eight clip columns: P playing, Q queued,
a box around the selected slot, a dot for content, and blank space for an empty slot. REC in the header reports the existing recording
state; it is not a claim that every displayed row is recording. The knob LEDs
use the existing LED budget/cache. Launch touches are deduplicated until release.

Pad and knob clips use the same session launch/copy/delete handler. Selecting a
clip keeps the existing selected-track behavior but preserves the visible bank,
so the global conductor cannot pull the grid back to bank 1. Live recording is
never enabled by browsing. Scene and Song behavior is unchanged.

Knob turns are inactive on an assigned performance touch row. In Setup and
Master, touches cannot launch clips. A knob held across a page or mode change
must be released before it can launch again. Owned releases are consumed even
after leaving Clips. This avoids accidental launches while turning parameters.

## Existing engine behavior and scope

Running clip launches are quantized to the next bar; stopped launches start
immediately. Tapping a playing clip queues a relaunch. These are displayed as
behavior, not editable settings: the engine does not currently expose alternative
launch grids or playing-clip tap policies. Empty clips retain stock stop behavior.

New Sets use one session conductor on track 1. Existing Sets retain their layout
until explicitly converted with knob 5. The row assignments are a presentation layer. Selecting Drums for a row does not
rewrite the track's chain, change MIDI channels, convert pitches, or remove other
conductors in a saved Set. Use the separate Drum Clip Out control to enable channel-1 output explicitly.
It preserves live pad behavior and chain settings. See [Drum clip destinations](drum-output.md)
for routing, persistence, Undo and validation. No physical Move or deployed browser Site is updated.

## Verification

`browser-test/hb-clips-view.mjs` exercises the shared sequencer dispatcher and
outer hardware dispatcher, launches/deletes, fixed bank focus, duplicate touches,
release across modes, Master ownership and return, invalid persistence values,
actual Set UI roundtrip, status rendering and footer width. It renders production
screens to `artifacts/clips-performance.png` and `artifacts/clips-settings.png`.

The Movy 245 verification includes TypeScript, full browser logic, 27 focused UI
suites, 809 native tests, production-chain MIDI/audio tests and ARM packaging.
The setup page is rendered using the shared knob-settings controller.
