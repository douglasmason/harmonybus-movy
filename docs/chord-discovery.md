# Chord Discovery

HarmonyBus 0.2.305 and Movy 0.34.1-hbclean.273 add a Discovery category inside Chord Play. Existing Core pages, melody pads and horizontal tonic positioning remain available.

## Explore

Open **Discovery > Next Chord Preview**. Seven choices offer three diatonic moves, secondary ii and V approaches to a selected degree, borrowed iv and borrowed bVII. **Lead To Degree** on Discovery Actions sets the destination for the approaches. These are deterministic harmonic templates resolved by the existing HarmonyBus selection engine, not a genre database or a ranked recommendation model.

Hold a candidate knob or step 1–7 to hear it. Releasing ends only that audition. Step 8 or 16 clears harmony through the existing Harmony Off action. Step 9 **Keep** sends the selected chord through Immediate or Queued Chord Play. In Touch Phrase mode, Keep commits the phrase. Step 11 **Refresh** rebuilds the choices from the last kept chord. **Use Edit Chord** returns to the selected bank slot as the starting point.

The seven relationships remain stable until Refresh, changing the destination, or switching between Next Chord and Voicing Preview. A held audition resolves against the current harmonic context and sound owner. Candidate chord names and colors come from native HarmonyBus resolution.

## Compare voicings

**Voicing Preview** offers Current, Root, First, Second, Alternate Up, Fifth Low and Root Below. They use the sound owner's chord form and range, plus the existing key mapping. Some choices can coincide when the range/top-note setting constrains them. Keep applies the chosen voicing and inversion to that sound owner globally; it does not attach a voicing to one bank slot. Save is therefore available for next-chord choices only.

## Save a chord

On **Discovery Actions**, choose **Save To Chord** (1–21). The default is slot 1. Step 10 or **Save Choice** arms the save; a second tap confirms replacing that slot. Changing the audition, destination or save slot cancels confirmation. Saving does not activate the chord. Existing UI-state persistence stores the updated bank.

## Boundaries and validation

Audition uses the existing local and rendered output ownership. It does not select conductor harmony, enqueue a chord, write a recording, or persist preview state. Releasing, leaving the page, changing routing, Harmony Off and existing stop/panic cleanup release preview notes. Other sources holding the same pitch retain their note ownership.

Previews compare chord voicings through the current instrument/output path; they do not audition a complete arrangement or the chord player's arpeggio sequence. Normal output rhythm processing remains active. The UI resolves at most one candidate per tick, then uses cached results. Older HarmonyBus versions show unavailable choices instead of guessing notes.

Validation includes native ownership/state tests, shared-controller interaction tests, full production-chain PCM/MIDI and armed-recording tests, existing browser regressions, Rust sequencer/DSP tests and device-bundle compilation. No physical Move audition has been performed.
