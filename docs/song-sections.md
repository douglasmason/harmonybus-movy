# Song Sections

Song Sections extends Movy's existing Scenes/Song mode. One sequencer still
owns the transport, bar boundaries, launch queues, clip phase and note gates.

## Try existing Song mode first

1. In Session view, hold **Loop** and press step buttons **1, 3, 5, 7, 9, 11,
   13, 15** to choose scene columns 1–8.
2. The first scene press in a hold starts a new song; subsequent presses append.
   Adjacent repeats extend that scene without restarting its clips.
3. Release Loop. The engine plays the chain and loops it. Play restarts at the
   beginning; Stop retains the song. Manually launching a clip clears the song.

An ordinary scene lasts as long as its longest clip, rounded to whole bars.
It launches the column across all 16 tracks; empty slots stop their tracks.
A wholly empty legacy scene is an ending: clips stop, the song parks there,
and transport remains running. Existing songs retain these defaults.

## Shape a section

Build the scene chain, stop transport, then open **Joint Setup → Song Sections**.
The same production panel serves Move and a browser host built from these sources.

| Control | Meaning |
| --- | --- |
| Entry | Raw scene press in the song, counted from 1. The panel exposes the first 128 presses. |
| Bars | Auto, or 1–256 bars independent of donor clip lengths. |
| Track | Physical Movy track 1–16, independent of the selected Joint quartet. |
| Transition | Scene, Keep or Stop for that track when this entry starts. |
| Recipe | Section separates this occurrence from adjacent identical scenes. Legacy removes its settings and restores repeat folding. |
| Edit State | Shows whether transport must stop before editing. |
| Now / Next | Current occurrence and upcoming occurrence; Next distinguishes forecast from queued. |
| Scene | The selected entry's scene column, available in the parameter list. |

Changing Bars or Transition creates an explicit section. It applies to that
occurrence, without copying clips. An explicit section is one entry even beside
the same scene; other adjacent unconfigured presses still fold as before.
An explicit section on an empty column is a timed rest, with Auto meaning one
bar. It does not become a legacy terminal ending.

**Scene** launches this column's clip, or stops the track if that slot is empty.
**Keep** carries the currently playing clip, selection, phase, playback scale and
cycle across the transition. **Stop** stops the track at the boundary using the
existing gate-release path. On a fresh Play, Keep starts that track's selected
clip from its loop start, so it also works after save/open. Keep does not start
an already stopped track during a running song.

For example, make entry 1 eight bars and entry 2 four bars. On entry 2, set the
three-bar pitch donor and four-bar rhythm donor tracks to Keep. Keep the woven
actor too if its own clip must continue. Other tracks can launch the new scene.
The donors retain their independent phases; the section length does not become
their longest duration or least common multiple. The initial entry must start
the required donor clips, either with Scene or with Keep's selected-clip behavior.

Keep preserves source availability; it does not mute audio. Use the existing
chain audio mix for an inaudible donor. Sequencer mute/Stop can make that donor
unavailable, and Source Weaving's existing fallback rules then apply. This
increment does not invent a separate actor mute or rewrite donor routing.

Recipe edits use the existing save/autosave and Undo paths. They require stopped
transport, including any pending transport start. Undo of an unrelated edit
retains the running song cursor and queued launch. Restoring a different song or
recipe through Undo while playing restarts the restored song at the next bar.
Host clock re-anchoring restarts the current occurrence's countdown and clears
its previously armed successor. Ordinary Play still restarts entry 1.

## Browser and lighting contract

These are production `host_module_get_param` reads, available through the normal
native/Wasm parameter adapter when it uses this source revision. They do not
advance clocks, infer attacks or create another scheduler.

`song_section` returns JSON schema 1:

```json
{"schema":1,"epoch":4,"visit":2,"tick":3073,"ticks_per_bar":384,"playing":true,"editable":false,"started":true,"count":3,"current":{"index":1,"scene":2,"repeats":1,"bars":4,"start_tick":3072,"end_tick":4608,"terminal":false},"next":{"index":2,"scene":3,"committed":false}}
```

All indices are zero-based. `index` is the raw press index, stable under append
and recipe edits. `epoch` changes on load/new-song/transport re-anchor;
`visit` increments at each section boundary, including a one-entry song wrapping
without relaunch. Treat `(epoch, visit, current.index)` as traversal identity
within one engine lifetime. Reconnecting or replacing the engine requires a new
baseline; these IDs are not globally unique or persisted section UUIDs.

`current` is null without a song. `start_tick`/`end_tick` are null when stopped or
before the first queued scene lands; terminal entries have no end. `next` is null
when stopped, awaiting the first scene, terminal, or songless. Otherwise it is a
forecast until `committed` becomes true in the last bar. The boundary is
`current.end_tick`. Forecasts may change as the user appends scenes. The legacy
song-building append behavior remains authoritative even after an arm, so clients
must resynchronize rather than scheduling an independent musical action from
one old snapshot. Manual launches/recording can override individual track queues.

`song_section_<index>` returns `index scene configured bars track-digits`, or no
value for a missing entry. There are exactly 16 digits: 0 Scene, 1 Keep, 2 Stop.
This read describes saved settings, not a claim that a donor is available.

Commands through the existing `cmd` batch are:

```text
songsection <index> enable
songsection <index> bars <0..256>
songsection <index> track <0..15> <0|1|2>
songsectionclear <index>
```

Use the ordinary Undo grouping for edits. Targeted commands avoid UI-side
read/modify/write races. Unknown/out-of-range/malformed values are inert.
Persistence adds optional `ss1 <index> <bars> <16-digits>` lines after the existing
`sg` line. Old saves require no migration. Older builds ignore `ss1` and thus
cannot retain recipes when re-saving; open recipe-bearing Sets in this build or
newer. The engine status adds `section=position:repeat-count:terminal` so the
existing Song band highlights split repeats and timed rests correctly.

This is a section observation, not a replacement for live/recorded note events,
Field samples or harmonic observations. Lighting's live note time basis remains
separate from stopped transport. The browser session owns pin refresh and site
deployment; this PR does not imply the current private trial already has it.

## Verification and remaining work

Native tests cover explicit durations, same-scene occurrences, three-/four-bar
woven donors on the real audio clock, scaled phase/cycle retention, Stop releases,
timed rests, legacy repetition/endings, strict inputs, save/open, Undo, host clock
re-anchor, observer neutrality and the DSP parameter bridge. Browser tests use
the real shared Schwung controller for the new knobs, Undo grouping, read-only
fields and Song status parsing. Existing core/DSP and browser logic suites remain
part of CI, together with production-chain audio and ARM packaging.

Future increments: live Hold/Next cues, audible actor participation independent
of donor playback, per-section Energy/Space, explicit channel-1 drum ownership
and fills, then arrangement proposals that write these same recipes. No new
drum scheduler, automatic song generation or physical device deployment is part
of this increment.
