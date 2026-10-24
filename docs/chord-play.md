# Chord output and mode feedback — Movy 0.34.1-hbclean.241

Chord selections now use HarmonyBus 0.2.293 and the conductor’s configured Render channel. With Movy track 1 routed to MIDI channel 3, chord-bank knob touches and step buttons play the selected harmony into original Schwung’s chord/pad track. Conductor chord, voicing, arp, and rhythm panels are available in Chord Play’s Conductor category. The default Comp Input uses conductor output when enabled, avoiding duplicate melody-triggered chords on the same destination. With Render Off it follows the melody instead. Comp Clip and explicit Follow Melody remain available.

Selecting harmony does not arm recording or edit the conductor clip. Record explicitly starts the existing take: the conductor replaces the elapsed interval, while melody retains its existing recording behavior. Rendered chord voices are not recorded a second time.

Input-mode changes invalidate instrument, step, and knob LED caches. Ordinary and animated step painters invalidate each other’s cached colors, and chord-bank knob LEDs are protected from generic parameter meters. Accepted-harmony feedback polls at 16 ms intervals for the first 100 ms after selection, then returns to the normal 250 ms idle interval.

Session single-tap opens the mode selector; double-tap within 350 ms opens Clips. Back retains the previous-view behavior.

Validation covers real conductor MIDI output, no recording without Record, conductor replacement, mode cache reset, alternating LED owners, browser/controller suites, native sequencer/DSP suites, and ARM packaging.
