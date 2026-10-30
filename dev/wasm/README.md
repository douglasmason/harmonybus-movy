# Browser-only development

The [full production host](full/README.md) now runs Movy DSP, Schwung chain host
and HB in one WebAssembly module and reuses the existing Joint Play page.
It now includes compiled NuSaw synthesis and a worker-to-AudioWorklet PCM path.
Open `/joint?engine=wasm` on the static server after building. The small slice
below remains a focused compiler test; its earlier architecture assessment is
retained as the record of what that first experiment established.

Open `/move/` for the full production Movy UI on our adaptable HB/Movy control grid
surface: pads, clips, steps, Undo, knobs and all sixteen tracks, running beside
the actual engine in the browser. See the full host guide for controls and limits.

## Original feasibility slice

Actual production HB C and patched Movy `seq-core` Rust execute as WebAssembly.
This is a separate, deliberately small experiment; `/joint` remains the native
host. No Move emulator and no musical rules implemented in JavaScript.

The static page creates a clip through Movy's existing command parser, advances
its actual scheduler, sends NoteOn/NoteOff events through actual HB, and displays
rendered MIDI. Four HB instances share one module memory. Native oracle binaries
compile those same adapters and production sources for differential tests.

## Build and exercise

Use the pinned source checkouts from `bash dev/local/setup.sh`, Rust with
`rustup target add wasm32-unknown-unknown wasm32-unknown-emscripten`, and Emscripten 4.0.10 (`emcc` on PATH).
Then:

```sh
bash dev/wasm/prepare.sh
node --test dev/wasm/test.mjs
node dev/wasm/browser-test.mjs
node dev/wasm/serve.mjs
```

Open http://127.0.0.1:7702. The server serves static assets only. The browser test
switches offline after loading and exercises the actual compiled engines.
For retained prepared source, `build.sh` accepts `MOVY_SOURCE` and `HB_SOURCE`.
Do not reapply integration patches to a dirty source tree.

## Source assessment

| Component | Evidence / browser adaptation |
| --- | --- |
| Movy `seq-core` | Compiles unchanged to `wasm32-unknown-unknown`; no crate dependencies. Existing command parser, clips and scheduler run in the slice. |
| Movy `movy-dsp` | Direct wasm build fails at `dlopen`, `dlsym`, `dlerror`. Its loader, background load queue, rendering pool and profiling also require target-specific paths. Compiling seq-core does not prove the DSP host works. |
| HB `harmonybus.c` + `harmony_core.c` | Compile unchanged with Emscripten. Host adapter replaces POSIX shared-settings mapping with one in-memory allocation shared by all instances. Physical monitor mapping deliberately reports absent. MIDI injection is captured through HB's existing callback. |
| Schwung chain host | Not ported in this increment. Dynamic module loaders, file/module discovery, pthread use, host symbols and hardware memory access must be adapted. Its full host API header asserts 64-bit offsets; wasm32 fails that assertion. We extract HB's already-existing host ABI prefix for the small HB wrapper. |
| Filesystem/state | Emscripten provides a virtual filesystem, not device paths or durable storage. HB motif/clip file imports are not supplied. Movy's existing persistence format remains the intended format; save/open is not implemented here. |
| Production UI | Existing controllers remain in the native host. This page is only a diagnostic harness, not a replacement Joint Play implementation. |

## Architecture decision

Prefer a fixed module set with a single owner of engine state, eventually in a
worker/worklet, over recreating Linux or Move hardware. A full statically linked
Schwung/Movy/HB build preserves the most hosting behavior but requires resolving
symbol names, the 32-bit ABI, loader/discovery and worker assumptions. This
increment instead proves two independently compiled modules with a small MIDI
boundary. Separate Rust and C memories avoid mixing incompatible toolchain ABIs.

That boundary is sufficient for this fixture, **not full feature parity**:
non-note OutEvents (shared context, operations, recorded actions, pressure,
automation, rendered events) are not forwarded. Do not grow a parallel JS
implementation of those features. The next step should port/reuse the production
Movy dispatch and a fixed module registry, then compare the existing Joint
fixtures. If that adapter starts duplicating chain_host, port the chain host.

Keeping the native host remains valuable: it already exercises production
hosting, all actor quartets and existing UI and serves as the regression oracle.
Browser execution removes the runtime computer dependency only for the proven
slice; it does not make hardware timing equivalent.

## Audio and iPad

No audio is generated in this slice. Frame advance is manually driven and is
not an audio clock. AudioWorklet is the prospective audio owner: compile and
instantiate before playback, preallocate buffers, process the actual callback
frame length/sample rate, and adapt Schwung's interleaved PCM output to Web Audio
channels. Start with one verified portable synth module; Move instruments are
not thereby available. Loading modules/files or blocking on locks in the render
callback is not acceptable.

AudioWorklet requires a secure context; playback must be started/resumed through
user interaction. Avoid pthreads/SharedArrayBuffer initially: they add
cross-origin-isolation headers and threading constraints. Handle visibility,
suspension and resume explicitly. The browser slice uses ordinary unshared
WebAssembly memory. Chromium verification is not iPad Safari verification.
Physical iPad testing must cover load, memory use, touch, audio resume,
interruption/background behavior and sustained processing before promising use.

References checked during the assessment:
- https://emscripten.org/docs/compiling/Building-Projects.html
- https://emscripten.org/docs/compiling/Dynamic-Linking.html
- https://emscripten.org/docs/porting/pthreads.html
- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet

## Test boundaries

Tests compare native and Wasm sequencer note traces, then feed identical events
to native and Wasm HB and compare rendered MIDI. They require real follower
output and balanced note ownership after Stop; equal empty traces cannot pass.
The native oracle uses this small adapter, not Schwung's full chain host, so these
comparisons establish compiler/adapter parity rather than full native-host
parity. Existing native/API and production UI regressions remain separate gates.

No physical device, release metadata, or native-host persistence WIP is modified.

### Browser Move controls

The `/move/` page shares the browser engine and production Movy/Schwung renderers
and controllers with our earlier `/joint/?engine=wasm` interface. Its adaptable
Move-style HTML layout is a separate surface; the Joint Play & lights link keeps
the earlier GUI available.

Play mode beside Settings panel selects Clips, Normal, Motif, Joint, Grid,
Field, Chord Play or HB Settings directly. Its labels and choices come from
Movy's device mode selector; Back history, playing-track rules and session
context use that same controller. It also stays available in the enlarged
display. Held controls and stale choices cannot change modes; the dropdown
always follows the engine's confirmed mode, including device-button changes
and restored sessions. Opening settings leaves playback running.

High-resolution enum boxes show complete values such as Immediate and Observed,
using the available cell width and real browser font metrics. Multiword values
wrap at spaces; single words stay intact. Both native Movy and shared Schwung
cells use the same browser treatment, including full options where the device
uses short_options. Read-only frames stay dotted. The original bitmap toggle
retains the exact device text, geometry and animation.

High-resolution parameter strips also use full names, such as Chord Anticipation
and Follower Travel. They reuse the same measured text fitting and wrap only at
word boundaries. Touching a knob still displays its full value on a highlighted
strip; native action controls keep their name. Automation dots and modulation marks
have reserved space beside the text. Both native Movy and shared Schwung cells
retain their device bitmap behavior.

Choose a knob or Volume, then use the two action rows immediately below the
selector for normal or Shift turn/touch. The selected knob retains its full live
parameter name and value. The eight individual knob cards are visible above
850 px; smaller windows use the selector and direct screen controls. Jog keeps
its separate turn/touch/click rows beneath the display.

Enlarge display opens the existing screen, Jog, mode/panel selectors and selected
encoder controls together. Back, Note / Session, arrows and Volume remain usable.
Wide windows place navigation beside the screen; phones stack it below. Short
landscape windows scroll instead of shrinking the screen, with Close always
available at the top. Keyboard focus stays in this view and returns to Enlarge
display on closing. Escape closes it without stopping playback when nothing is
held; cancelling a held gesture uses the existing Stop & release behavior.
Opening is ignored during held gestures, and closing cancels any remaining hold.
The original nodes and engine stay mounted, so modes, edits and audio continue.

Settings panel lists the current production controller’s pages, grouped by the
existing panel catalog. Clicking a top display segment jumps within its current
group; the dropdown also jumps between groups. Both call the same controller’s
page navigation. Menus and overviews disable it; Grid’s Jog opens its settings
first. Single-page groups remain selectable even though they draw no ruler.
Stale selections and navigation during held controls are ignored. The original
128×64 bitmap and high-resolution vector display share the same hit positions.
