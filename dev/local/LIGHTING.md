# Four-fixture lighting preview

The existing Joint page (native WebSocket or browser-only Wasm) previews four
fixtures at the corners of a square. This is a read-only lighting consumer;
no HB/Perlin source, musical clock or note-ownership changes. Lighting settings
are browser UI state and are included in the existing browser session envelope.
The experimental Wasm host still uses its pinned HB/Movy versions, independently
of current hardware releases. Do not merge this branch over the parallel Perlin
work or change its field interfaces to satisfy the visualizer.

## Input contract and field mapping

- `field_view`: existing `nf1,rate,zoom,<64 samples>` snapshot. Samples are the
  compiled HB noise field, quantized 0–127, at x/y `(index - 3.5) * .35`, z=0.
  This is the default because unused motion lanes can all share coordinate zero.
  Each light has three independently selectable coordinates for hue, intensity,
  and saturation; the 8×8 picker edits lighting mappings only.
- Optional `field_outputs_view2`: existing `fo2` 16-lane view. Hue uses lanes
  1–4, intensity 5–8, saturation 9–12, including live/latch output overrides.
  Existing lane coordinates and assignments are never changed by this preview.
- `shared_context_snapshot` supplies effective key and parent scale; the selected
  quartet's melody actor `harmony_snapshot` supplies its rendered chord.
- Schema-1 host `observation` supplies epoch/sequence, render-owner sample frame,
  play state, transport tick, PPQN and meter. Field history uses sample time and
  event attacks retain their observed age, including while transport is stopped.
  Older hosts fall back to production `status` (`master_tick` or `tick`) at
  96 PPQN and four beats per bar. The host's free-running `beat` diagnostic is
  deliberately not used to invent transport/downbeats.
- Rendered output MIDI supplies note-on velocity, note-off and available pressure
  for channels 1–4. This includes live play while stopped and sequenced notes,
  already transformed by HB. Those channels currently correspond to Root, Bass,
  Comp, Melody in the Joint fixture. They are not assumed to contain drums.
  Multiple quartets on the same output channels share visual voice identity.

The UI reserves four read-only watch keys within the existing 64-key subscription
and renders at the existing 40 ms refresh. There is no second connection, noise
generator, audio callback, host timer, automatic write, or external output.

## Artistic mapping

Hue is a wrapped angle with selectable turns through the color wheel and
shortest-arc smoothing. Scale/chord warmth is an explicitly artistic lookup:
Locrian/Phrygian/minor tend cool; Major/Lydian tend warm. Absolute key spelling
has no warmth effect. Blend mode uses 65% effective scale and 35% rendered chord;
unknown context falls back to the known component or the field alone. This is
not a claim that chord mood is universal or that key signatures cause mood.

Each of four MIDI voices has a spatial home. Degree mode adds circular scale-degree
motion plus a bounded register displacement; chromatic notes interpolate between
degrees. Unknown/custom scales use chromatic pitch class. Pitch mode maps register
horizontally; Voice mode leaves the center at its home. A normalized Gaussian
samples the four fixture coordinates. Chords overlap as a per-voice maximum;
different voices combine through a soft limiter, preventing chord density from
unboundedly increasing intensity. Small voice tint offsets add identity without
replacing the harmonic palette. Velocity controls attack, notes sustain, note-off
releases, and available aftertouch increases expression. Preview dimensions do
not represent physical beam angle or moving-head pan/tilt.

A downbeat gesture rewinds a bounded two-second history of actual field samples,
then catches up continuously in 340 ms. It affects lighting only. Four/eight/
sixteen-bar phrase rotation is optional and off by default. Phrase, break, and
arrival buttons audition structural gestures. Section change offers Arrival glow
(default), Rotate samples or Off, saved in the existing profile. Rotation works
for both spatial samples and output lanes. The cue timestamp is local
presentation time, not an audio clock.

Automatic section cues consume the existing production schema-1
`observation.structure` (`song_section`). A cue requires a consecutive visit in
the same arrangement epoch, with the new start matching the previous end and
observed within a quarter note subdivision (PPQN/4 ticks) of that boundary.
Same-entry song wraps count as visits; a changed forecast or `next.committed`
alone never triggers a cue. The UI distinguishes upcoming forecast/queued entries.
An actual terminal ending uses the gentle break dip. No arbitrary rest, fill or
Energy/Space meaning is inferred from scene number or note density.

Initial Play, reconnect/engine replacement, missing or malformed structure,
epoch changes, skipped visits, clock discontinuities and observations separated
by over 750 ms establish a baseline without replaying section gestures. One
accepted section gesture takes priority over a coincident bar-count gesture.
Older hosts retain manual cues and the existing downbeat/bar-count fallback.
This adds no subscriptions, engine writes, scheduler, Field generator or clock.

## Lifecycle and limitations

Duplicate event history does not retrigger attacks. Epoch changes, clock rollback,
transport seeks and sequence gaps clear held ownership. Reconnection takes a new
baseline rather than replaying attacks or structural gestures. Attacks/pressure
older than 750 ms are ignored; releases still clear ownership. Render event timing
is request-boundary precision, not sample-exact. Actor identity and render-time
live/recorded provenance remain unresolved in the shared host contract; output
channel is still the preview's documented four-voice approximation.

Releases and CC120/123 clear the affected voice, including release tails. Only a
newly delivered field renews freshness; unrelated messages and duplicate snapshots
cannot keep cached samples alive. Stale field data fades to black, and
blur/hide/disconnect clears expression. Blackout is immediate.

Palette, sample selections, spatial response and blackout persist under browser
localStorage key `harmonybus.lighting.v1`. A versioned profile is also included
in the existing session UI payload, so Save/Open and export/import carry it.
Older sessions without lighting leave the current profile intact. Invalid
profiles are ignored atomically; unavailable browser storage leaves a working
in-memory preview and a visible status. Reset restores defaults while preserving
blackout. No active notes, field history or transient cues are persisted.
Physical iPad timing and physical DMX behavior have not been tested.

For a future hardware path, keep this mathematical projection independent of
its Canvas display. A local bridge consumes the same fixture values and owns
DMX frames, fixture profiles, explicit addressing, output enable/blackout and a
watchdog. An iPad browser needs a browser-compatible local endpoint (e.g. secure
WebSocket); it does not directly send Art-Net UDP. A bridge on a computer, small
LAN device, or an independently validated Schwung service could forward Art-Net
or sACN to a DMX node. Exact RGB/RGBW/dimmer channel layout requires the fixture
manual. No bridge, USB/MIDI input adapter, Move deployment, or DMX transmission
is included in this increment. Hosted HTTPS → LAN security/routing also needs
validation; the private hosted page is not itself a LAN DMX bridge.

## Verification

`node --test dev/local/lighting-test.mjs` covers decoding, hue seams, tonal
invariance, Gaussian normalization, pitch/voice positioning, live notes while
stopped, pressure/release, replay deduplication, gaps, stale input, blackout,
channel panic, bounded downbeat history, clock/epoch resynchronization,
meter-aware boundaries, delayed events, profile validation and persistence failure.

After the normal full Wasm build:
`node --test dev/wasm/full/lighting-test.mjs` runs two compiled production hosts,
compares exact output MIDI and saved state with and without lighting reads,
checks that display polling never advances the field, and verifies live melody
note ownership and release while stopped. Existing full host tests remain gates.

### Voice identities

The collapsed **Voice identities** controls set each output channel's lighting
strength (0–100%) and home corner independently. Defaults preserve the existing
Root/Bass/Comp/Melody appearance. Zero strength removes only that channel's visual
note contribution; Perlin ambience, MIDI holds, audio and release processing
continue. Restoring strength during a held note shows its current sustain rather
than replaying its attack. Home changes anchor degree motion and voice-only mode;
pitch mode retains its horizontal pitch mapping and uses the home's vertical side.
Settings travel with the existing browser profile and `ui.lighting` session data;
older profiles receive the original defaults. Labels describe output channels
1–4, not exact track ownership; tracks sharing a channel share a visual identity.

### Playing-surface monitor

A compact four-fixture square beside the clip cards displays the same RGB frame
as the full Lights panel while pads remain available. Its held-note count,
blackout and waiting labels come from that same projection. Tap it to open Lights.
The existing 40 ms presentation update drives both views; no extra engine reads,
subscriptions or clocks are added. The full canvas skips drawing while its panel
is hidden. The monitor retains fixture order 1/2 above 4/3.
