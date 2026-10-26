# Smart approaches — Movy hbclean.268 / HarmonyBus 0.2.303

Harm Play bank assignments now include **Smart Below** and **Smart Above**.
Choose either as the operation for an approach row or bank gesture.

Smart Below prefers Leading Tone; Smart Above prefers Upper Dim. When that side
already belongs to the target scale and the other side supplies a missing
chromatic pitch, the selector switches sides. It chooses the complete operation,
including its harmonic meaning. LT remains distinct from Connector Below and
its configurable connector quality.

For example, in A harmonic minor either Smart choice gives F-sharp above F and
G below G-sharp, providing both missing pitches inside the augmented second.
Preview uses the same selection as live input. Recordings store the resolved
relative LT or Upper Dim operation, so editing the bank later does not alter them.

This release centralizes operation identities and menus across HB and Movy,
preserves existing saved IDs, and fixes previews for Secondary Fifth and the
II/IV/VI dominant variants. It also includes the previously released A/B Fill
memories and Chord Play UI performance improvements.

These Smart choices currently belong to the Harm Play bank/rows. Adaptive
authored motif steps, ordinary operation lanes, and new selectable eight-note
input presets remain follow-up work. Existing six-note pad wrapping is retained.

The shared design and development plan lives in
[HarmonyBus](https://github.com/douglasmason/harmonybus/blob/main/docs/relative-operations.md).
