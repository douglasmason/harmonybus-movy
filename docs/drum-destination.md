# Drum destination progress

Movy 233 provides selected-lane drum fills. Stock host track 1 already emits ordinary clip notes on internal MIDI channel 1. With all tracks hosted by Movy, clips instead enter their corresponding chains; a dedicated channel-1 drum destination is not implemented yet.

## Sample-pitch prerequisite

Recognized drum tracks treat stored note pitches as sample addresses. The sequencer now bypasses melodic key/piano-identity pitch conversion at note emission on these tracks. This also covers imported/copied notes carrying saved melodic metadata and the interval between a module change and the next follower-context refresh. Existing gate and pressure events use that same emitted pitch. Stored clips and recorded actions are preserved; this does not bypass downstream chain MIDI effects or implement a new output route.

The regression covers every MIDI pitch, raw and rendered notes, stale key context, saved piano alias metadata, clip transpose, exact velocity, paired releases and pressure. Existing melodic regressions remain enabled.

## Next explicit destination

The intended output contract is drums 1, bass 2, pads 3 and lead 4. Joint Root remains a harmonic conductor. A drum destination must be explicitly selected; it must not silently replace Root or reserve another occupied actor track.

Reuse the ordinary clip scheduler and its gate releases. Before implementation, settle and test these boundaries together:

- Set persistence and Undo for selecting a source/destination, with legacy Sets defaulting off.
- Separate clip output from live pad input; expose the actual supported scope in the UI.
- Onset-owned releases across Stop, scene changes, module/routing changes, Undo and Set load.
- Explicit interaction with source borrowing and Joint guide/follow routing, preventing drum sample addresses from entering harmonic interpretation.
- One host MIDI send path, with no duplicate chain output; preserve Root and channels 2–4.
- Production C-chain tests for channel, pitch, velocity and release counts, plus browser adoption through the existing shared controller.

Automatic one-shot fills returning to a backing groove and session-to-song drafting remain subsequent work. Browser hosting and lighting work stay on their existing parallel branches.
