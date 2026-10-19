# Grid Sequencer — hbclean.199 / HarmonyBus 0.2.276

Tap Session to cycle Clips → Normal Play → Motif Play → Joint Play → Grid Sequencer.
Track buttons retain their normal track-selection meaning. Each track saves 32 row
assignments; changing a row assignment changes which existing events it displays,
not the pitches or operations stored in the clip.

Move shows four rows and eight time divisions. Launchpad X shows eight rows and
eight divisions. Pads toggle events on release; Shift + pad or a hold of 350 ms
focuses the row/cell without toggling it. Move arrows page time; +/- scroll lanes.
Launchpad top arrows scroll its own viewport; its fifth top button toggles Follow,
and its sixth cycles time divisions (the remaining two are reserved in this mode). Manual time navigation disables
Follow. The grid page's Follow knob restores following on Move. Each page advances
by eight divisions. A dim playhead column sweeps through the cells; occupied cells
retain track color and become white under the playhead.

The overview uses the shared Schwung controller: K1–4 assign the four Move rows,
K5 selects 1/16, 1/8, 1/4, 1/2, or one-bar divisions, K6 selects time page, K7 selects
lanes, K8 controls Follow. Jog navigates the existing settings pages. Focus a pitch
cell to use the existing step parameter editor (velocity, gate, probability,
condition, invert). Back returns to the overview. Focus an operation row to select
its existing operation slot and settings panel. No operation is activated merely
by focusing its panel.

Assignments are MIDI input pitches 0–127 (also sample/drum addresses) or existing
operation slots 1–16. Defaults include eight melodic rows, the sixteen operation
slots, and eight drum pitches. Input pitches stay pre-HarmonyBus. A pitch cell is
an onset; consecutive pitch cells retrigger. Adjacent operation cells form a
continuous hold. Empty cells release the scheduled contribution, leaving physical
holds and the operation's independent Auto setting intact. Turn Auto off if only
the grid should activate that operation.

Operation settings and motif content remain shared with the other modes. Assign
Play Motif to an operation slot and configure its existing motif/arrival settings.
A rising scheduled gate can launch that motif against a currently held target;
with no held target it waits for an input while the gate is active. Already
scheduled motif notes follow the existing motif lifetime rules. Adjacent lit cells
do not retrigger a motif; separate them with an empty cell for another rising gate.
A future target must be chosen before an approach that is meant to lead into it.

The sequencer owns playback even with this editor closed. Save/reload, whole-clip
copy, double, delete, and undo use the existing clip store. The ordinary step-row
note/automation tools retain their meanings; partial step-copy is not an operation
lane clipboard. New note cells stay inside the clip's loop; create a longer clip
through the existing Clip Params/Loop controls.

## Remote UI handoff

The ordinary remote Move screen/pad surface uses the same Grid Sequencer mode.
The larger browser piano roll is a separate UI deliverable, not included here.
It must reuse `gridPad`, `gridNavigate`, row assignments and the sequencer edit
commands, rather than creating a second player or a browser timer for operations.

`gtog track tick division assignment velocity` is an undoable edit command.
Assignments 0–127 address input notes; 128–143 address operation slots 1–16.
`gview 0|1 start division row0 ... row7` requests bounded occupancy for an existing
Move/Launchpad viewport (unused rows use 65535). `gview 1` enables those snapshots;
`gview 0` disables them. `grid=` in status is surface-tagged and follows `trk=`.
A future independently sized browser viewport should extend this query schema;
full note durations and exact off-grid starts should come from the canonical clip,
not be reconstructed from the occupancy cells. Settings remain metadata-backed
Schwung panels. The browser editor should show a piano-roll region plus named
operation lanes on the same timeline and share the existing undo path.

Physical Move/USB response and audio must still be checked on the user's device.
