# HarmonyBus Movy

Dedicated Movy build with HarmonyBus preloaded on all 16 Movy source tracks.

This package preserves Movy's module id (`movy`) so installing it temporarily replaces the standard Movy module. HarmonyBus remains a separate installed Schwung module.

Every brand-new Set contains HarmonyBus in MIDI FX 1 and a Plaits monitoring synth on each Movy track. The tracks form four identical quartets:

| Movy tracks | HB role | Render To Ch |
|---|---|---|
| 1, 5, 9, 13 | Conductor | 3 |
| 2, 6, 10, 14 | Follower | 2 |
| 3, 7, 11, 15 | Follower | 3 |
| 4, 8, 12, 16 | Follower | 4 |

Source Ch is 1 on every HB instance. All 16 local audio outputs start muted; sequencing, HB processing, and rendered MIDI remain active. Schwung owns hosted parameter pages and transient peeks. Native Move transport follow starts enabled.

Native Move tracks are separate from Movy's source bank. Set native destination tracks 2-4 to receive MIDI channels 2-4 respectively.

Defaults apply only when creating a brand-new Set. Reopening a saved Set preserves its chains and manually edited HB settings.

## Install

Install from the repository URL in Schwung's GitHub/repository installer:

```text
https://github.com/douglasmason/harmonybus-movy
```

The clean release reports version **0.34.1-hbclean.20**. HarmonyBus must also be installed separately. After updating Movy, reload the module and create a brand-new Set to check the prepared layout.

The clean release counter starts at 20 so Schwung's numeric version comparison recognizes it as newer than hb.19.

`main/release.json` is the installer entry point. Publish and verify the clean release asset before advancing `main` to a tested `clean-hb` commit. Historical hb.16-hb.19 build workflows are manual so updating the installer entry cannot republish an older package.

This is an experimental hardware-test build. Reinstall standard Movy to restore the upstream module.
