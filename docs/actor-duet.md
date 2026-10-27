# Comp and Bass exploration together — hbclean.283

Pair Movy **0.34.1-hbclean.283** with HarmonyBus **0.2.309**.
This includes the Fixed/Adaptive motif export introduced in Movy 282.

In **Chord Play → Libraries**, choose Comp and start Explore, then choose Bass
and start Explore. Both now keep playing. The Actor selector changes the controls
being edited; each track retains its own style, complexity, intensity and seed.
Recorded-generator previews can also run alongside another actor's exploration.

The existing **Record button** starts a take for the selected actor. Its track
and clip remain fixed during count-in and recording, even while browsing or
adjusting the other actor. Press Record again to end that same take. The other
actor's controls remain temporary and its exploration continues. A subsequent
Record press starts a separate pass for the actor then selected. The footer shows
`Rec T…` when editing a different actor from the one being recorded.

**Explore Stop** stops only the selected actor. Stopping that actor's audition
also ends or cancels its own recording; stopping the other actor leaves the take
running. **Transport Stop**, **Harmony Off**, and leaving Chord Play stop all
exploration. A clip change ends that clip's preview/recording rather than moving
the take to another destination. Each Record pass has one Undo; Undo retains an
unrelated free audition. Loading a Set clears all temporary auditions.

The normal destination rules still apply: an initial take needs an empty clip,
Own source routing, mapped input and three available automation lanes. Recorded
recipes use the existing overdub and Bake paths. Bake requires stopping the
selected actor's preview and all recording; another actor may keep exploring.
Comp and Bass must occupy distinct tracks to sound independently. This remains
one active recording pass at a time, with both actors free to play or explore.

Implementation uses one bounded temporary source per existing track and the
existing recorder destination, clock, gate ownership, rendering snapshots,
automation lanes and Undo machinery. No temporary clips or second scheduler are
created, and the saved generator format and style IDs remain unchanged.

Validation covers solo-versus-duet MIDI trace equality, both actor directions,
independent gates/settings/stops, count-in cancellation, fixed clip destinations,
recorded preview/overdub, companion controls staying out of saved state, Undo
with continued audition, physical Actor/Explore/Record routing, and the actual
Movy → Schwung → HarmonyBus production MIDI/audio path. The release workflow also
runs the complete native/controller regressions, device startup and ARM package
checks. Physical Move audition remains to be done.
