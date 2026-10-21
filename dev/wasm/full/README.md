# Full production host in WebAssembly

This increment links **Movy DSP, Schwung chain host, HB, and the deterministic
PCM probe fixture, plus NuSaw** into one browser module. Movy's production dispatch owns
operations, recording, routing, note ownership and serialization. The earlier
note-only bridge remains a small compiler test, not the architecture for Joint.

## Same Joint UI, two transports

The existing `dev/local/joint.html`, `joint.mjs`, production Movy Joint controller,
and Schwung parameter pages are shared. `joint-connection.mjs` selects:

- Native server `/joint`: the existing WebSocket transport.
- Static server `/joint?engine=wasm`: worker-owned compiled engine via an adapter
  using the same parameter/update messages. No WebSocket or native process.

This reuses the Joint performance view; full Schwung Manager and the other
remote routes have not been connected to the browser engine.

After building native assets as documented in `dev/local/README.md`, activate
Emscripten 4.0.10 and install both Rust targets:

```sh
rustup target add wasm32-unknown-unknown wasm32-unknown-emscripten
bash dev/wasm/prepare.sh
node --test dev/wasm/test.mjs dev/wasm/full/test.mjs
node dev/wasm/browser-test.mjs
node dev/wasm/full/browser-test.mjs
node dev/wasm/full/audio-browser-test.mjs
node dev/wasm/serve.mjs
```

Open http://127.0.0.1:7702/joint?engine=wasm. All processing stays in the browser;
the server only delivers static files. The automated browser test switches
networking off after the page loads. There is no service-worker/offline-install
feature yet, so this does not promise an offline reload.

## Port boundary

`build.sh` copies source into disposable build directories. `port.mjs` verifies
exact anchors before adapting host-specific code. Original checkouts and device
builds are unchanged.

- Rust is built as an Emscripten static library with `panic=abort`. A panic/trap
  invalidates this experimental session; it is not recoverable native unwind.
- Movy uses its **existing serial render path** without spawning its render
  pool. Its normal module load queue and dispatch still run.
- `dlopen/dlsym/dlclose` resolve a fixed registry containing chain host, HB and
  probe and NuSaw. Entry points are renamed at compilation to avoid symbol collisions.
  Unknown modules/symbols fail. This is not arbitrary plugin loading.
- C and Rust share one memory and function table. Startup compares host/API
  structure sizes and offsets before using callbacks. Schwung's hardware-only
  reserved-tail assertion retains 120 on 64-bit and checks 68 on wasm32.
- HB global settings use the same per-module in-memory mapping adapter as the
  small slice; the physical monitor mapping remains absent.
- A virtual filesystem embeds production HB metadata and probe metadata.
  Placeholder DSP files satisfy production discovery/copy checks; registry
  entries, never those file bytes, supply the compiled modules.
- glibc heap trimming and Linux worker scheduling/affinity are omitted.
  Audio FX/send-worker modules are not in the registry and are not supported.

No musical behavior is replaced by JS. `full/engine.mjs` wraps set/get/MIDI/block
calls. `joint-transport.mjs` forwards ordered messages to a dedicated module Worker.
`joint-service.mjs` retains the protocol, clock and cleanup adapter in that worker;
parameter policy/metadata are shared with the native server.

## Verified scope

The differential test compares **the existing dynamic native host** against the
full Wasm host, including exact final MIDI packets, HB state strings, saved Movy
clip state, harmony changes, scoped operation messages, physical Joint recording
and recorded-source replay. It requires real recorded notes/replayed output.

The browser test uses the shared Joint page offline, checks that no WebSocket
opens, verifies 16 loaded HB instances, root/bass follow, pad releases, Play/Stop,
count-in recording, recorded replay, actor knob edits, quartet switching, blur
release and phone-width layout. Existing native/API and browser suites are still
gates. This is not exhaustive parity for every operation or instrument.

## Audio ownership and limits

One dedicated Web Worker owns the complete compiled host. The same Joint UI uses
an oscillator MIDI monitor for native connections and **actual NuSaw PCM** for
browser-only connections. NuSaw is compiled from
`charlesvestal/schwung-nusaw` at `e3787739dfc099afe2eb447bab498d875afd8136`.
Its DSP is unchanged; the disposable build replaces its embedded legacy API
struct declarations with the pinned Schwung header. Its MIT license is included
in the static package. No sample library or instrument download is needed.

The browser fixture loads NuSaw on all 16 tracks. Chorus/delay are disabled for
this first slice. Actor volume/mute controls use the existing chain mix controls
for all four quartets. The differential fixture retains the deterministic probe
so native/Wasm MIDI and saved-state comparisons stay comparable. NuSaw is not a
Move instrument and does not reproduce Move sounds.

When audio is disabled, the existing bounded wall-clock timer advances the host.
When enabled, the timer only publishes snapshots and checks stream health;
**AudioWorklet consumption alone requests further rendering**. A transferred
MessagePort connects worker and worklet directly, bypassing the page thread.
The worklet requests 1,024-frame stereo batches, holds at most 2,048 frames
(about 46 ms at 44.1 kHz), and outputs silence on underrun. This buffer trades
latency for tolerance to worker scheduling; it does not guarantee glitch-free
performance under load. There is no SharedArrayBuffer or cross-origin isolation
requirement. The worklet contains only PCM output/buffering, no musical engine.

Compiled engines require 44.1 kHz. AudioContext requests that rate and rejects
an unexpected rate rather than silently changing pitch or tempo. Processing uses
the callback's actual output frame count. Enable audio through the button; an
HTTPS origin (or localhost) is required. Audio enable/disable stops transport and
releases input for a clean clock handoff. Stop flushes queued buffers with a new
stream generation and invokes the synth's existing all-notes-off operation.
Blur, hiding, suspension and disconnect disable listening and clean up. Streams
without pulls time out. Re-enabling works offline after the initial page load:
the worklet source is retained and loaded through a temporary Blob URL. A strict
hosting CSP must permit that audio-worklet Blob module.

Commands cross an ordered message boundary; periodic snapshots are coalesced,
while explicit replies are preserved. MIDI history remains bounded to 256 events.
Development reads (`__wasmRead`) are asynchronous. `__joint.monitor.stats` reports
consumed PCM frames, underrun frames (including startup), peak and queued frames.

Tests verify real nonzero NuSaw PCM, silence after panic, native musical parity,
and a Chromium AudioWorklet playing offline through a 900 ms UI-thread stall.
Engine advancement is compared with the audio clock to catch double stepping.
They also verify Stop silence, context suspension, offline re-enable and blur
cleanup. A fault-injection test verifies bounded buffering, underrun silence and
rejection of stale PCM after Stop. This is not physical listening verification,
exhaustive synth parity or validation of Move hardware deadlines/crackles.

## Static package and next step

After building, run `node dev/wasm/package.mjs`. The output in
`dev/wasm/build/site` contains only static assets and opens Joint by default. Serve
that directory at an HTTPS origin root (not a subdirectory), with JavaScript and
`application/wasm` MIME types. No API, native processor, shared-memory headers or
runtime downloads are required. CI tests the copied package and uploads it as
`browser-joint-static`. Nothing is deployed automatically. This is ready for a
hosting trial, not a claim of tested iPad compatibility or offline reload support.

Next: host the static package for a physical iPad Safari trial covering latency,
sustained polyphony, interruptions, backgrounding and audio restart. Session
save/open, full Manager integration and service-worker caching remain pending.
