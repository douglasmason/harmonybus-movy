# Field sources with stock Schwung

HarmonyBus and Movy provide two Field modulation routes per Movy-hosted track
without changing Schwung. In the existing LFO panel, select Field 1–16 from the
Shape control, choose a synth or audio-effect parameter, and set depth/polarity.
The channel's existing Field position and live output override supply its value.
Rate, sync, phase and retrigger controls are hidden for Field sources because
the shared Field controls their movement. Returning to a stock waveform restores
those oscillator controls. Assignments persist with HB state and Movy's existing
LFO state. Fresh and legacy sets default to stock oscillators.

## Supported boundary

Only Movy-hosted chains that receive the extended pre-render block message
advertise the capability. Unmodified host-owned tracks and the master panel do
not show Field sources. Supported destinations are the same chain's exposed
synth and audio FX parameters; MIDI FX, sends and LFO-to-LFO are excluded.
Installing HB alone does not expose this feature in stock Schwung's own LFO UI.

The same stock modulation API performs range scaling and preserves parameter
bases. Per-instance callback ownership and unique route IDs isolate tracks and
allow both Field routes to address one parameter independently. Disabling,
retargeting, resetting or unloading removes only the corresponding contribution.

## Clock and bypass

Movy's existing conductor block message is extended with the chain's actual HB
bypass flag. One allocation-free read observes stock-chain bypass because the
stock host does not notify a bypassed MIDI effect. The first block message
advances Field once; subsequent instances and their render ticks do not advance
it again. Bypassed and idle chains still receive that message. Route service runs
before parallel chain rendering, so tracks read the same Field time.

Bypass clears contributions but retains assignments. Unbypass resumes them.
The next block performs cleanup, including bypass changes received outside the
LFO panel. There is no background thread or host ABI extension. A route restored
without the managed block service remains dormant.

## Verification

`bash scripts/test_stock_field_host.sh /path/to/schwung` compiles the real stock
chain and HB DSP with synthetic synth/FX parameter probes. The source pin is
Schwung v1.7.3, `a6f7ec9e5cf4d0df172a1dbc00b29d0b5eb67124`.

`stock_field_clock_test.c` verifies once-per-block time, bypass of both instances,
owner removal, two-route state round trips and legacy state defaults. The Movy
full-chain fixture verifies the real adapter, two simultaneous contributions,
bypass/resume, unload/reload, state restoration and return to stock waveforms.
UI tests cover capability gates, channels, target filtering and unused controls.
These are software tests; no physical Move was deployed or tested.

## Routing overview

In Field Play, **Shift + press the main encoder** opens Field Routes (terrain or
outputs view). Turn the encoder to browse assignments; press it to open the
existing LFO page for that exact track and slot. Back returns to Field Play.
Pad output overrides remain playable in the overview; knobs do not edit hidden
settings. Shift + Back / Shift + pad clear gestures remain available in the
normal output view.

The display shows the Field channel and normalized effective output, track/LFO
slot, destination parameter, depth, polarity, enabled/HB-bypass state, and
**base → effective** destination values. Values use the host's native units;
effective includes all modulation contributions to that target. `?` means the
readout is not available yet. “Enabled” describes the saved route configuration,
not proof that its destination accepted a contribution: HB 289's existing
`active` getter reports configuration, not callback success. No host change is
required. This increment does not change HB's route semantics.

The existing Remote UI mirror uses the same controller/display. `fieldSnapshot()`
now includes `routing: {version:2, open, scanned, total, selected, tracks, routes}`;
`showFieldRoutes()` and `openFieldRoute()` are exposed through the same production
UI globals. Browser/lighting adapters may consume these observations when they
integrate this revision; their separate deployments are not updated here.

Observations run only with the overview open, at most one bulk read every 125 ms
(up to 22 keys). The selected track alternates with a round-robin scan of all
16 tracks: approximately 250 ms selected refresh and four seconds for a full
background pass. `observedAt` is a per-track UI timestamp in milliseconds, not an
engine tick. The aggregate is not an atomic engine snapshot. Field sample values
remain in the existing `outputs` snapshot and retain its independent refresh.
Reads neither advance Field nor write parameters. Broken bulk replies are skipped
without per-key retry bursts. Unavailable reads retain last-known routes, visibly
marked Unavailable; a successful capability=0 read removes unsupported routes. Opening a new overview or switching sets clears the cache.


## Actual delivery and observation freshness (HB 290 / Movy 226)

The overview now shows Applied, Pending, Rejected, Unmanaged, Disabled, No target
or HB bypass using HB's additive `field_lfoN:status` observation. Applied means
the stock host accepted the last contribution, even at zero depth; it does not
promise audible change or that destination FX is unbypassed. Rejected is the
callback's failure result (for example, a missing parameter), not a guessed
diagnosis. The older `active` getter still describes configuration. HB289 remains
compatible and displays Enabled when delivery status is unavailable.

A failed/partial batch no longer erases existing routes. Schema2 adds per-track
attemptedAt, observedAt, state and freshness, plus per-route delivery/freshness.
Unavailable reads are marked immediately; observations older than five seconds
or from a future UI timestamp are Stale. These are UI timestamps, not musical
time. Numeric readouts are hidden and edit navigation is blocked while a route
is unavailable/stale. A successful fresh read restores normal display/navigation.
A valid shape change away from Field or capability=0 clears that track's routes.
Unknown tracks prevent an inaccurate 'No Field LFO routes' empty-state message.
Clock rollback clears observations. Closing the overview still stops polling.
Version2 consumers should explicitly check freshness before using cached values;
existing keys are retained, and no DSP timing/transport is inferred from polling.
