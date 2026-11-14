# MIDI event heads — shared 2D XY surface

HarmonyBus 0.2.328 adds a dedicated **MIDI event heads · X / Y** touch
surface to the existing Field Outputs Remote UI. Movy's browser studio
reuses that *exact* component and shared CSS/handlers; it has no competing
controller, timebase, synth or MIDI emitter.

## Playing the sparse source

1. In Movy Joint Play → Sources, choose an existing sparse MIDI source clip
   and an independent rhythm donor. Enable **Source Weaving** and select
   **Event Heads** alignment.
2. In Joint Play → MIDI Event Heads, choose **Field 1** for Head 1 Position
   and **Field 2** for Head 2 Position, with Single, Reverse, PingPong or
   dual-Forward playback as desired.
3. Open **HarmonyBus → Field Outputs** in Schwung Remote UI or the
   **Field outputs** panel in the browser studio (enlarge it for room).
   The common XY pad defaults to Field 1 horizontally and Field 2 vertically.
4. Drag one finger to move both read positions. Add a second finger to move
   the Y head independently. The crosshair indicates the current effective
   X/Y positions and a cyan trace shows the active gesture.
5. The existing rhythm donor decides when the heads emit new MIDI.
   Ordinary note gates, voice ownership, conductor/follower mapping,
   native Move instruments and source clip storage remain unchanged.

The editor's Field selectors can address any two *different* channels
1–16. Selecting Field channels here does **not** reconfigure the actor's
Head Position routes. Match the two choices in Joint Play manually.
Source clips containing one onset or one chord remain valid because
the position controls index source event groups rather than empty beats.

The same normalized output state is available from native Move/Launchpad
**Field Play → Outputs** as individual strips. This increment does not
silently replace those pad mappings with an incompatible XY layout.
A physical two-dimensional pad page is a later independent extension.

## Gesture and cancellation rules

- First finger controls both axes; second finger controls Y alone.
- Releasing the last finger returns both channels to their Perlin Field
  values in Momentary, or commits both to the existing DSP Latch policy.
- A canceled pointer, blur, page hide, changing tracks/views, losing
  connection or Release all cannot start a new latch.
- Active single-lane slider and XY touches cannot both own the same
  output. The XY control refuses duplicate X/Y channel assignments.
- Keyboard arrow keys work in the focused XY pad; Shift enables fine steps.
- A browser without measured force provides X/Y position only. Existing
  Move and Launchpad X pressure-sensitive Field strips remain unchanged.

This uses `field_outputs_remote` and `field_output_finish` only, so
there are no new engine commands, not another clock, and no extra
real-time audio computations. A WebAssembly browser run and a native
processor receive exactly the same control frames.

## Deferred work and checks

The remote surface **does not yet record gesture automation** or perform
automatic live-recipe → baked clip parity. It doesn't produce interpolated
MPE pitch-bend audio, nor generate connector notes between sparse anchors.
Add those as normal source/operation/recording features, not bespoke UI
state. Physical Move/Launchpad latency, output lag and crackle still
require an on-device audition.

The HarmonyBus web-component tests verify two-finger ownership, exact
normalized values, latch/cancel/escape and isolation. Movy's native Remote
UI and compiled WebAssembly workspace regression tests assert that one XY
gesture latches both channels through real Field DSP and Release all
clears them. This does not constitute a physical Move test.
