# Launchpad crackle and missed-input investigation

## Device evidence, 2026-10-06

Both captures used Movy hbclean.185 and lasted 35 seconds. The user clarified
that the first used Launchpad Off and the second X. X audibly crackled more.
The user subsequently reported missed fast repeated **Move** pad hits with X
enabled. These are observations, not reproduced hardware failures in CI.

| Measurement | Off | X |
| --- | ---: | ---: |
| Maximum callback-start interval, µs | 4381 | 4427 |
| Nominal block period, µs | 2902 | 2902 |
| Intervals above 1.5 periods | 2 | 5 |
| Late groups / largest group | 2 / 1 | 4 / 2 |
| Peak render work, µs | 1683 | 1627 |
| Render work overruns | 0 | 0 |
| Previous render at maximum gap, µs | 1521 | 1223 |
| Request work in that interval, µs | 1168 | 1408 |
| Largest request in that interval | T4/FX1:pad-view | T4/FX1:surface-view0 |
| Generated tone PCM mismatches | 0 | 0 |

Small samples and different uncontrolled device workloads preclude a causal
rate estimate. Five late intervals are not five crackles. The generated PCM
oracle cannot detect downstream replay/loss or certify native Move instrument
audio. The user has not isolated the audible diagnostic tone from other audio.

## Code trace

Launchpad polls one 32-pad bank every 50 ms. Each `surface_viewN` delegates
to the production `pad_view`/`pad_render`, temporarily installing the external
geometry and restoring it afterward. The recursion is bounded: surface view
to pad view to pad render. A follower preview may also call its renderer once
more for expanded output groups, with the recursive mode disabled.

In the inspected Schwung source, parameter service and audio work share the
SPI processing path. Movy's request profiling is outside its `render` timer.
Thus a sub-budget render does not establish that the entire host audio cycle
has enough time. This is source evidence for a mechanism, not proof that any
particular gap caused a hardware underrun. No Schwung code was changed.

Move pads already have a native audio-thread route into Movy; they do not
normally depend on Launchpad's UI event queue. Missing Move hits therefore
warrant checking native ingress, HarmonyBus output/injection and downstream
delivery, not merely changing the Launchpad input queue timeout.

Launchpad LED sends already retain failed frames and pace against the host's
default three-packet drain. This bounds application retries; it does not prove
the host/firmware queues cannot lose traffic. Full X RGB frames are long SysEx
messages. LED transport and synchronous preview work remain separate suspects.

## Tested, limited optimization

The branch shares a successful Move snapshot with Launchpad only when the set,
track and complete geometry (notes, approach targets/rows and spatial mode)
match and it is younger than the existing 50 ms Move polling period. Frozen,
failed, clock-rollback, expired and unacknowledged-geometry cases fall back to
normal native acquisition. Native geometry registration and input routing are
unchanged. No cache is retained in HarmonyBus and no alternate mapper is added.

Triple Approach's lower 32 pads match Move. Other layouts center Move across
two external banks, so this change does **not** eliminate their partially
overlapping work. For eligible fresh reads the regression verifies one omitted
native lower-bank request; the upper-bank request remains. This is not a claim
of a measured device speedup, lower worst-case request latency, or a crackle fix.

Local validation: clean upstream integration application, browser build,
TypeScript check and the Launchpad/diagnostic suite passed, including ordered
repeated note edges, failed-write retries, pressure ownership, teardown,
preview freeze and the new sharing guards. Hardware missed hits and audio
crackling have not been reproduced or fixed by these tests.

Do not require another install/photo cycle solely for this limited change.
The next substantial fix needs to reduce the worst uninterrupted preview work
or demonstrate an event/transport loss. Avoid treating a lower average CPU
percentage as sufficient evidence.
