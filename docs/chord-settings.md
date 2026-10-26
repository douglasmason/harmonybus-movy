# Chord Play settings — Movy 0.34.1-hbclean.259

Chord Play keeps its eight main performance panels and reduces extended settings
from 59 pages to 44. Every native control remains accessible. Knob 8 still turns
the current sound's default range immediately, taps Harmony Off, and resets the
default with Shift+touch. Chord-knob turns still edit that chord's own range.

| Settings group | Previously | Now |
| --- | ---: | ---: |
| Sound | 4 | 3 |
| Conductor Settings | 12 | 8 |
| Comp | 14 | 10 |
| Melody Mapping | 4 | 3 |
| Melody Sound | 4 | 3 |
| Melody Operations | 10 | 6 |

Conductor Content, Chord Editing, Libraries and Setup retain their existing page
counts. Related displaced controls share an Op Details page instead of separate
one-control More pages. Live key controls and reset share one page; conductor
chord defaults sit beside harmony setup. Knob and step operation slots 8 and 16
remain available.

## Sound ownership

The first Sound page is Output: source, current owner/output, velocity, chord
form, default range/inheritance, voicing and inversion. Chords and Arp follow.
Their titles identify the actual owner, for example Sound Cond T1 or Sound Comp
T3. The Sounds readout `C1>3` means conductor track 1 renders to MIDI channel 3;
`Comp T3` means the comping track owns the sound controls.

With the existing Conductor / Melody source, direct conductor output takes
precedence. When that output is Off, melody-triggered comping is the fallback.
Comp Clip and Follow Melody select the comp track using the existing routing.
Switching routes preserves the current panel, settings group, melody focus and
queue mode. No engine, timing, note-ownership or routing policy is added.

The native default-range control preserves the Comp `Conductor` inheritance
choice. The separate Range knob displays the effective inherited value and
auditions edits immediately. Per-chord range overrides continue to take priority.

Comp and bass library pages are labeled with their owning track and Clip. Their
length and pitch-shift controls explicitly edit stored clip contents. Browsing a
style still requires a deliberate tap and the existing load review; these clip
edits do not silently become conductor velocity/range changes.

Usage reports identify this as layout 3. A layout update starts fresh navigation
counts so old page distances are not attributed to the new interface; the logging
On/Off preference is preserved.

## Verification

The real shared-controller regression compares surfaced controls with native HB
definitions, checks exact group counts, tests output-owner writes and inheritance,
and exercises route changes and clip labels. Existing queue, range, navigation,
LED, operation, conductor-content, library, data-survival and startup suites remain
required. The production native/DSP, audio-chain and ARM packaging checks run in CI.

Install this Movy update through Schwung Manager. HarmonyBus 0.2.298 remains the
required native engine; this increment does not change it. No physical device is
deployed or flashed by the release process.
