# Full production host in WebAssembly

This increment links **Movy DSP, Schwung chain host, HB, and the deterministic
PCM probe fixture** into one browser module. Movy's production dispatch owns
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
  probe. Entry points are renamed at compilation to avoid symbol collisions.
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

## Limits / next step

One dedicated Web Worker owns the complete compiled host and its bounded wall-clock
scheduler. The page owns UI and the optional MIDI monitor. Commands cross an ordered
message boundary; periodic snapshots keep at most one outstanding delivery and one
latest replacement, while explicit request replies are preserved. MIDI history stays
bounded to 256 events; the existing monitor handles stream gaps. Development reads
(`__wasmRead`) are now asynchronous.

The browser test blocks the page thread for 900 ms and verifies that the worker
continues advancing and producing recorded MIDI, then checks Stop and input cleanup.
Visibility changes stop/release the engine and pause its clock; page exit terminates
the worker. A long worker callback gap stops instead of replaying a backlog. This
is still a timer, not an audio clock or AudioWorklet. Browser suspension, Move timing,
load behavior and crackles cannot be validated here.

The probe generates deterministic PCM internally, but this page discards that
PCM. The optional shared UI audio monitor still uses its simple Web Audio
oscillators fed by final MIDI. It is not a production synth instrument.

## Static package and next step

After building, run `node dev/wasm/package.mjs`. The output in
`dev/wasm/build/site` contains only static assets and opens Joint by default. Serve
that directory at an HTTPS origin root (not a subdirectory), with JavaScript and
`application/wasm` MIME types. No API, native processor, shared-memory headers or
runtime downloads are required. CI tests the copied package and uploads it as
`browser-joint-static`. Nothing is deployed automatically. This is ready for a
hosting trial, not a claim of tested iPad compatibility or offline reload support.

Next: establish an AudioWorklet clock and one portable synth, retaining one owner
of compiled engine state. The page-thread oscillator monitor can still be delayed
by UI stalls. Session save/open, full Manager integration, service-worker caching
and physical iPad Safari verification remain pending.
