# Drum Fill performance — Movy 0.34.1-hbclean.254

**Clip Fill** creates or edits stored clip contents. **Drum Fill** is a one-shot
performance, optionally captured by ordinary recording.

On a drum track, open Clip Parameters (Shift + Step 3). Knob 3, previously the
unavailable Transpose control, is now **FILL**: touch it once while its clip is
playing. Knob 5 selects the grid, knob 6 selects Last Beat / Last 2 Beats / Last
Bar, knob 7 selects the MIDI drum note (or select a drum pad), and knob 8 selects
velocity. The same action is available on tracks configured as Drum Ch 1 output.
No General MIDI kit assignment is assumed.

The fill takes over only that drum lane for the selected tail of the current
loop and ends at the loop boundary. Pressing during the tail joins its remaining
grid attacks. Other drum lanes continue. Repeated touches replace the pending
request; holding a knob does not keep scheduling fills. Stop, clip launch and
loop changes cancel it. It uses the clip's clock and swing, with ordinary note
ownership and paired releases. The background groove is never swapped out.

With Record off, stored clips and Undo remain unchanged. With Record active for
this drum track, the performed attacks and elapsed lane replacements are saved
as editable drum notes under the existing recording-pass Undo. Turning Record
off mid-fill stops capture while the temporary performance finishes. Recording
another track does not capture this fill. Saved notes replay through normal
clip trigger conditions. Muted or section-resting tracks do not emit or capture
the gesture. The selected drum's original attacks in the fill window are replaced;
other lanes and independent automation remain intact.

The existing stopped wheel-click operation still writes an undoable drum-tail
edit. It shares the fill pattern and settings with the performer but does not
become a live trigger. This release exposes the performer on the drum clip panel;
it does not add an assignable HarmonyBus operation lane.

Native tests cover temporary playback, normal groove return, lane isolation,
Record on/off, recording another track, Undo/save, swing, loop changes, invalid
requests, capacity and Stop. UI checks cover the touch edge, no performance Undo,
recording and external drum routing. The production DSP fixture checks MIDI
channel/pitch/velocity, balanced releases and no permanent fill after stopping.
The actual device bundle must also pass QuickJS startup before publication.
HarmonyBus remains 0.2.295; physical Move testing is still required.
