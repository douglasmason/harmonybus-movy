# Movy 0.34.1-hbclean.304 — cancel surfaces before retrying input

Disabling a Launchpad profile, changing profiles or parking Movy previously
retried pending notes before checking the lifecycle change. A busy host caused
an early return, leaving the old channel claim and momentary controls active.
When the host recovered, stale note-ons could play before cancellation. A large
accepted backlog had the same ordering problem because the bounded queue
reports incomplete until every batch is drained.

The existing adapter now cancels first. Its source-local release fence drops
old Launchpad events, preserves other controllers' queued events and retries
with the same serial until acknowledged. Controls and channel claims are
released even when the input transport is busy. A newly selected profile can
then accept new input behind that fence. The outgoing profile cannot start
another operation between a setting change and the next lifecycle tick.

Teardown returns the existing drain result, so the tick does not perform a
second shared transport wait. This uses the same queue, host callbacks and
native ownership ledger. Field Play retains its existing release hook. No
host version branch, additional queue, polling loop or musical representation
is introduced.

The regression fails on the prior code with a note batch where a cancellation
fence should be. It covers original Launchpad, X and Mini MK3 through Off,
parking and profile changes; repeated busy responses; stable fence identity;
other-controller preservation; a 64-event unattempted backlog; and direct
MIDI cleanup when the optional blocking API was unavailable at note onset.
The complete surface suite, both Schwung host matrices, native/browser/WASM
checks, QuickJS startup and ARM packaging remain release checks.

Schwung 1.8.2's external-MIDI held-step fix protects host button bookkeeping;
it does not order Movy's queued surface events. This adaptation also applies
to 1.7.3. An unresponsive host can still delay acknowledgement of native
note release; the change prevents stale retries from taking priority over it.
It does not claim to fix measured crackling or end-to-end latency. No physical
Move installation, upgrade, browser connection or trial-audience change occurs.
