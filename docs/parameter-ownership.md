# Parameter page ownership — Movy 0.34.1-hbclean.279

Opening Set Parameters, Clip Parameters, Settings, CPU or Backups now gives that
page the screen, knob touches/turns, jog and Back during Chord, Joint, Grid and
Field Play. These pages share the existing parameter-page ownership decision.

Pads and the musical step row retain their performance behavior. Arrows still
shift melodic pad position or navigate Grid time, according to the active mode.
Held notes retain their onset pitches. The physical touch ledger also retains
parameter-page releases across page changes; settings touches do not schedule
performance preview work. Field output holds release to their original owner. Cancelling for host handoff
discards uncommitted Set and Clip scale previews.

Back leaves the parameter layer in one press, including when it was opened over
master detail. Back first cancels an armed Backups restore confirmation. Jog
click retains the Clip edit and CPU diagnostic actions, opens Backups from its
Settings row, and does nothing on non-action Settings rows or Set Parameters.

CPU and Backups turn off both knob LED addresses. Other pages show their own
editable controls. Leaving a parameter page restores performance illumination;
Chord and Field painters establish their own neutral control colors. Skipped
knob writes request another frame within the existing MIDI budget. Settled
frames retain their caches and emit no redundant knob packets. Pad writers keep
their independent cadence. Hidden parameter-bank value polling remains paused,
while model lifecycle checks and queued edits continue.

Install Movy **0.34.1-hbclean.279** through Schwung Manager from
`https://github.com/douglasmason/harmonybus-movy`, then restart. HarmonyBus remains
**0.2.307**; no host or native musical-engine changes are required. The temporary
Comp Generator, hbclean.278 generator overdubbing, parent-key/pad-position work
and hbclean.277 responsiveness changes are included.

Verification exercises 20 physical MIDI mode/page combinations against the real
app renderer and LED writers, plus note/touch releases, sibling and master-detail
return, Backups confirmation, busy-frame LED retry, hidden-bank polling and idle
knob packet counts. TypeScript, the browser/controller regressions, QuickJS
startup and ARM package verification run before publication. Physical button
feel, LED appearance and listening on Move remain device checks.
