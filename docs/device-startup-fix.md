# Device startup fix — Movy 0.34.1-hbclean.253

Fixes a load-time JavaScript dependency cycle introduced with the conductor
shortcuts in Movy 251 and inherited by 252. Schwung displayed "Failed to load
tool" because the device bundle read its motif choices before initialization.

The immutable motif catalog now has no controller dependencies. The musical
choices, clips, settings and native engine remain unchanged. Update Movy through
Schwung Manager and reopen it; HarmonyBus stays at 0.2.295.

The package workflow now evaluates the actual device UI bundle in Schwung's
pinned QuickJS runtime before publication. It checks callback registration with
the shared UI library present and with the optional library unavailable. This
covers the device bundle's evaluation order, which the split browser-module
tests did not exercise. Physical Move confirmation is still required.
