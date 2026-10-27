# Context-aware Chord Discovery

HarmonyBus 0.2.308 and Movy 0.34.1-hbclean.280 make Discovery follow the music already in progress. Open **Chord Play > Discovery** and press **Refresh** to capture a new starting point.

- **Immediate:** uses the current conductor harmony.
- **Queued:** uses the last queued chord, including a waiting Touch Phrase; falls back to current harmony when the queue is empty.
- **Use Edit Chord:** explicitly uses the selected bank slot. This is also the fallback when there is no current harmony.

**Next Chord Preview** offers nearby diatonic moves, ii/V approaches, a destination chord and borrowed iv/bVII. **Lead To Degree** chooses the destination. Nearby choices are ordered by movement from the captured native voicing; the existing HarmonyBus resolver supplies the notes, scales and functions. These are deterministic musical templates.

**Voicing Preview** uses the captured actual chord. Variants with identical MIDI notes collapse into one choice, with unused positions dark. Next-chord choices retain different chord scales or functions even if their immediate voicings coincide.

The choices and audition notes stay fixed until Refresh, changing the destination, changing the source, or switching preview modes. Hold a candidate knob or step 1–7 to audition; release ends that audition. Audition does not change the conductor, queue or recording. Step 9 **Keep** uses the existing Immediate/Queued behavior. Voicing Keep changes the sound owner's voicing globally. **Save Choice** still requires a second tap to replace the selected bank slot and is available only for next-chord choices.

If the key, parent scale, voicing settings or output route changes, a cached audition remains its captured notes. Keep/Save revalidate the selected choice and request **Refresh** if it would now resolve differently. Refresh captures the latest state. Context snapshots and previews are transient and do not alter saved native state.

Validation covers native current/queue capture, waiting phrases, register retention, stale-context rejection, frozen notes across key changes, distinct UI choices, shared-controller gestures and production-chain PCM/MIDI with recording armed. Existing native, browser/controller and sequencer/DSP regressions run before publication. No physical Move audition is claimed.
