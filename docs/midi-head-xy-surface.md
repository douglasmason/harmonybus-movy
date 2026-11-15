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

## Physical Move / Launchpad XY layout (Movy hbclean.364)

The exact same shared Field outputs now have an **opt-in XY pad layout**
on both physical controllers. Field Play's old strips are still the default,
so existing Sets and memorized mappings never change unexpectedly.

1. In **Field Play**, set **Field Display → Outputs** if needed. Tap **Loop**
   to switch the pad plane between **Strips** and **XY**. Loop lights brightly
   while XY is selected and dims in Strips. Its contextual Remote UI button
   descriptor shows the same meaning. This does not activate the Loop editor.
2. In **XY**, the physical 8×4 Move or 8×8 Launchpad X pad grid spans X
   left-to-right and Y bottom-to-top. The first held finger controls both
   outputs; a second held finger controls Y independently. Release the
   second to return Y to the first. The same normal/latch policy is used.
3. **Pressure** on the current Y finger fine-tunes Y within half a pad row,
   anchored on the first aftertouch message so pressing does not jump.
   Move's four rows have coarse position until pressure/knobs refine it;
   Launchpad X has eight rows. Launchpad Mini works by grid position without
   pressure.
4. **K1/K2** retain their existing fine output control of the first two
   channels in the selected bank; **Jog** still changes the bank. Bank 1
   controls **Field 1 (X)** and **Field 2 (Y)**; bank 2 controls Field 5/6,
   then 9/10 and 13/14. Change the actor's Head Position settings to match
   these Field channels when using a different bank.
5. Hold **X + pad** (or the Launchpad modifier + pad) to clear **just the
   two XY channels** in the active bank. Shift+Back and the modifier's
   existing Release All control retain their normal all-output behavior.
6. The physical LED grid draws a cyan crosshair and green live touches
   with short blue trails on Launchpad X. Move uses its existing green
   palette as a best-effort approximation.

The physical layout switch is deliberately transient; it resets to Strips
after leaving Field Play, and it does not overwrite the saved Field Display,
output bank, operation assignments or the independently saved Event Heads
driver choices. Mode/track/source disconnect and lane clear cancel active
XY touches **without creating a latch**. Ordinary last-touch release
commits both output leases only when the underlying Field DSP is in Latch.

Move, Launchpad X, Remote UI, and the browser studio all feed exactly the
same Field output channels to the live MIDI-head reader. Pads add no
new note triggers or realtime schedulers. The next accepted rhythm-donor
attack decides when the moved heads emit musical content.

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
