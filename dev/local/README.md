# HB native development host

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
browser shows routed MIDI; the Joint view also offers an optional audio monitor.
The production Field Outputs page is available at
`http://127.0.0.1:7701/field?tool=1&component=ch1:midi_fx1`. Its eight strips,
latch/momentary switch, orientation, banks and release controls use the unchanged
HB HTML/JavaScript against native track 2. Disconnect releases active remote
overrides without creating a latch; intentional latches remain until released.

No clip editor, persistence UI, pressure UI, full Manager
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
# Install the pinned test browser (or use HB_BROWSER=/path/to/chromium).
dev/local/node_modules/.bin/playwright install chromium --only-shell
node dev/local/browser-test.cjs
```

Native/API comparison drives the same commands and block steps into independent
host processes, comparing HB snapshots, musical status (excluding elapsed CPU
measurements), and MIDI packets. It verifies a held follower C moves to D over a
C-major → D-minor change, parameter-write restrictions, balanced note releases
on disconnect, and process-global isolation. Browser verification exercises the
real Schwung client, chord buttons, held pad, parameter edit, and 390px layout.

The current baseline is Movy integration tag `v0.34.1-hbclean.207-dev.1`,
HB tag `v0.2.285-dev.1` (`b1619b9`), upstream Movy `5c01a4fe`, and Schwung
`e877ed64`. Exact dependency revisions are pinned in `setup.sh`; the integration
comes from this checkout. Setup patches a fresh temporary export each run, so
rerunning it cannot double-apply patches or overwrite edits in cached checkouts.
The temporary export is removed after building. Existing source overrides can
still be supplied through `build.sh`.

The native and browser tests run in `.github/workflows/local-processor.yml`.
Version checks compare native HB with the built module metadata. Field tests
cover native latch persistence, release and disconnect cleanup. This is a
development branch; no release pointer or Move install was changed.

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
This generic view does not contain the Joint Play controls; those are available
in `/joint`. Full Manager integration remains future work. Use the linked pad/MIDI
panel for the existing musical checks. One browser connection owns writes at a
time; close that tab before controlling from a different tab.

The browser test additionally checks native version display, a real knob drag
changing native transpose, per-track channel reads, and the phone-width layout. It also drives the production Field Outputs page
and verifies that its latch and release controls change native HB state.

## Joint Play performance view

Open `http://127.0.0.1:7701/joint`. This view bundles the production
`joint-play.ts`, `joint-panels.ts`, and Schwung shared parameter-page controller.
The browser adapts host I/O and drawing; geometry, actor links, page navigation,
knob edits, and touch operations remain in their existing production modules.
The 32 pads enter Movy's native MIDI callback, using the production Joint route.

Supported: all four quartets, root/bass/comp/melody layouts, actor parameter
pages, operation knob touches, Shift-turn assignment, displayed pad colors,
the 16 Operator/Motif step buttons, and cleanup on blur or disconnect. The page selector exposes the controller's
existing pages. A held pad retains its original native note owner across layout
changes. Disconnect cancels outstanding touches with their original actor masks,
releases physical notes, and clears temporary Joint routing.

This is a performance-control view. It does not yet provide the full Session
mode cycle, ordinary step sequencing, pressure input or persistence. Play, Stop and Joint Record use the native sequencer. The backend still uses
the explicit musical test fixture described above, rather than saved Move Sets.

`node dev/local/joint-browser-test.cjs` verifies native follow-bass output,
actor knob edits, scoped operation touch/release, a layout change during a held
note, quartet selection, Operator/Motif step presses, original-quartet step
releases, disabled sequencer mode, phone layout, and disconnect cancellation. The native API
suite additionally tests abrupt disconnection, original touch masks, input
validation, and exclusive control ownership. Both browser suites run in CI.

The step row uses production `hbPerformanceStep` and `paintHbPerformance`.
Set **Step Buttons** to **Operators** or **Motifs** on the Joint Setup pages.
Pointer holds and Space/Enter presses use the same production release handling;
the native backend cancels a still-held step if its browser disconnects.
**Steps** mode is visibly unavailable until this host supports clip sequencing.

### Local transport and recording

The Joint view provides **Play**, **Stop**, and **Record**, with native
Stopped/Playing/Count-in/Recording status. Record uses the production Joint
actor mask and each actor's Replace/Overdub setting. From stopped, Movy supplies
its own count-in; wait for **Recording** before playing. Press Record again to
end the take while transport continues, or Stop to finish and stop. Play replays
the stored source gestures through HB; the MIDI inspector shows the output.
The optional audio monitor plays rendered MIDI using simple browser sounds. There is no clip editor.

The local host disables Move transport linking and uses Movy's internal 120 BPM
clock. Browser timing is approximate; manual block stepping remains deterministic.
Clips exist only in the running processor and are lost when the server exits.
Only the controlling browser may change transport. Disconnecting it stops the
sequencer and releases held controls, without clearing recorded clips.
The API accepts only Play, Stop, and validated Joint recording masks; arbitrary
sequencer commands and file loading remain unavailable.

### Audible monitor

Open **Audio monitor** in the Joint view and press **Enable audio**. Native HB
rendered MIDI channels 1–4 drive sine (Root), triangle (Bass), sawtooth (Comp),
and square (Melody) voices. Each actor has a monitor-only volume and mute control;
these do not change HB settings or recorded data. Quartets share these four
render channels in the local fixture, so their corresponding actors share sounds.
Changing HB render channels changes what this four-channel monitor hears.

The monitor does not implement harmony, travel, motifs, or sequencing. It
consumes final native MIDI, skips snapshot history and duplicate event delivery,
and retains separate overlapping voices for identical pitches. Stop silences
the monitor; blur, hiding the page, or disconnect disables audio until explicitly
enabled again. A detected event-stream gap silences voices and skips the
incomplete batch. A bounded voice count prevents unbounded oscillator growth.

Browser/transport buffering adds latency and does not reproduce hardware audio
deadlines or Move instruments. This is suitable for listening to HB behavior,
not diagnosing Move crackles. Chromium tests verify a nonzero audio waveform,
native root/bass voices, duplicate suppression, overlapping-note ownership,
mute state, Stop cleanup and stream-gap cleanup. Safari/iOS listening has not
been verified.

Browser-only feasibility work is in [`../wasm/README.md`](../wasm/README.md).
That separate static page runs actual HB and Movy sequencer WebAssembly, with
native differential tests; it does not yet replace this full native Joint host.
