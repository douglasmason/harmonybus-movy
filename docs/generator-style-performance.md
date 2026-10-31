# Perform Style inside saved recipes — Movy hbclean.289

On the Comp or Bass **Generator** page, **turn knob 7 — Style** to change the
generator's actual pattern while keeping the current recipe. This works for
stock exploration, User recipe exploration and recorded generator clips.

The Browse page still selects the library entry. Generator Style is the sounding
pattern inside that entry, so changing it does not select a different User slot,
restart Explore, or discard the recipe's Complexity and Intensity curves. All
eight authored styles for the selected actor are available; the browser's genre
filter continues to filter library choices without limiting performance controls.

1. Explore a saved User recipe, or select a recorded generator clip.
2. Turn knob 7 to audition a different Style. It takes effect at the existing
   bar boundary, or at a trimmed recorded clip's loop start.
3. Use the **existing Record button** to capture the Style changes. A User recipe
   is copied at its original length to an empty actor clip; an existing generator
   clip uses ordinary automation overdub. The whole pass has one Undo.
4. Outside that actor's recording pass, **touch knob 6 — Revert** to resume the
   source's saved automation in place.

The saved library entry, seed, actor settings and other control curves stay
unchanged by auditioning. Once recording, only controls you move are overdubbed.
A selected User recipe must be exploring before its controls can be changed.
Changing an existing recorded clip while transport runs requires that clip to be
playing, as with Complexity and Intensity.

## Implementation and validation

The new shared parameter uses the existing catalog, native Style control,
bar-boundary scheduler, named automation and Record/Undo paths. It adds no
generator, clock, storage format or host API. Both the Move controller and browser
receive the same parameter metadata.

Controller regressions exercise the physical knob, actor-specific choices,
unchanged User identity and genre filter, invalid choices, library data isolation,
Record handoff and one-pass Undo. Native tests compare exact Comp/Bass event
traces after recording and reload, preserving the untouched curves and seed.
Production-chain tests exercise Style changes, Revert, recording and Undo through
the actual Movy and HarmonyBus processors.

Pair with **HarmonyBus 0.2.310**. Physical Move audition remains outstanding.
