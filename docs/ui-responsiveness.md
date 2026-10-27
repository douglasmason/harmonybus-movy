# UI responsiveness — Movy 0.34.1-hbclean.277

This release removes redundant synchronous host reads during performance. It
includes the temporary Comp Generator from 276 and keeps the same HarmonyBus
0.2.307 and Schwung pins.

## Changes

- User and named operation lights share each successful or failed read across
  painters for 50 ms. A transient failure keeps the last accepted frame and
  retries at the next interval. An initially unavailable user-light response no
  longer stays unavailable for the whole session. Gestures invalidate feedback
  immediately, and a valid inactive response still retires a completed clip action.
- Approach feedback uses the existing bulk parameter channel: status, release,
  key center, parallel mode, latch, sequence and row labels travel together. The
  batch also includes the legacy key-center field. A failed supported bulk read
  does not fan out into individual reads. Hosts without bulk IPC retain the
  compatibility path. Missing fields retain their last accepted display.
- Chord Play, Settings, Joint, Field and Grid skip value polling for the hidden
  underlying parameter bank. Module detection, pending edits, metadata retries,
  and model lifecycle processing continue. Ordinary controls resume polling on
  mode exit; their existing automation and LED values remain supported.
- Set Parameters retains knob ownership while performance modes continue
  playing. Returning to Joint retries budget-limited knob LEDs through normal
  feedback, without requiring a hidden bank to trigger screen redraws.
- Field and Grid use their own pad previews without also polling the ordinary
  melody preview. Normal and Chord Play retain their melody-pad feedback.

## Verification and measured scope

The regression tests call production painters, adapters and the app loop with
mocked host data and a controlled clock. These are request counts, not measured
Move latency or an audio crackle result.

| Work over 100 ticks / one simulated second | Before | After |
| --- | ---: | ---: |
| Failed named-light reads, two painters per tick | 200 | 20 |
| Approach feedback with current key-center status | 140 individual reads | 20 batches |
| Hidden parameter-bank value polls on performance screens | Continues | Paused |
| Ordinary melody previews while Field owns pads | 20 | 0 |

`hb-feedback-polling.mjs` covers recovery, retained frames, clock rewind,
immediate gesture invalidation, separate owners, clip-action retirement,
owner handoff, real bulk-wire failures and legacy-host fallback.
`hb-ui-responsiveness.mjs` exercises all six mode transitions through the actual
app tick, confirms preview ownership, and checks pending model edits, module
changes and resumed polling. Existing musical, recording, navigation and
persistence regressions continue to run in release verification.

Autosave serialization, synchronous verified disk writes, external-surface
preview cadence and host callback waits remain separate investigation targets.
This release does not alter recording delivery, autosave behavior or native
note ownership. Install normally through Schwung Manager; no host update is
required, and no physical-device deployment is performed by this release job.
