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

`/move/` now runs the **complete production Movy application loop** in the same
worker as the DSP, with synchronous host parameter reads/writes. Its framebuffer
and LED output feed the adaptable HB/Movy display, knob, pad and step grid.
The enlarged screen has size choices and a full-screen reading view; labeled
HTML controls support touch, mouse and keyboard without fixed canvas coordinates.
High resolution is enabled by default for the whole screen. The production
drawing functions supply scalable text, smooth knob arcs, switches, pan controls,
faders, envelopes, filter/EQ curves, LFOs, sample waveforms and trail curves.
Hatching and curve masses use greyscale; guides remain quieter than active marks.
Grids, menus, selection boxes and overlays retain their production geometry and
draw order. The browser build observes shapes before rasterization and samples
the existing curve functions at fractional coordinates; it does not recreate
parameter logic or fetch extra engine state. Bitmap-only assets retain their
original appearance. Turn high resolution off for the exact 128×64 bitmap; the
choice is saved with the browser session. This does not change device rendering.
The build compares adapted and unmodified production renderers pixel-for-pixel.
Displayed parameter cells are also controls: drag vertically to turn their
physical knob, tap to touch it, or focus the cell and use arrow keys. This works
in the enlarged view and with either display style. Cell bounds come from the
production renderer; read-only cells and controls covered by menus/cards are
not active targets. The screen and physical knob row share the same gesture
owner, MIDI routing, cancellation and parameter automation behavior.
Jog is directly below the display: tap it to click, drag to turn, or use its own
minus/plus buttons below it. The separate encoder selector contains only knobs
and Volume, so using Jog does not change the selected knob.
The eight browser knobs also show the current parameters' full names and values
before device-width shortening. The encoder selector uses those same names, and
its readout follows edits. Both native Movy and Schwung cells publish their
already-resolved presentation data; no extra DSP reads or parallel parameter
model are introduced. Read-only cells are identified, trigger cells say Action,
and menus clear labels from the underlying page. Enum feedback retains the
current controls' labels while their values change. Physical knob
numbers, MIDI gestures and parameter ownership remain unchanged.
Pads, steps, modifiers, relative encoders, track selection, clip editing and Undo
all go through Movy's real MIDI router. No second sequencer or clip model exists.
The original Joint performance/lighting view remains at `/joint?engine=wasm`.

In Normal, Joint and Chord Play, the enlarged pad surface labels the exact maps
Movy sends to DSP: scale degree, approach arrow, input/target note, and row actor.
Approach operation names come from HB's existing sequence/row readbacks. They
are input intent, not a prediction of the final chord or voicing. Other views
and held-step editing keep physical pad numbers instead of misleading note labels.
Last played freezes that input at the press. Latest output independently shows
the engine's most recent note-on group by MIDI channel, including deferred live
notes, accompaniment, arpeggios and clips; it does not claim per-pad causality.
Both readouts clear when opening or creating a session and never enter exports.
Label refreshes use bounded lightweight reads; they never request another DSP
preview, rerender audio or advance the musical clock.

Tap a pad, then a step to enter a note. Hold a step and turn Volume to change its
velocity. Undo and Shift+Undo use Movy's production history. Note/Session opens
the current mode menu; turn Jog and click it to choose a mode. Shift+Note/Session
opens Clips, whose step row selects any of the 16 tracks. Drag an encoder
vertically, use arrow keys while focused, or select it above the surface and use
the minus/plus buttons. Escape and Stop cancel held gestures without turning an
interrupted step press into a note edit.

Fresh `/move/` sessions use the production `resetUiState(true)` and
`freshHarmonyBusChains()` defaults: one conductor, Comp in Conductor Chord mode,
Played Top Note inversion, and the production role/travel/channel settings.
NuSaw and the audible browser mix replace device instruments/output only. Older
saved sessions keep their own settings; the diagnostic Joint/native fixtures
remain explicit test configurations. **Session files → New session** adopts the
production defaults without replacing older saves.

For Chord Play, choose it in Note/Session, tap a chord on the step row, then tap
Record and play melody pads while changing chords. The default conductor is
silent; its selections carry harmony and melody triggers the Comp voice. Use
Play / Stop or Stop & release to end the take and replay. Reopening restores the
selected mode and track, including Chord Play routing; no mode reselection is
required. Stop, Escape, interrupted holds and backgrounding cancel musical gates
while retaining that context. The full-engine regression verifies distinct
stored harmonic descriptors and rendered Comp/melody notes before and after load.

The Comp accompaniment strip shows the selected bank's melody/comp pair and
edits the existing Joint Setup source setting. Follow remains active in Normal
Play: Track 4 also triggers Track 3 according to its HarmonyBus settings. The
older browser fixture doubled targets in unison and harmonized approaches;
fresh sessions use the production Comp chord settings. Choose **Clip · independent** for
Track 4 pads without that linked comp voice. Clip, Pads and Clip + Guide keep
their production meanings; choices persist per bank in saved sessions. Chord
Play owns its own accompaniment, so the shortcut is disabled there.

`dev/local/build-move.mjs` bundles our `move-surface.mjs` using the same Movy
palette as Joint, alongside the integration's patched Movy sources. Its fail-closed adapters
replace device Set discovery/autosave with the browser session owner, omit a
duplicate chain restore already verified on the candidate DSP, and fix track
ownership to Movy's browser chains. Device builds are unaffected. The full
Schwung Manager, Move OS, stock sounds, device master volume, master FX, external
MIDI and Move Set files are not emulated. Use the browser monitor level for
output gain; track+Volume still edits the real track mix. Only HB + NuSaw sessions
can be saved. The two surfaces keep separate IndexedDB autosaves; portable
exports transfer engine state between them.

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
node --test dev/wasm/full/move-test.mjs
node dev/wasm/full/move-browser-test.mjs
node dev/wasm/serve.mjs
```

Open http://127.0.0.1:7702/move/ or http://127.0.0.1:7702/joint?engine=wasm. All processing stays in the browser;
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
The Move surface also has **New session** and **Previous sessions → Open selected**.
Both preserve the current session in a separate IndexedDB entry before switching;
if preservation fails, the current engine is retained. New session clears clips
and Undo while retaining machine preferences and user parts. New session starts
in Normal Play on Track 1. Saved sessions also retain the playing mode, selected
track and performance owner beneath Clips/Settings; old exports without this
optional context retain their Normal/Motif fallback. Opening always stays stopped
with audio disabled. Archives survive
reload, but remain browser data: export backups for storage outside the browser.
Stop recording/playback and release controls before saving. Export a backup before
clearing browser data; private browsing, browser eviction or quota limits can
prevent or remove device storage. A failed startup restore does not overwrite the
saved session. Audio must be enabled explicitly after opening.
**Export saved copy** downloads the stored file without asking the engine to load
or rewrite it, including after a failed restore. Pending operations replace stale
success messages until their transaction finishes. Restore mismatches identify the
first differing sequencer line/tag while preserving the original stored file.
The Worker retains its initial Wasm bytes for candidate restores, so a later
deployment cannot replace the engine beneath an open session, and import/open
work after networking disconnects. At secure origins the initial binary hash must
match build metadata. This does not add offline page reload/install caching.

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
path; they do not prove that an iPad speaker was audible. The user subsequently confirmed audible speaker-test and live-pad output on iPad.
Their attempted recorded playback was silent and the old layout required excessive
scrolling. Updated playback and ergonomics still need physical verification.

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
mappings. Published lighting PR #96 is integrated without changing its mappings;
its profiles remain in browser storage and the session UI envelope. Original
private overlay patches remain in Site history.

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
`dev/wasm/build/site` contains only static assets and opens Move by default. Serve
that directory at an HTTPS origin root with JavaScript and `application/wasm`
MIME types. CI tests the copied package and uploads `browser-joint-static`; it
does not deploy automatically. Preserve the Site's private audience and any
concurrent UI overlay when publishing. The Move surface now runs production clip
editing. Full Remote UI/Manager services, offline reload caching and external MIDI
integration remain separate.

## Lighting preview

Joint now includes a read-only four-corner light field, driven by the compiled
HB Perlin snapshots and rendered live/recorded MIDI. See
[`dev/local/LIGHTING.md`](../../local/LIGHTING.md) for sample mapping, spatial
voices, lifecycle, structural cues, tests, and the future physical DMX boundary.

### iPad performance layout and recording feedback

The playing surface now owns the viewport: transport and audio enable remain visible,
with separate Controls, Song, Session, Audio, Lights and Info panels. Secondary panels
scroll internally. Pads retain pointer capture and `touch-action: none`; changing a
panel releases held controls. Browser regressions check portrait/landscape tablet and
phone viewport fit.

Record uses the production one-bar count-in. Live pads can sound during count-in
without being captured; the countdown and instruction are now prominent. The four
actor cards read production `motif_clip_info_N` (selected slot and note count), not
live MIDI history. Browser reads of these fingerprinted getters are throttled to
500 ms. Counts describe selected clips, not disk-save success or audible output.
The cards show replace/layer/not-recording per the existing Joint record mask.
Replace recording erases earlier material on each loop; Finish take stops capture
while playback continues. Stop ends transport. Play now closes an active take
before restarting production playback, because production `play()` alone preserves
recording. Songs retain their existing first-scene playback behavior.

Physical report: speaker test and live pads made sound on the user's iPad. An
attempt at recorded playback made no audible sound and controls required excessive
scrolling. The host transport bug is reproduced, but the precise cause of that
physical attempt is not established. Updated iPad replay/ergonomics remain to be
verified. No engine/pin or hardware installer change is part of this increment.
