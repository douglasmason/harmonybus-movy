# Movy 0.34.1-hbclean.255

Chord Play now has eight main panels: its home controls, three chord banks,
scale controls, two operation banks, and motif play. Editing, routing, comping,
bass, and setup options remain in the existing grouped Settings menu. Back
returns from a group to the menu, then to the main panels; it no longer cycles
between the group and menu. Left from the first menu item still returns to
the previous panel, and list selection does not wrap.

Normal Play and HB Settings have a directly accessible **Harmony & Pads** page.
It shows Current, Effective, Next, and model readiness beside the existing pad
display, lookahead, and pulse controls. Current means the accepted conductor
chord; Effective includes the track's rendering policy; Next is the prediction.
The page uses one bounded snapshot and only polls while visible. HarmonyBus
0.2.296 also prevents a learned timeline from advancing Current colors before
the conductor accepts the change. Lookahead remains separate.

Track selection no longer reloads the hidden normal module during a performance
view. Synchronous loading also cannot turn a quick track tap into a long press
that restores the previous track. Back from a hosted module's root page,
including Schwung's stock Chord page, returns to the input view.

**Drum Fill** is available in existing operation assignments. Select it for an
operation slot and set **Drum Note**; touching that slot's knob or pressing its
step triggers one fill on the configured drum destination while the melody
track stays selected. Chord Play's operation pages use the operation step row;
its chord-bank pages still use chord steps. Joint Play triggers once before
actor fan-out. This is the existing performance fill, with its existing timing,
span, velocity, cancellation, and ordinary Record capture. The Clip Params drum
controls set those shared fill options. It does not populate a clip unless
ordinary recording captures the played fill.

Validation covers the real UI controller and MIDI dispatcher, repeated loop
resets with a held conductor chord, visible-only harmony polling, production
QuickJS startup, native sequencer/DSP suites, full-chain MIDI/audio behavior,
and package checksums. Physical Move behavior and the reporting user's Set
still need confirmation on the device.
