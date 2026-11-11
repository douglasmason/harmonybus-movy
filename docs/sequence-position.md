# Movy hbclean.341 — LFO and Field sequence positions

Numeric automation can now use a position chosen by an existing LFO or shared Perlin Field. **Instrument Position** and **HB Render Position** are independent, saved per actor, and default to **Clock**. The existing **Step / Linear** read choices still apply independently.

## Set up a moving curve

1. Record or place numeric automation locks in the actor's clip, such as cutoff at two different steps.
2. In that actor's **Source Automation** panel, choose **Instrument Read: Linear**.
3. Open its **Sequence Position** panel and choose **Input 1**.
4. Set the existing LFO's target to that actor's HarmonyBus instance, **Sequence Input 1**. Leave the input's base at 0.5 and choose bipolar/full depth to sweep the whole sequence. Triangle scans forward and backward; sine slows near the ends. Existing LFO sync/rate/depth controls apply.
5. Play the clip. The automation curve moves under the held notes without creating extra note attacks.

For Perlin, choose **Field 1** through **Field 16** directly as the reader's position. Field Play's existing output strips can take over that channel: use Move or Launchpad pads/pressure, knob offsets, or Remote UI. Hold/latch/release retain their existing Field behavior. Launchpad Mini uses pad position without pressure; Launchpad X adds pressure. Field terrain gestures move the same underlying Field.

Native Move, Remote UI and standalone share the Source panel metadata, setters, Undo path and engine readers. HB's two input controls also appear in its shared **Sequence Position Inputs** panel. This adds no separate browser sequencer or oscillator.

## Position and boundaries

Position 0 selects the first step of the selected clip's loop; 1 selects its last step. Driven Linear reads hold the first/last sparse point outside the populated portion of that window, rather than wrapping from the last point to the first. Intermediate positions interpolate neighboring points. Step reads hold values as usual. Clock retains its existing loop wrap behavior.

Own clips work with Source Weaving off. When borrowing automation, the chosen position scans the donor's loop. If the donor is unavailable or muted, it scans the destination's Own clip instead. A missing, bypassed or unloaded local input falls back to Clock; a Field driver falls back if no active HB instance supplies the shared snapshot. Recording the destination uses its ordinary recording path. Stop and mute restore the destination's base through the existing automation owner.

Inputs are observed together before advancing any track, at most about 100 times per second, using fixed buffers. Reads don't advance an LFO or Field. The reader runs on the existing 96 PPQN clock and emits existing 7-bit automation values; this is not audio-rate interpolation. Actual smoothness also depends on the receiving instrument. Driver selections save and Undo with the route; observed positions are transient.

Only confirmed numeric instrument targets and the existing numeric HB Render targets (velocity percentage, arp gate and strum spread) use these positions. Enums and musical choices retain their clocked behavior. Pitch glide, MPE output, signed-speed drivers, Smooth interpolation and separate slew controls remain future work. The precise Remote UI cloud X/Y and optional MPE input shipped in hbclean.340 remain available.

## Verification

Coverage includes independent drivers/read modes, fractional values, loop endpoints, donor fallback, recording, mute/stop, persistence, malformed observations, UI reachability/Undo setters, existing native/Remote/Launchpad Field controls, and actual Movy → stock Schwung chain → HB → instrument output with an LFO and Field overrides. Device packaging is checked in CI; physical hardware is not exercised by these tests.
