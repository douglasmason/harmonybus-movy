# Copy Queue to Conductor Clip

Movy **0.34.1-hbclean.318** and HarmonyBus **0.2.312** add the actual instant
clip writer behind the existing contextual Copy button.

1. Complete a queued progression in Chord Play or Joint's chord-bank surface.
2. Press **Copy**. The picker shows the conductor, chord count, duration and
   first empty destination. Step keys **1–8** are its eight clip slots.
3. Tap an empty slot, or turn **Jog** and click it, to save. **Back** or **Copy**
   cancels. Occupied slots are protected, including created-but-empty clips.

Copy saves immediately without waiting for a realtime recording pass. The live
queue continues unchanged and melody focus stays put. **X/K8 Harmony Off** is
still the explicit live-queue release. Use ordinary Clips controls to play the
saved progression. Copy does not automatically launch it or transfer playback.
Undo/Redo affects the copied clip through the existing edit history.

The writer reads the native retained chord descriptors, including parent scale,
intent, range and inversion, and stores one abstract selection per chord using
Movy's existing recorded-action encoding. It does not reconstruct mutable bank
slots or bake generated chord voices into MIDI notes. Current native Queue Time
boundaries determine the saved durations; Observed uses the existing learned
schedule, including its one-bar fallback when no proven timeline exists.

Copy requires a completed phrase and an empty conductor slot. Recording/count-in,
changed queue contents or rhythm, a changed Set/focus, occupied or launching
destinations, and malformed exports are rejected before writing. Existing clips
support at most **16 bars and 512 notes**; longer queues stay intact and Copy
reports the limit. Durations must fit integer PPQN96 ticks and the full loop
must fit Movy's 1/16-note length grid; no silent rounding or truncation occurs.

The native getter is bounded and allocation-free. Inspection and saving happen
only on explicit Copy actions, through the existing host parameter/command path;
clip construction and Undo retain their existing edit-time allocations. No new
continuous feedback poll or playback engine is added. This release preserves
the borrowed parameter-reply path from .317; desktop tests are not hardware
latency measurements.

Verification covers native export identity/read-only behavior, malformed and
oversized exports, atomic empty-slot writes, stale/occupied rejection, melody
focus and clock preservation, modal input releases, Undo/Redo, save/reload, and
real HB → Schwung chain → Movy playback with original chord ranges and balanced
note releases. Existing native, shared-controller, audio-chain and ARM package
checks remain required for publication.

Install/update both `douglasmason/harmonybus` and `douglasmason/harmonybus-movy`.

An explicit **Copy + handoff** choice is now available via Step 9 in the picker; see [handoff behavior](queue-handoff.md). Ordinary Copy remains save-only.
