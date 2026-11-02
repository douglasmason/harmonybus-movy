# Mode-specific Move button ownership and first-entry guides

This is the **first implemented increment** of context-sensitive hardware
buttons. It uses Movy's existing `seq/led-cache.ts`, button-held color
promotion, and 40-packet budget. There are no competing LED writers or
second framebuffer renderers.

## Controls

| Physical button | CC | LED | Global behavior | Implemented special behavior |
|---|---:|---|---|---|
| Capture | 52 | White | Retrospective capture | Always global, unchanged |
| Shift | 49 | White | Modifier | Always global, unchanged |
| Undo/Redo | 56 | White | Undo / Shift+Undo | Always global, unchanged |
| Play | 85 | RGB | Transport | Always global, unchanged |
| Record | 86 | RGB | Recording | Always global, unchanged |
| X / Delete | 119 | White | Delete clip/step | **Chord Play** and **Joint's chord knobs**: Harmony Off (existing native cancel), including releases |
| Loop | 58 | White | Clip bar Loop | **Queued Chord Play** and **Joint's queued chord knobs**: toggle native `chord_queue_end` between Hold and Loop |
| Copy | 60 | White | Stock clip/step clipboard | **Shift+Copy** reopens control guide in special modes; unmodified Copy stays stock |
| Mute | 88 | White | Track mute/solo | Still stock; true accompaniment-only bypass needs its own native owner |
| Sampling | 118 | RGB | Stock sampling | Still stock; scale microphone listening requires a verified audio route |

These assignments are **mode-scoped**. Normal Play, Clips, Grid, Motif Play,
Field Play, and Scale Finding retain existing normal button behavior except
for Shift+Copy's read-only guide in the modes which offer one. Within Chord
Play, Shift+X continues to pass through to the original modified command,
while a plain X press invokes the existing `harmonyOff()`; the corresponding
release is consumed so it cannot also delete a clip. The universal K8 Off
remains available until a later UI revision deliberately reallocates it.
This keeps us from accidentally stranding users who learned K8.

**Loop white LED**: bright means the native queued progression is configured
to repeat, dim means Hold. Reading it uses the Chord controller's already
cached queue snapshot or its last accepted parameter gesture; the LED painter
never polls host parameters. Loop touches update the native queue setting
only on a press edge. On other modes, the LED retains its ordinary bar-Loop
meaning.

**X white LED**: dim means the context-specific clear gesture is available;
physical button-held promotion turns it bright during the press. It is not
permanently bright just because harmony exists: that would misleadingly
suggest clearing is currently engaged.

Copy remains a real clipboard button. **Queue-to-Clip is not implemented**
by this patch; it must not light up as a fake commit target or write MIDI notes
as a substitute for an abstract clip transaction. See
`docs/queued-chord-lifecycle-and-promotion.md` on the queued-chord PR.

## Guide

On the first explicit entry into Motif, Joint, Grid, Field, Chord or Scale
Finding, display the relevant control summary for about 2.6 seconds on the
existing 128×64 display. No input is blocked. Any first note/button gesture
dismisses it, and expiration restores the underlying view once. The guide
does not replace the Mode selector or the capture/leave modals.

**Shift+Copy** reopens it without arming the clipboard, and the Copy release
is claimed even if Shift comes up first. Other modes keep their own
Shift+Copy semantics.

The guide describes only implemented actions. No Copy-to-Clip, live
microphone monitor, or piano-scale latch is advertised as working yet.
In the future Piano/Inline selection should stay *inside* Scale Finding
with one common shared-key commit path and the native scale catalog.

## Next scope, deliberately separate

- One native, transactional, semantic Queue-to-Clip writer plus phase-safe
  conductor handoff, then Copy may own that destination picker.
- Scale Finding's Piano/Inline input layouts; latching, candidate scoring,
  tonic designation, and actual audible audition with note release.
- Microphone input/sampler mode lifecycle and RGB Sampling LED.
- True accompaniment-only Mute, independent of track mixer mute, and
  contextual Grid/Field Copy/Delete functions. These should be added
  only when their data owners support undo and safe clearing.

## Tests

`hb-mode-buttons.mjs` asserts the existing Chord MIDI and queue owners,
Loop's native configuration, X's consume-on-release behavior, the
generic Copy/Mute/Sampling/Undo/Capture/transport pass-through, Shift
modifiers, no new native polling in LED painting, guide reentry and
expiry, and normal-mode ownership restoration. The full release CI
must validate the patched production controller and the browser adapter.
