# HarmonyBus-Movy clean restart handoff

Branch: `clean-hb`
Upstream base to clone/build against: `DimaDake/schwung-movy@5c01a4fe7745b730ee98111194fc64328ea2659b`

## Why this branch exists

The hb.14-hb.19 line accumulated interacting patches around host-mode, fresh-set initialization, capture/record, transport, and parameter peeks. We are intentionally not carrying that patch stack forward.

The target design is a small dedicated Movy build with preloaded HarmonyBus and native transport follow. Standard Movy sequencing, recording, capture, clips, instruments, and timing should remain stock unless a requirement below proves otherwise.

## Core architecture

There are two distinct track namespaces:

- Native Move/Schwung tracks 1-4: audible render destinations. They are outside Movy's 16-track source bank.
- Movy tracks 1-16: content/source tracks hosted by Movy.

Do not conflate these namespaces. Do not special-case Movy tracks 1-4 as native tracks.

All 16 Movy tracks must remain Movy-hosted chains.

## Fresh-set defaults

Every fresh Movy Set starts with HarmonyBus in `midi_fx1` on every Movy track.

Use four identical quartets:

| Movy track | HB role | Render To Ch |
|---|---|---|
| 1 | Conductor | 3 |
| 2 | Follower | 2 |
| 3 | Follower | 3 |
| 4 | Follower | 4 |
| 5 | Conductor | 3 |
| 6 | Follower | 2 |
| 7 | Follower | 3 |
| 8 | Follower | 4 |
| 9 | Conductor | 3 |
| 10 | Follower | 2 |
| 11 | Follower | 3 |
| 12 | Follower | 4 |
| 13 | Conductor | 3 |
| 14 | Follower | 2 |
| 15 | Follower | 3 |
| 16 | Follower | 4 |

Hosted Movy-chain MIDI enters HB on MIDI channel 1, so fresh HB instances should use Source Ch = 1 rather than Auto.

Every Movy track starts with its LOCAL AUDIO muted while MIDI/sequencing remains live. Muting must not disable HB processing or outbound rendered MIDI.

A simple default synth may remain in the chain for source monitoring/recording, but local audio starts muted.

## Persistence rule

Defaults are for fresh Sets only.

After creation, saved HB state belongs to the user. Do NOT forcibly normalize role/render/source on every load. Do NOT add a recurring self-heal/reconciliation pass that fights user edits.

Existing Set loads should preserve ordinary Movy chain persistence exactly as upstream does.

## HarmonyBus core behavior already desired

These belong in HarmonyBus itself, not Movy glue:

1. Conductor `Render To Ch` sends a pass-through copy of conductor notes for monitoring while conductor analysis still runs.
2. Changing HB Role among Off / Conductor / Follower flushes note-offs for any voices HB may still be sounding before clearing old role state.

## UI ownership

When the focused component is a Schwung-compatible module such as HarmonyBus:

- use Schwung PAGE rendering for its parameter page;
- use Schwung knob-turn handling;
- use Schwung's transient TURNING peek;
- do not open/draw Movy's enum/list peek/editor for the same knob;
- do not send knob touch/release into Movy's enum overlay path while Schwung owns the page.

Expected result: one responsive Schwung peek, no stale/full Movy overlay, normal knob indicator remains useful.

Do not globally disable peeks. The useful Schwung peek should remain.

## Recording and Capture

Keep stock Movy behavior.

Do not patch `live_note_on/off`, record bookkeeping, fast pad routing, clip timestamps, Capture buffers, or note timing merely to support HB.

HarmonyBus must behave as a normal MIDI FX in the normal hosted chain. If a later device test demonstrates a specific recording/capture incompatibility, diagnose that exact seam before changing sequencing code.

## Transport

Native Move transport is authoritative.

Use Movy's existing external MIDI realtime path (`0xFA` Start, `0xFB` Continue, `0xFC` Stop, `0xF8` Clock). The dedicated build should default transport linking ON.

Minimum required behavior:

- Native Move Play starts Movy.
- Native Move Stop stops Movy.
- Movy follows native tempo/clock/bar alignment through the existing upstream mechanism.

Do not invent a second transport implementation.

Movy -> native Move Play/Stop is optional initially. Only enable reverse control if upstream's existing `MoveInject` capability path is proven safe on this host. One-way native->Movy sync is acceptable for the first clean build.

## Native destination assumptions

Typical user setup on native Move/Schwung side:

- native track 1: drums / unrelated
- native track 2 receives MIDI ch2
- native track 3 receives MIDI ch3
- native track 4 receives MIDI ch4

Do not insert HarmonyBus into native tracks as part of this project.

## What NOT to carry forward from hb.14-hb.19

Do not copy these mechanisms unless independently re-justified:

- host-mode flips that treat Movy 1-4 as native/Schwung tracks;
- load-time forced normalization of saved HB state;
- Capture-only or Record path injections;
- fast-pad `live_note_on/off` changes;
- engine-ready HB reconciliation/self-healing loops;
- multiple sequential patch scripts whose assumptions depend on previous patch scripts;
- global peek suppression.

## Preferred implementation shape

Keep the clean integration to roughly three isolated changes:

### A. Fresh-set template

Patch the fresh-set chain seed so all 16 Movy tracks are created with:

- `midi_fx1 = harmonybus` with quartet-specific initial state;
- normal/simple synth as appropriate;
- local chain mix muted.

This should happen through the same durable chain document/persistence mechanism upstream Movy already uses, at the correct set-lifecycle point, rather than an after-the-fact repair.

### B. Schwung page ownership

A small routing/rendering change that says: if a Schwung page owns the focused component, Schwung receives knob turn/touch/release and renders the param page/peek; Movy's enum overlay does not activate.

### C. Transport default

Set the existing Movy transport-link behavior on by default for this dedicated build. Prefer stock `on_external_realtime` behavior.

## Required tests before device install

1. Fresh-set chain fixture proves all 16 tracks contain `midi_fx1:harmonybus`.
2. Fresh-set HB-state fixture proves quartet mapping exactly:
   - 1/5/9/13 conductor->ch3
   - 2/6/10/14 follower->ch2
   - 3/7/11/15 follower->ch3
   - 4/8/12/16 follower->ch4
   - Source Ch 1 on all 16.
3. Fresh-set mix fixture proves all 16 local chain outputs start muted without sequencer mute.
4. Save/reload test proves a manually edited HB role/render setting survives unchanged.
5. UI test proves Schwung page/peek active and Movy enum editor inactive for hosted HB.
6. Existing upstream normal Record tests remain unchanged and pass.
7. Existing upstream Capture tests remain unchanged and pass.
8. Transport test: external `0xFA` starts and `0xFC` stops Movy with link default enabled.
9. Build/typecheck/ARM64 DSP packaging passes.

## First device acceptance test

Create a brand-new Set and inspect Movy tracks 1-8 before touching settings:

- HB appears in MIDI FX 1 on every inspected track.
- Track 1 Conductor -> ch3; 2 Follower -> ch2; 3 Follower -> ch3; 4 Follower -> ch4; 5-8 repeat.
- all source tracks show locally muted.
- playing conductor/follower pads produces HB panel activity and rendered MIDI while local source audio remains muted.
- Schwung peek appears; Movy peek does not.
- ordinary Record and Capture behave exactly like stock Movy.
- native Move Play/Stop controls Movy.

Only after that passes should we test all 16 tracks and persistence.

## Repository/release policy

Keep the old hb.19 tag as reference. After publishing and verifying the clean release asset, advance `main` to the tested clean commit so Schwung's repository installer can read its `release.json`.
Develop clean integration on `clean-hb`.
Use a new release series/name (for example `0.34.1-hbclean.1`) so device installs cannot be confused with hb.14-hb.19.
