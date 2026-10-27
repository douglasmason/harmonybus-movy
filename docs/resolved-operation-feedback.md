# Resolved operation feedback — Movy hbclean.274 / HB 0.2.306

Update HarmonyBus to **0.2.306**, then Movy to **0.34.1-hbclean.274**.
Both packages are required. This pair includes Chord Discovery.

The performance footer now briefly shows the target, resolved relative
operation, and resulting note or chord. In A harmonic minor, for example:

- `F > UD F#dim7`
- `G# > LT Gdim7`

Smart Below/Above remain the assigned controls; the footer shows which concrete
operation they selected. LT keeps its diminished interpretation. Connector Below
remains a separate operation, displayed as CCB. Native note-spelling preferences
apply, and chord quality follows the generated voicing.

The paired HB update also fixes Smart conductor selection after a key change,
so source-key and destination-key harmony are not mixed during the choice.

The display reads cached native results through the existing pad snapshot, with
no additional polling or harmony calculation. Feedback lasts 1.8 seconds and
clears on plain notes, stop, or a track change. Scheduled motifs report their
steps as they play. The ordinary harmony footer returns afterward.

Bank labels, feedback labels and motif-to-clip labels now share the generated
operation catalog. The clip preview correctly calls Connector Below CCB instead
of LT. Motif-to-clip export continues to fix Smart choices when written.

See the [native contract and validation](https://github.com/douglasmason/harmonybus/blob/main/docs/resolved-operation-feedback.md).
