# Continuous sequence playheads

Status: hbclean.339 implements the first stage: independent Step/Linear numeric
automation readers on existing clock and source routes. See
[linear-automation.md](linear-automation.md) for shipped behavior. The additional
drivers, pitch glide and controls below remain a design, not released features.

An existing sequence can act as a shaped modulation curve or pitch path. Its
playhead need not advance one step per clock: an LFO, shared Perlin Field, or
pressure gesture can choose a fractional position. Each reader independently
chooses whether to hold step values or blend them. Sequence content, position,
value interpretation and note triggers remain separate.

## Controls and defaults

| Control | Choices | Default |
| --- | --- | --- |
| Position source | Existing clock, existing LFO, Field channel, pressure | Existing clock |
| Source role | Position or speed | Position for modulation sources |
| Read mode | Step, Linear, Smooth | Step |
| Window | Start and end within the existing sequence | Existing loop window |
| Boundary | Wrap, Bounce, Clamp | Existing wrap behavior |
| Slew time | Smooth sudden source jumps over time | Off |

Keep these settings with each existing playhead/reader, not with the shared LFO
or Field. Two readers can use the same Field channel with different windows and
interpolation. Do not introduce another sequence store, playback scheduler or
global set of eight always-visible knobs. Reuse the existing source panels and
show only controls that apply to the selected driver and destination.

Position maps a normalized source value into the selected window. A triangle LFO
scans forward and backward; a sine slows near the ends; Perlin wanders. Speed
instead integrates a signed rate against the audio/transport clock: zero freezes,
positive moves forward and negative reverses. A speed source needs explicit
depth/offset and reset semantics. Implement direct position first so its behavior
is easy to inspect and there is no additional accumulated clock state.

Pressure can use one pad's Z value or the weighted position of multiple pads:
sum(pressure * pad_position) / sum(pressure). Zero total pressure follows the
existing Momentary/Tap/Peak release policy; never divide by zero or invent a new
pitch on release. This turns the two-pad legato idea into another position source.

## Interpolation and slew are different

For fractional index `position`, let `left = floor(position)` and
`fraction = position - left`. Linear reading returns
`value[left] + fraction * (value[right] - value[left])`. Smooth can replace
`fraction` with the bounded smoothstep `fraction * fraction * (3 - 2 * fraction)`.
This avoids spline overshoot and needs only the two neighboring values.

Interpolation blends stored values across the sequence. Slew limits how quickly
the driver or resulting value changes over time. Linear reading alone cannot
remove a discontinuity from a square LFO or a jumping pressure position. Smooth
reading also eases at every stored point, which can sound like hesitation; Linear
should be the first continuous option, not Smooth by default.

Sparse automation must interpolate between actual surrounding locks at their
positions, rather than silently repeating each held step as a new control point.
Handle a single lock, empty lanes, trimmed loops and last-to-first interpolation
explicitly. Wrap connects the last point to the first; Clamp holds the endpoint;
Bounce reflects position. Position 1 must not unexpectedly wrap to the first
point when the selected mode is Clamp.

## Destination semantics

- Numeric automation: interpolate normalized values and apply the existing target
  descriptor/range. Keep discrete enums, boolean controls and commands stepped.
  The current lock/output route uses 7-bit values; fractional internal sampling
  does not by itself provide high-resolution or audio-rate parameter output.
- Pitch: retain fractional pitch until the destination policy. Offer discrete
  source notes, chromatic/parent-scale quantization, or continuous glide only
  when the destination can express it. Ordinary note-on messages cannot encode
  fractional pitch. Shared channel pitch bend moves every voice on that channel;
  independent polyphonic movement needs per-voice pitch ownership/support.
- Harmony: do not interpolate chord IDs, operation IDs or key-selection commands.
  A chord morph needs stable voice matching followed by interpolation of those
  voice pitches. Fourth/fifth walks and voicing expansion retain their musical
  semantics; they are not arithmetic on enum values.
- Triggers: keep the existing accepted rhythm attacks and gate owner. A noisy
  head crossing a boundary must not create extra attacks or lose note-offs.
  Continuous pitch changes should update an already-owned voice when supported.

Quantizing a continuous pitch reader produces discrete pitches by design; it
should not be labelled smooth legato. Retriggering chromatic notes is also a
different behavior from an uninterrupted pitch glide.

## Existing integration points

`integration/actor-source/source_route.rs` already stores independent pitch,
expression, instrument and HB-render sources. Its `AutomationPhase` currently
contains integer steps, and `fitted_phase` returns integer ticks. Add fractional
read position at the reader boundary while preserving the old clock/Step path
exactly for existing sets.

`source_automation.rs` reads `Clip::effective_at` and uses a phase watermark plus
the existing `auto_cur` value owner. Continuous readers need a bounded control
update cadence and fractional phase, not an unconditional full-clip scan per
audio sample. Reuse base restoration, mute/stop handling, source availability,
recording bypass and target-name matching. Update only changed output values.

`source_engine.rs::source_attack` already separates pitch selection from rhythm
and emits through `emit_clip_note`. Its current pitch selection is discrete and
occurs on accepted attacks. Add interpolation without bypassing source-key
mapping, destination harmony, expression, or the gate/note-release owner.

The existing HB Field advances once per managed block, and stock LFO/Field
parameter routing lives in `integration/field-lfo/field_lfo.rs`. Expose a bounded
read-only driver snapshot to sequencer readers. Do not copy Perlin noise into the
UI, advance the Field while rendering feedback, or create another oscillator
whose phase diverges from the selected LFO. Confirm an output-sampling seam for
the stock LFO before advertising it as a working sequence source.

## Implementation order and acceptance

1. Fractional reader with Step/Linear modes for numeric automation. Default Step
   must reproduce existing playback, persistence, Undo and source routing.
2. Direct Field/LFO/pressure position inputs using the existing shared clocks.
   Test identical source snapshots across track order and native/browser hosts.
3. Pitch-path sampling and destination-aware glide, with release/reset tests and
   explicit capability feedback. Keep unsupported glide unavailable.
4. Signed speed drive, bounded slew and optional Smooth reading once position
   semantics and output ownership are established.

Test forward/reverse reads, wrap/bounce/clamp endpoints, sparse/single/empty lanes,
trimmed loops, source loss, source changes, clock jumps, Stop/restart, reload,
recording/Undo, enum rejection and CPU/allocation bounds. Pitch tests must inspect
real emitted events and voice cleanup, including same-channel chords. UI polling
must never advance a head or emit musical events. No pad-feel or audio-quality
claim can replace a physical instrument play test.
