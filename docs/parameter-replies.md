# Queued Chord Play parameter replies (.317)

Movy now forwards `chN:midi_fx1:*` reads using the incoming C-string key,
the chain's existing 128-KiB scratch buffer, and the caller's output buffer.
It removes the temporary key, owned reply, and final C-string allocation
from this forwarding path. Other parameter families retain their existing
dispatch; their final copy also no longer constructs a redundant C string.

Schwung's pinned `plugin_api_v1.h` documents that parameter getters execute
on its SCHED_FIFO 70 SPI audio callback. Avoiding temporary heap work there
is useful even though these are display/control reads.

This change adds no polling, caching, queue engine, or new queue limit.
HarmonyBus remains at 0.2.311. The .316 microphone session-isolation and
realtime-status changes are retained. Native and UI engine identifiers
advance together to force the normal reload of an older DSP.

## Compatibility

Each forwarded read calls the native getter exactly once, with the same
scratch capacity as before. This matters for getters that consume events.
Successful replies retain their byte count and NUL terminator. Invalid UTF-8
uses the same replacement characters as the old lossy conversion. Embedded
NULs, invalid native lengths, and insufficient output space return failure
without writing a partial reply. Invalid/null output buffers fail immediately.
An oversized native reply is refused without the old allocating log message.

Mix, send, LFO aliases, state, and other Movy-owned getters retain their
dispatch and side effects for valid buffers. Native getters can still
allocate internally; Movy's overall status getter still builds strings.
The zero-allocation result applies to this forwarding layer only.

## Verification

The frozen-reference tests compare replies, errors, canaries, changing
responses, all 65,536 two-byte combinations, malformed longer UTF-8, and
the scratch-buffer boundary. Allocation tests cover short and long replies,
invalid text, embedded NULs, and insufficient output capacity. Real-chain
tests cover exact-sized replies, invalid buffers, both queue formats,
128 bars of four-chord playback with repeated feedback reads, 64-chord
playback, Hold refill, replay, and balanced MIDI releases.

One local optimized desktop run with a mock native getter measured:

| Reply | Reads | Bridge allocations before → after | ns/read before → after |
| --- | ---: | ---: | ---: |
| Short queue | 100,000 | 300,000 → 0 | 381 → 207 |
| 64-pad-sized payload | 100,000 | 300,000 → 0 | 3,979 → 1,887 |

Timing is runner-dependent and excludes real native getter work, audio,
USB traffic, and device scheduling. The release includes its own benchmark
output, alongside the native/browser checks, production-chain checks on
Schwung 1.7.3 and 1.8.2, and the ARM64/glibc compatibility build.

This is a measured reduction in callback overhead, not a verified fix for
physical Move crackles or missed transitions. The next hardware check is a
long Queued Chord Play loop with visible feedback, comparing it with the
previous build while checking every transition and audio continuity.
