# HB native development host — proof 1

Runs production Movy (Rust), Schwung chain (C), and HarmonyBus (C) in a native
Linux process. The browser talks to a compatible **subset** of Schwung's Remote
UI WebSocket protocol, using the unmodified `schwung-remote-api.js`. It does not
simulate harmony, note mapping, arpeggiation or processor state in JavaScript.

## Run

Requires Linux, a C compiler, stable Rust/Cargo, Node 20+, npm, Python 3 and git.
For macOS use a Linux development container; macOS/Windows native builds are not
validated. No Move or Move-network access is required.

From this integration checkout:

```sh
bash dev/local/setup.sh
node dev/local/server.mjs
```

Open **http://127.0.0.1:7701/?tool=1**. To use an iPad on the same trusted LAN,
start with `HB_DEV_BIND=0.0.0.0 node dev/local/server.mjs`, then open the computer's
LAN address on port 7701. This is an unauthenticated development endpoint, not
internet hosting. Only one browser controls the processor at a time.

With already prepared source checkouts:

```sh
npm ci --prefix dev/local
# movy-source must have this integration's apply_clean_harmonybus.py applied.
npm ci --prefix /path/to/movy-source
bash dev/local/build.sh /path/to/movy-source /path/to/harmonybus /path/to/schwung
node --test dev/local/test.mjs
node dev/local/server.mjs
```

`--manual` disables automatic ticks. The test client advances exact 128-frame
blocks using `dev_step`; each block advances the 120 BPM clock at 44.1 kHz.
Interactive mode advances approximately real-time and deliberately does not
simulate Move scheduling or hardware audio deadlines.

## What is shared

- Actual Movy plugin and sequencer, actual chain host, actual HB plugin.
- `surface_events`: existing ordered external-surface routing, including sound
  and recording entry paths, with native ownership and release handling.
- Actual HB parameters and read-only display snapshots. The autosave `state`
  getter is never polled, because it clears the dirty flag.
- Movy's `parseHarmonySnapshot`, `withSurfacePreview`, `harmonyPadColor`, palette,
  and `previewPayload`, bundled directly from the prepared TypeScript source.
- Existing Schwung browser client. `/ws/remote-ui` supports subscriptions and
  the limited parameter writes needed for this proof; it is not a full Manager.

## Proof fixture and scope

The host instantiates all 16 chains. The panel exposes the first quartet: one
conductor and three followers. A chromatic C3–G5 grid and preset chord buttons
exercise the processor without introducing new musical rules. Followers use
Chord content, Closest Scale Tone travel, chromatic travel Off, zero boundary
buffer, and retrigger-held defaults. These are explicit test-fixture choices;
installed Move settings are unaffected. Output channels 1–4 distinguish actors.

The dummy instrument produces deterministic PCM for native chain testing. The
browser shows routed MIDI; **audible browser playback is not implemented**.
No clip editor, persistence UI, Joint Play panel, pressure UI, full Manager
emulation, or Live/Local selector is included. The same control API can be used
on hardware, but this panel's subscription/snapshot integration has not been
deployed or verified against the physical Move.

## Execution and isolation

One native thread owns all parameter writes, surface events, snapshots, and
render calls. Node orders WebSocket work; browser calls do not enter the plugin
concurrently. The existing processor can still use its own internal workers.
Each host process receives separate HB shared-memory names, which are removed
on normal exit. Module paths are local build fixtures. The API allowlist excludes
loader, filesystem and save commands. Disconnect releases the controlling
browser's held surface addresses; blur/visibility changes release UI holds.
No new hook or polling loop is installed on Move.

The event inspector retains 256 events, with sequence numbers; it is a rolling
view rather than an unlimited recording. Native output overflow is an error.

## Validation

```sh
node --test dev/local/test.mjs
# Requires Playwright and its Chromium (or HB_BROWSER=/path/to/chromium).
node dev/local/browser-test.cjs
```

Native/API comparison drives the same commands and block steps into independent
host processes, comparing HB snapshots, musical status (excluding elapsed CPU
measurements), and MIDI packets. It verifies a held follower C moves to D over a
C-major → D-minor change, parameter-write restrictions, balanced note releases
on disconnect, and process-global isolation. Browser verification exercises the
real Schwung client, chord buttons, held pad, parameter edit, and 390px layout.

The source baseline for this proof is integration `13b771f`, HB `3ddca00`,
Movy upstream `5c01a4fe` with the integration applied, and Schwung `e877ed64`.
This is a development branch; no release pointer or Move install was changed.

## Existing Movy browser interface

Open `http://127.0.0.1:7701/movy` for the upstream Movy browser-test OLED,
eight draggable knobs, bank navigation, and view-model inspector. Select any
of the first four HB tracks. Touch dragging and keyboard up/down are supported.
`build-movy.mjs` adapts the existing harness and HTML at build time, importing
the production Movy model and renderers. It fails if expected upstream hooks
change. It does not fork those components or duplicate HB musical logic.

`movy-bridge.mjs` supplies the model's TrackPort using cached native values and
WebSocket writes. Visible reads subscribe in batches of at most 64 keys per
client; metadata comes from the built HB module. Missing values stay pending
until the processor replies. Read-only and write-only action controls are not
editable here; ordinary declared numeric/enum controls are enabled. Native
reads run in the same serialized owner as rendering and writes. State/save
getters and arbitrary loading are excluded.

This reuses the generic Movy parameter harness, not the full device controller:
HB-specific touch-operation panels, pad/button emulation in this view, browser
audio, and full Manager integration remain future work. Use the linked pad/MIDI
panel for the existing musical checks. One browser connection owns writes at a
time; close that tab before controlling from a different tab.

The browser test additionally checks native version display, a real knob drag
changing native transpose, per-track channel reads, and the phone-width layout.
