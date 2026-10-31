# Named actor recipes — Movy hbclean.287

Saved Comp and Bass recipes now have names, genre tags, phrase lengths and a
summary of their recorded generator controls. Both the ordinary actor library
and the generator browser use the same User slots and labels.

When saving, the name and genre tags come from the source styles. A recording
that changes styles receives a `Mix` name and the combined tags of those styles.
The displayed length comes from the clip. `Auto C`, `I` and `S` indicate changes
in Complexity, Intensity and Style over its loop; a generator with constant
controls shows `Fixed controls`. Repeated locks with the same value do not count
as changes. These summaries are evaluated by the native engine when opening Save.

## Name and tag a recipe

Open the existing Save review, or select a saved User entry in the actor library
and open its Load/Explore review.

- **Touch knob 3 — Name:** use the shared text keyboard. Turn the jog wheel to
  select a character and click to enter it; its special keys provide case/page,
  space, delete and confirmation. Back cancels typing. Names are limited to 32
  printable characters; long display labels are shortened on the small screen.
- **Turn knob 4 — Genre:** keep the original tags, choose Untagged, or select one
  of the actor's genre tags. Generated defaults can contain several tags.
- **Touch knob 5 — Save info:** when reviewing an existing entry, save only its
  name and tags. This does not load, explore, record or change its musical payload.
- **Touch knob 1 — Apply/Explore:** perform the existing review action and save
  any staged name/tag edits. **Knob 2 or Back** cancels the review and its edits.

For ordinary note presets, knob 6 now selects Own/Keep weaving in their User
review; stock-style reviews retain knob 3 for this existing choice.

## Browse by actor and genre

Choose **Libraries → Browse → Actor → Genre → Family: User**. Saved generator
recipes matching that genre appear with their names. **All** still exposes all
eight User slots, including legacy entries. A selected recipe stays visible if
you change to a filter that excludes it; changing a filter never changes the
sounding source. Choosing User while already exploring selects an available
saved generator rather than requiring User 1 to be occupied.

Slot numbers remain part of the label, so duplicate names cannot select the wrong
entry. Renaming refreshes both library surfaces without changing that identity.
The generator footer retains the actor, track and clip destination alongside
the saved length and automation summary.

Exploration and control changes remain temporary until the existing Record
button is pressed. Record, the saved loop length, automation overdub, Undo and
HarmonyBus rendering retain the behavior of hbclean.286.

Older User files remain readable. Entries without metadata keep their existing
slot labels and an unknown-length indicator; they can be renamed/tagged directly.
Saving their source clip again derives the new length and control summary. An
older Movy build can still read their musical payload, but saving the user file
from that build can discard metadata it does not understand.

## Validation

Native tests cover style identities, varying versus constant control curves,
ordinary note presets and read-only summaries. Shared-controller tests cover
both actors, genre filters, stable slot selection, physical jog/click renaming,
Record and step-button isolation while typing, metadata-only saves, cancellation,
failed writes, stale entries, file reload and malformed optional metadata. The
128×64 review is rendered and checked. Full native/DSP/allocation, browser,
production-chain and QuickJS device-startup checks remain required; CI builds
the ARM package and verifies its uploaded download before advancing the installer.

Pair with **HarmonyBus 0.2.310**. Physical Move audition has not been performed.
