# Movy 0.34.1-hbclean.300 — automation recovery across all tracks

Parameter-cache recovery still rejected tracks 5–16 with an old four-track
guard. A newly assigned lane on track 5 therefore received zero recovery reads,
while the same lane on track 1 received six. Restoring saved lanes and repairing
lost chain mappings also failed to schedule this existing recovery window.

Recovery now uses `TRACK_COUNT` and the existing bounded, component-deduplicated
warm path. Newly restored chain targets and repaired mappings schedule that same
window. Repeated label synchronization with unchanged targets does not restart
it. Reset and lane removal leave no stale host reads behind.

One target classifier in the existing lane-mapping module identifies parameters
with chain mappings and metadata caches. Mixer fields and abstract generator
controls are excluded from cache reads, completion diagnostics and chain-map
repair. Their own assignment and restore routes remain intact. This removes
irrelevant host work instead of adding another recovery subsystem or timer.

## Host evidence

Exact Schwung 1.7.3 (`a6f7ec9`) and 1.8.2 (`35f401c`) sources retain the same
`chain_params.c` and `chain_midi.c` behavior here. `knob_find_param` checks cached
metadata; `find_param_by_key` can refresh missing runtime `chain_params`.
`chain_host.c` routes `knob_N_value` through the latter, while mapping assignment
and incoming absolute CC use the former. A mapping alone is therefore not
evidence that its dynamic metadata is available. No host-version branch or
Schwung modification is needed.

Schwung's native song-data/p-lock recovery remains separate from Movy's lanes
targeting host component parameters and from abstract musical clip automation.
This change does not rewrite recordings, saved lane identities or clip data.

## Verification and limits

The regression first reproduces zero reads on track 5. It then checks all 16
tracks, six reads per component over the existing 96-tick window, one read per
component per stride, mixed mixer/generator/instrument lanes, saved-label
restore, mapping repair, unchanged-sync idle behavior, removal and reset.
The suite runs with both pinned host sources alongside the existing browser,
native production-chain, QuickJS and ARM-package checks.

The finite recovery window and slow mapping-verification cadence are unchanged;
this is not a guarantee for an arbitrarily long module load. Hardware latency
and crackling require measurements. No physical Move is installed or upgraded,
and browser connectivity, transport UI and the private trial audience are unchanged.
