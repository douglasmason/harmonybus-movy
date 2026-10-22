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
Rust 1.99.1 and Emscripten 4.0.10, then install both Rust targets:

```sh
rustup target add wasm32-unknown-unknown wasm32-unknown-emscripten
bash dev/wasm/prepare.sh
node --test dev/wasm/test.mjs dev/wasm/full/test.mjs
node dev/wasm/browser-test.mjs
node dev/wasm/full/browser-test.mjs
node dev/wasm/full/audio-browser-test.mjs
node dev/wasm/full/session-browser-test.mjs
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
the callback's actual output frame count. On supported browsers, enabling requests the music `playback` audio-session type
and restores the previous type on disable. This addresses iOS ambient-audio mute
behavior; physical iPad verification is still needed. The audio status reports
startup, received samples, and recent signal activity to help diagnose silence.
Enable audio through the button; an
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

## Durable browser sessions

The browser Session panel autosaves to IndexedDB every five seconds while stopped
and after Stop. It restores on reload before enabling autosave. **Save on device**,
**Open saved**, **Export backup** and **Import backup** provide explicit control.
Stop recording/playback and release controls before saving. Export a backup before
clearing browser data; private browsing, browser eviction or quota limits can
prevent or remove device storage. A failed startup restore does not overwrite the
saved session. Audio must be enabled explicitly after opening.

The versioned/checksummed JSON envelope uses production Movy state wrappers and
bulk/LFO codecs. It includes all 16 clips/track sets, engine-owned Scenes/Song,
Source Weaving and Clip Variation state, HB and NuSaw state, chain mix, LFOs and
Joint UI configuration. There is no independent browser sequencer. A candidate
Wasm engine loads and reads back every supported component before replacing the
current engine; invalid, unsupported or non-roundtrippable state leaves the
current session intact. Unknown instruments, extra effects, sends, or unsupported
LFO state fail visibly. This is not a Move Set importer or stock Move instruments.
HB's retired clip-context field is normalized to the production loader's Live
value; no other HB state difference is accepted. Zero-Hz unset LFO sentinels are
preserved without clamping. Native save/open remains outside this browser change;
no unfinished local host.c experiment was found in the inspected checkouts.

## Audio diagnosis on iPad

The Audio panel starts expanded. **Enable audio** invokes AudioContext resume
synchronously from the tap, requests the playback audio session where supported,
and fails explicitly on an output rate other than 44.1 kHz. Startup and worklet
loading have timeouts. Interruptions disable audio and ask for a new tap; re-enable
preserves the mix. **Test speakers** sends a short 440 Hz diagnostic tone through
the same output gain. The musical sound remains compiled NuSaw.

**Audio diagnostics** includes source/build IDs, audio session and context state,
requested/output sample rates, worker PCM peak, received/rendered/underrun frames,
worklet signal peak, post-gain analyser peak, actor levels/mutes, gain, recent
transitions, errors and user agent. Copy the text or screenshot it while holding
a pad with transport stopped. Signal counters and peaks locate a break in the
path; they do not prove that an iPad speaker was audible. The user's last physical
report was silence, and there is no subsequent verified successful iPad listening
result. Chromium waveform tests do not close that report.

## Shared observations

Both transports attach schema-1 `observation` objects to updates, containing
engine status and watched production Field/harmony/source/variation snapshots.
`clock.sampleFrame / 44100` advances in the serialized render owner even while
musical transport is stopped; `transportTick` is the engine's master tick at
96 PPQN. Observers never step an engine. Browser epochs change on session open.
Events carry epoch/sequence, final-output MIDI, a request-boundary sample stamp
and trigger provenance (`live-input`, `render`, or `control`). Render-time events
can include sequenced and delayed live notes; `performance: unresolved` states
that limitation explicitly. Precise intra-block timestamps and note-owner
provenance still require production hooks. `structure` now carries
the existing schema-1 `song_section` snapshot unchanged: epoch, visit, count,
current entry and start/end ticks, and next entry with its committed/forecast flag.
Its stopped/pending boundaries stay null; consumers must not substitute UI time.
Consumers must reset sequence tracking when epoch changes. Do not infer attacks
from repeated snapshot/history delivery or invent a second transport clock.

The bounded read policy also exposes LFO 1/2 Field route configuration, HB bypass,
and synth/FX parameter base/effective readouts through `dev_watch` and the shared
track ports. These are observations, not LFO or module-loading controls. Up to 64
watched keys are read in the serialized owner without advancing the engine. Field
overview navigation/editing remains with the shared controller's owning work.

## Existing Song controls

**Scenes & Song → Build a new song** adapts the production Loop + Scene gesture.
The first Scene button replaces the current song, later presses append, and
repeated scenes extend an entry. Finish building to disable the scene buttons.
The engine owns scene launches and scheduling, including timed rests and legacy
empty-scene END behavior. No second sequencer or arrangement policy is introduced.

**Edit Song Sections** opens the production Joint parameter pages: Entry, Bars,
Track, Transition, Recipe, and engine Now/Next/edit state. Stop before editing.
Recipes use production `ss1` serialization and survive Save/Open, export/import
and reload. A fixture exported from the deployed v4/Movy 220 engine must restore
without sequencer changes. Native/Wasm tests compare section snapshots, visits,
boundaries, final MIDI and saved recipes across the same rendered block sequence.

Production Source Weaving (including Grid holds and recorded gesture sources),
Clip Variation and conductor diagnostics are reused via bounded root reads and
validated edit commands. This host does not add arrangement, fills or lighting
mappings. The concurrent four-light preview is preserved as the existing private
Site overlay, not copied into this public branch.

## Static package and deployed trial

The existing owner-private trial is deployed at
https://harmonybus-browser-trial.yummyprawn.chatgpt.site . Version 2 used packaging
commit `83633fd1a14c6f4a9712c16383587364df394509`, distinct from GitHub engine source
`7abe52abf95d10605fc8d7e58e03e01b7d83137f`. Its compiled HB is `0.2.285-dev.1`,
its older internal workerbuild label is `0.34.1-hbclean.202`, and its engine Wasm
SHA-256 is `2eff0ce95bfa823b0ef44a9b5814339697929dbe3980b412ae664b7f0e58475a`.
Version 3 adds the separately owned private lighting overlay to that same engine.

Version 4 (`fecdd01f90673993ab993b0c61d48c4467bf239e`) published durable sessions,
audio diagnostics, and Movy 220 / HB 289 with the private lighting overlay intact.

This continuation refreshes integration main to `84b270f750ca900f823f1d7e9a163f42d678726c`
(Movy 222, including Field overview 221 and Song Sections), HB to
`b907f48b0d6d24598c4b903e4d2e59e9b759ec38` (289), retaining upstream Movy
`5c01a4fe`, Schwung `e877ed64`, and NuSaw `e3787739`. The compiled
`/wasm/build/full/build-info.json` records exact source commit/tree, clean/dirty
status, dependencies, toolchains and Wasm SHA-256. It is displayed in diagnostics
and included in saved sessions. Site packaging commits remain separate.

After building, run `node dev/wasm/package.mjs`. The output in
`dev/wasm/build/site` contains only static assets and opens Joint by default. Serve
that directory at an HTTPS origin root with JavaScript and `application/wasm`
MIME types. CI tests the copied package and uploads `browser-joint-static`; it
does not deploy automatically. Preserve the Site's private audience and any
concurrent UI overlay when publishing. Full Remote UI/Manager, ordinary clip
editing, offline reload caching and external MIDI integration remain separate.
