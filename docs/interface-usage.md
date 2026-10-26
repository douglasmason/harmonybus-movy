# Panel navigation and local usage reports — Movy 258

Field Play now opens its four Field panels. Its first knob edits Field Speed instead of an unrelated Normal Play parameter. Joint Play places source, expression, gesture, automation, preview and variation pages under their Root, Bass, Comp or Melody owner. Song Sections and Recording have separate groups.

The shared panel catalog owns group membership, playing order and stable identities. Normal Play has four main panels. Motif Play and ordinary Joint Play have nine, with motif banks before operation editors. Chord Play retains eight main panels and separates Conductor Content, Chord Editing and Conductor Settings; Melody settings are split by mapping, sound and operations. Grid keeps Window, Rows and Mapping in its main sequence. Existing controls and owner routing remain available. New uncataloged pages fall into Other Settings rather than silently expanding the main sequence. Shared-controller overflow pages retain distinct identities. Joint's Chord Knobs variant uses the same catalog.

Session opens a flat **View** selector. Back and the bounded settings-group list retain their existing behavior. Page numbers apply within the current group.

## Local interaction logging

Logging starts enabled in this release. Open **Session → HB Settings → Usage → Interface Usage**:

- **Usage Logging**: On/Off. This preference survives reopening Movy.
- **Save Usage Report**: Shift+touch queues an export.
- **Clear Usage History**: Shift+touch clears the current history and queues clearing both saved generations and the exported report.
- **Usage Status**: queued, saved, cleared or failed. Keep playback stopped and release the controls for at least three seconds to finish queued writes. A failed write retries after a minute.

The report is available through Schwung Manager's Files view:

`/data/UserData/schwung/movy-interface-report.json`

Normal saving is automatic, at most once a minute, only while transport and recording are stopped, with no observed held gestures and three seconds without UI input. Export and clear use the same stopped/idle gate. Two alternating verified generations preserve the prior good save if a write is interrupted. Closing Movy before an idle save can lose the unsaved tail. Clear overwrites both generations and the export; an already downloaded report is outside this action.

## What the report contains

Move's internal UI dispatcher observes completed knob touches, step/pad gestures, encoder bursts, selected buttons and navigation. Shared HB panels contribute stable panel IDs, groups and actor labels; view, selected track, Shift, playback and recording state accompany each event. Encoder detents are coalesced into bursts, with travel and reversal counts. Pressure, clock, audio, clip contents, chord/note values and external musical MIDI are not collected. An observed input or an unchanged navigation destination is not proof that the engine accepted or rejected an edit. An Undo entry means it was requested.

History is bounded to 512 recent events and 256 usage rows, with up to 16 session IDs per row. Older rows are evicted and the report records that count. Completed touches and turns are separate event types. Reports rank controls by accumulated preceding navigation, and include use counts, average navigation and session count, split by playing/recording context. These are review candidates, not proof of friction: repeated performance gestures may be intentional, and essential rarely used controls still matter. Group/menu and view transitions remain in recent events for path review.

Collection makes no parameter reads or network calls. Usage logging adds no timer, MIDI output or playback callback. Panel identity lookup is cached. Filesystem reads happen once at UI startup; writes use the existing UI tick after the stopped/idle checks.

The report is local. Download it and provide it in a development session to guide the next interface revision. Automatic remote synchronization and live layout changes are not implemented. The physical layout stays stable during performance.

## Validation

Real shared-controller coverage exercises Field Speed, catalog coverage across all performance views, category bounds, motif ordering, actor ownership and the Usage controls. Recorder coverage checks encoder aggregation, bounded memory, sessions, corrupt-file refusal, playback/recording/held-input write deferral, export, clearing and failed-save retry. The full performance controller suites, browser logic, QuickJS startup and production/native package workflow remain release gates.

## Audible range

Each Chord Play range encoder increment now applies immediately. HarmonyBus 298 also retunes held comp chords with Retrigger Held Off, preserving the current arp/rhythm gate and queue timing. Knob 8 still suppresses Harmony Off while being turned. No extra chord is enqueued or recorded.
