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
