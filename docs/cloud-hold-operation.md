# Cloud Hold as an operation

Assign **Cloud Hold** to a shared operation slot, then use its existing knob,
step-button, Launchpad, or Remote UI gesture. Start Cloud exploration on that
same track first; the operation does not choose a recipe or start transport.

- Hold the operation control to capture the current cloud momentarily.
- Tap to arm the next cloud stroke. It remains active while cloud contacts
  overlap, and completes when the last contact releases or expires.
- Use the existing persistent-latch gesture to retain the captured cloud across
  strokes; switch that operation off to release its ownership.

MIDI notes do not start or complete this operation. Multiple cloud contacts
share one stroke boundary. A Down/Up pair within one audio block still consumes
an armed one-shot, without leaving it armed for an unrelated later stroke.

Manual Cloud Hold and the operation independently own the same capture. Turning
one off preserves the other, including precise X/Y offsets and wrap settings.
The existing manual Hold button is not an off switch for a latched operation.
Clear, Stop, generator cancellation and Set loading cancel transient operation
state; stale movement packets cannot resurrect it. Bypassing the track's
HarmonyBus cancels the operation and preserves an independent manual capture.

Remote UI retains 14-bit X/Y contacts and direct cloud dragging. Move and
Launchpad retain their existing pad geometry and pressure input. No new tap or
latch detector is added on any surface. Cloud Hold is a gate, not a pressure
amount; pressure continues to shape the cloud using its selected mapping.

The adapter requires Movy's `movy-clip-v4` capability. Older hosts hide the
choice unless it is already assigned, and cannot activate it. Auto is disabled:
this is a deliberate performance operation, not an always-running generator.
Assignments persist; activation, captured emitters and ownership do not.

The DSP bridge uses bounded contact-edge masks and fixed ABI buffers. It reads
only active/recently active cloud tracks and observes shared operation state
without advancing a second sequencer. Captured points remain cloud-engine state.

Validation covers native gesture/input isolation, manual/operation ownership,
short strokes, contact expiry, cancellation, production-chain integration,
precise movement and the compiled browser engine. Physical Move/Launchpad
validation remains a device check.
