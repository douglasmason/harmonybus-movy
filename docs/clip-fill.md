# Clip Fill — Movy 0.34.1-hbclean.248

Requires HarmonyBus 0.2.294. Clips Setup knob 5 opens Fill. Existing clips are the sources: nothing has to be saved into a library. Source clips may be stopped, muted or in another bank. Back, jog or knob 8 exits Fill; leaving Clips disarms it.

| Knob | Selection |
| --- | --- |
| 1 / 2 | Pitch source track / clip |
| 3 / 4 | Rhythm source track / clip |
| 5 | Target length, 1–16 bars |
| 6 | Sequential pitch groups / Fit pitch phrase to target window |
| 7 | Own content / Keep existing Source Weaving |
| 8 | Exit |

Turning a source control or touching a knob shows a temporary note preview. The grid remains the destination: press a pad to **replace** that clip. The actual configured row and bank determine its track. Successful native acknowledgement shows the destination and updates occupancy; failed edits cannot claim success. This does not start transport, launch the destination or change clip selection. Existing playing destination content is replaced with its gates released and loop restarted. One Undo restores the clip and routing.

Rhythm repeats at its authored rate to the target duration; the final gate is clipped to the end. Fit changes pitch phrase selection, not rhythm tempo. Simultaneous pitch notes remain a chord group. Rhythm attacks at the same tick are combined with maximum gate and accent; drums can supply this union of hits. Pitch source input keys, register and per-note operations are preserved, velocity comes from rhythm, and pressure is not extracted. The preview displays up to 64 source notes and reports the full count. It is not an audition or a prediction of voiced HarmonyBus output.

The first increment targets melodic follower destinations with Relative or Closest Split mapping. Pitch material must have saved input-key identity and cannot be rendered/raw output. Source rendering recipes are retained where present; otherwise the destination's mapped settings are used. A conductor or drum destination is rejected. Rhythm quantization/speed overrides, rhythm conditions and live rhythm operations, and pitch shared/interval operations are rejected rather than silently baked incorrectly. Instrument automation, expression timelines, drum-lane selection, built-in choices and generators are not yet extracted. Existing clips with ordinary source notes, including the stock bass/comp entries, are supported.

Live weaving remains Joint Play actor Sources routing; it reads playing sources and follows later edits. Fill is an edit-time composition of authored contents. Preview and commit use the same native builder and shared weaving pitch-onset selector. Source edits invalidate the old preview; touch a knob to refresh. The composer runs only for explicit previews/writes. Drawing and idle ticks perform no source IPC and no new playback scheduler is added.

Validation includes stopped clips, nonzero loop origins, simultaneous voices, Sequential/Fit selection, repeat boundaries, semantic input/actions, stale-source and destination rejection, capacity limits, recording guards, Set restore, Undo with weaving, ordinary scheduler note ownership, shared UI dispatch and framebuffer rendering. Physical Move testing remains required.
