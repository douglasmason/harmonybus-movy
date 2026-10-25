# One session conductor — Movy 249

New Sets use **track 1 as the conductor across all four banks**. Joint Play's
Root pads, Root settings, record target and performance controls address track 1.
Bass, Comp and Melody remain in the selected bank. Chord Play uses the same
conductor, while its Comp and Bass assignments remain configurable.

| Bank | Root | Bass | Comp | Melody |
| --- | --- | --- | --- | --- |
| 1–4 | 1 | 2 | 3 | 4 |
| 5–8 | 1 | 6 | 7 | 8 |
| 9–12 | 1 | 10 | 11 | 12 |
| 13–16 | 1 | 14 | 15 | 16 |

Fresh tracks 5, 9 and 13 have their HarmonyBus role set to Off. Their clips,
instruments and explicit drum output settings are independent of this layout.
The first bank's Bass starts in Follow; other banks start in Clip so a fresh
Root performance does not trigger four bass parts. Enable Follow on additional
banks when you want those bass parts to follow the shared Root, each in its own
register. Comp follows its bank's Melody as before.

## Existing Sets

Existing Sets retain their saved layout, including Sets without a UI-state file.
To adopt the new layout, stop playback and recording, open **Clips → jog right →
Setup**, and turn **knob 6, Conductor**, from **Legacy** to **Track1**.
The conversion requires a ready Movy/HarmonyBus track 1. Wait for loaded chains
to settle before converting.

This makes track 1 a conductor and changes any other HarmonyBus Conductor role
to Off. It binds Joint Root and Chord Play to track 1. Clips, notes, instruments,
MIDI output channels, drum destinations and other bank settings remain intact.
Existing Bass Follow choices are retained: every enabled bass now follows track
1. If Chord Play previously assigned Comp or Bass to track 1, that assignment
moves to a free track to keep the three actors distinct.

The conversion is one **SINGLE CONDUCTOR** Undo entry. Undo restores the prior
roles, Root mapping and Chord Play assignments; Redo reapplies the conversion.
Turning the knob back reminds you to use Undo. The setting persists with the Set;
it is not a switch that rebuilds or guesses a former four-conductor template.
If a role write fails, conversion rolls back; if a rollback write also fails,
the remaining change stays in Undo for recovery.

The underlying HarmonyBus engine still supports saved multi-conductor Sets and
manual role editing. This release establishes the shared Root mapping and new
template; it does not remove those engine capabilities.

## Clips and drums

Top Pad Row and Knob Touch Row remain independent. Either can expose track 1's
conductor clips or clips from drum source 5, 9 or 13. Knob 4 still explicitly
chooses **Chain / Drum Ch 1** for the selected drum source. Conversion never
interprets existing conductor material as drum samples or enables drum output.
See [drum destinations](drum-output.md) and [Clips controls](clips-view.md).

Left/right arrows browse four-track banks. Jog right from Setup opens the
existing Master pipeline; the screen retains **Jog > Master / Back**.

## Verification

Shared-controller tests cover stopped-only conversion, failed-write rollback,
actual Undo/Redo, legacy and new-Set persistence, all-bank Root geometry and
record masks, Root parameter ownership and held-control releases. Native tests
cover Root fan-out, independent live/clip owners, pressure, route changes and
Chord Play overrides. The production Movy/Schwung/HarmonyBus chain verifies a
track-1 clip driving bank-2 bass on its configured output channel with paired
releases. The release also runs browser logic, existing UI regressions, native
sequencer/DSP tests and ARM packaging. Hardware behavior remains untested.
