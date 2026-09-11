# HarmonyBus Movy

Dedicated experimental Movy build for HarmonyBus virtual source tracks 5-8 on Ableton Move.

This package preserves Movy's module id (`movy`) so installing it temporarily replaces the standard Movy module. HarmonyBus remains a separate installed Schwung module.

Default layout:

- Track 1: native drums
- Tracks 2-4: native Move render destinations
- Track 5: HarmonyBus conductor source
- Track 6: HarmonyBus follower -> MIDI channel 2
- Track 7: HarmonyBus follower -> MIDI channel 3
- Track 8: HarmonyBus follower -> MIDI channel 4

In Session/Clip view, +/- switches between native tracks 1-4 and HarmonyBus source tracks 5-8.

Source-track mute on 5-8 is audio-only: the local source instrument is muted while MIDI continues through HarmonyBus.

## Install

Install from the repository URL in Schwung's GitHub/repository installer:

https://github.com/douglasmason/harmonybus-movy

This is an experimental hardware-test build. Reinstall standard Movy to restore the upstream module.
