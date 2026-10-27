# Pad position — Movy 0.34.1-hbclean.269

During melodic note play, Left/Right move the keyboard pattern one pad column in
the indicated direction. Chord Play and Joint Play use this behavior too, including
while ordinary settings panels are visible. Turn the jog to change panels.

The tonic continues to come from HarmonyBus's resolved parent/input key. Arrows
change its physical position, without editing the key or follower root policy.
When the key changes, its new tonic appears at the same chosen position. Existing
explicit input-root settings retain their meaning.

For C major, three Right presses change the bottom row from
`C D E F G A B C` to `G A B C D E F G`, with the first three notes in the lower
octave. Notes stay in ascending order. Piano gaps and approach rows follow their
targets. The same position applies to Move, Joint Play and the attached Launchpad.

The position is saved with the Set and shared across tracks. It ranges from seven
columns left to seven columns right; old Sets start at zero. A short toast shows
the position. Octave buttons keep their existing register controls.

| Context | Left/Right | Arrow illumination |
|---|---|---|
| Melodic note play, Chord Play, Joint Play | Shift pad position | Dim if available, bright while pressed, off at the limit |
| Grid Sequencer | Move through time pages | Reflect available time pages |
| Clips | Change track bank | Reflect available banks |
| Held-step editing / step recording | Existing nudge / tie / rest gestures | Existing editing feedback |
| Modal chord/motif review | Modal owns input | Off |

Tonic coloring and approach targets use the shifted map. Position-dependent
playback feedback is refreshed on the normal bounded polling cadence. Moving
the pattern while holding notes preserves their onset pitches and pressure;
release closes those same notes. The next press uses the new position. Changing
the target track still releases notes owned by the previous target.

Requires HarmonyBus 0.2.303, unchanged from Movy .268. Update Movy through
`douglasmason/harmonybus-movy` in Schwung's repository installer, then restart.

Verification covers all keyboard layouts, available scale cardinalities and keys,
input priority, both arrow limits and pressed brightness, key changes, approach
alignment, Move/Joint/Launchpad mapping, session persistence, and production-chain
sustained-note ownership. TypeScript, browser logic/UI, native DSP/sequencer,
device startup and ARM package checks run before publication. Physical button
feel, LED appearance and listening on Move still require device testing.
