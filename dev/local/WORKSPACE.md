# One composable HB / Movy workspace

`/move/` is the browser application. `/joint/` redirects there, preserving its
view link. The workspace mounts each component once and moves its DOM node when
reordered or enlarged. Layout, visible components, editor track and lighting
preferences belong to the same browser session. Earlier Joint browser saves
remain available explicitly in Previous sessions; they are never auto-imported.

## Inventory and authority

| Function | Authoritative implementation | Composition |
| --- | --- | --- |
| Clips, track banks, conductor/drum views, transport, record and abstract clip editing | Production Movy `seq`, controllers and patched integration sources | `move-runtime.mjs` hosts them; shared `move-input.mjs` dispatches their physical gestures |
| Grid Sequencer, paging, zoom, follow and operation rows | `integration/grid/grid.ts` and production grid panels | Existing mode in the shared display/pads; no browser sequencer model |
| Joint Play, actor/motif/source-weaving controls, rhythm libraries and generator audition | Production Joint and generator controllers | Same runtime and parameter pages as Move |
| Chord Play, queues, chord spelling, Romans, ranges and inversions | Production chord controllers and HarmonyBus | Screen, knob, pad and step adapters read those controllers; labels do not calculate alternate chords |
| Knobs, Shift gestures, Jog touch/click, Volume, arrows, pads and steps | `move-input.mjs` plus production MIDI handlers | Screen cells and controls share one held-input owner |
| Settings hierarchy, dropdown and segments | Production panel controller and HB metadata | `move-panel-build.mjs` projects the existing hierarchy; `move-panel-controls.mjs` selects its real entries |
| Whole-screen vector rendering and typography | Production drawing commands and shared settings geometry | `move-display.mjs`, `move-drawing.mjs` and vector adapter; device mirror uses actual pixels |
| Field Outputs and motif probabilities | HarmonyBus `modules/harmonybus/{field,choice}-web.js` and `web_ui.html` | Canonical mount functions; `build-workspace.mjs` bundles original markup/handlers into isolated roots |
| Song construction and section editing | Production `seq/song.ts` and section controller | `song-actions.mjs` used by runtime and native diagnostic host; one `song-ui.mjs` presentation |
| Perlin/four-light preview | `lighting-ui.mjs`, `lighting.mjs`, profile and section modules | Same component, stylesheet and engine observations; no DMX output |
| Sessions and audio diagnostics | `session-ui.mjs`, worker session codec and PCM monitor | One owner and one browser save per workspace |

The native diagnostic `/`, `/movy`, `/field` and `/joint` pages remain explicit development
fixtures for native/API parity and upstream-controller tests. The old Joint WASM
harness is available only at `/diagnostic-joint` on the development server. It is
excluded from the published package; its performance shell is not another user
application. These fixtures continue to import production controllers and the
same Field, Song and Lighting components. The unmodified Schwung Manager is
upstream software, not a copied implementation in this repository.

## State and contract

`workspace-contract.d.ts` describes component lifecycles, parameter bridges,
commands and connection ownership. `move-connection.mjs` is the single transport
boundary. Component watch lists form one deduplicated subscription, bounded by
the existing protocol's 64-key limit. The shared cache contains observations,
not musical calculations. Field and probabilities follow the selected track or
an explicitly pinned editor track; lighting follows its quartet. Engine-global
Field placement and overrides remain global; selecting a different track never
invents a private copy. Per-track destination mappings remain in the existing
operation lanes.

HarmonyBus's `module.json` is the parameter registry: IDs, names, types, units,
ranges, enum choices, defaults and hierarchy. Movy's production page definitions
own control bindings, automation gestures and interaction behavior. The build
imports those definitions instead of maintaining a parallel browser registry.
`protocol-policy.mjs` constrains transport access; it is not parameter metadata.

Movy's sequencer owns clips, song, selected tracks/modes and recording. HarmonyBus
owns harmony, operation lanes and the transformation of abstract inputs into
rendered MIDI. Schwung owns chains and host services. WASM is a host for those
same compiled engines; it does not create a second musical model. Presentation
owns layout, zoom, optional component visibility, editor focus and monitor level.
Rendered MIDI is an observation for feedback/lighting, never a replacement for
the recorded abstract clip or operation data.

## Adapter ownership

The browser adapter has semantic snapshots and shared production input handlers.
The 1.7.3 device adapter exposes only validated mirror pixels/LEDs. Capabilities
enable components: absent semantic state hides their content and shows the
specific limitation, with no retained emulator values presented as device data.
No guessed host version is displayed. The stream does not report one.

For the separate host-compatibility work, a richer adapter must report actual
capabilities/version, publish authoritative observations with a connection epoch,
validate commands, and acknowledge cancellation before relinquishing ownership.
It must map to existing semantic APIs or production gestures, not emulate state
on the page. The current mirror sends no commands. Loader and host automation
integration belong to the host adapter work and are deliberately not duplicated.

Switching releases the old browser owner, suspends its clock/audio, then permits
an explicit Move connection. Returning restores the retained browser session,
stopped with audio off. Disconnect/loss clears display state, closes EventSource
retries and ignores stale callbacks; reconnect is an explicit Connect action.
No session or parameter transfer between browser and Move is implemented.

## Validation

- `node --test dev/local/move-device-test.mjs`: source-derived protocol fixtures,
  browser policy, handshake/loss/reconnect ownership and real companion proxy.
- `dev/wasm/full/workspace-browser-test.mjs`: packaged app, canonical components,
  edit routing, recomposition, Song, persistence and real SSE fixture in Chromium.
- Existing Move browser suite: all modes, native panels, 62 encoder gestures,
  responsive/enlarged layouts, PCM, clip recording/save/reload/replay.
- HarmonyBus `tests/web_components_test.mjs`: multiple roots, held cancellation,
  suspended polling, stale replies and disposal, beside existing Field/choice tests.

Hardware and iPad Safari are separate acceptance checks. See
[MOVE-CONNECTION.md](MOVE-CONNECTION.md) for exact device and security limits.


Paired physical transport uses the same connection owner and canonical Movy
`cmd` encoding as the browser service (`move-transport.mjs`). Its optional
companion refuses current Movy metadata because stock tool subscription consumes
the autosave dirty flag. A future device-owned persistence capability gates
Play/Stop; only then does it validate active tool identity, and reports sent requests without inferring playback state.
The raw mirror and rich canonical editors retain their honest capability
boundary; see [MOVE-CONNECTION.md](MOVE-CONNECTION.md) for protocol and testing.


## Shared appearance

`workspace-palette.mjs` defines one validated hue/saturation/brightness preference
and contrast-checked CSS palette. `workspace-theme.mjs` owns the color wheel,
keyboard sliders and browser-local persistence. The Move workspace, enlarged
editor, Song and Lighting controls use these tokens directly; the build adapter
lets canonical Field/probability shadow roots inherit them without duplicating
those editors. Pad/step LEDs, device pixels, field values and rendered lighting
colors retain their semantic colors. No whole-page hue or brightness filter is
used. Appearance is independent of engine selection and musical session files.

## Portable companion

`dev/wasm/package-companion.mjs` copies the tested static artifact unchanged and
ships the existing mirror server with its pinned Node dependency. The archive's
`BUILD.json` records source provenance and file hashes; a separate SHA256 verifies
the archive. `companion-start.mjs` provides a read-only launcher with explicit
private-LAN binding. It never discovers/connects to Move on startup. The extracted
archive is tested outside the checkout against the same protocol fixture and
byte-compared with the hosted workspace. It contains no alternate UI or engine.
