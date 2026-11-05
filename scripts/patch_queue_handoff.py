"""Connect explicit queue handoff to native deadlines and the existing clip player."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_queue_handoff(root: Path) -> None:
    """Install a cancellable one-shot transfer without a second sequencer."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/chord-play'
    path: Path = root / 'engine/crates/seq-core/src/engine.rs'
    path.write_text(path.read_text() + '\n' + (assets / 'queue-handoff.rs').read_text())
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source: str = path.read_text().replace('operation.split_whitespace().next() == Some("qcopy")', 'matches!(operation.split_whitespace().next(), Some("qcopy" | "qhandoff"))')
    source = replace_once(source, '    chord_copy_result: String,',
        '    chord_handoff: Option<(usize, usize)>,\n    chord_copy_result: String,')
    source = replace_once(source, '            chord_copy_result: String::new(),',
        '            chord_handoff: None,\n            chord_copy_result: String::new(),')
    source = replace_once(source, '    fn set_param(&mut self, key: &str, val: &str) {', '''    fn set_param(&mut self, key: &str, val: &str) {
        // Edits, Undo, explicit transport and source gestures cancel a pending
        // transfer. Undo finalization itself must not cancel the action it seals.
        if self.chord_handoff.is_some() && (key == "state" || key == "chord_queue"
            || (key == "chord_select" && val != "leave")
            || (key == "cmd" && val.split(';').any(|operation|
                !chord_handoff_preserves_command(operation)))) {
            self.cancel_chord_handoff();
        }''')
    source = source.replace('workerbuild=0.34.1-hbclean.319', 'workerbuild=0.34.1-hbclean.321')
    source = replace_once(source, "                    for operation in val.split(';').map(str::trim) {", """                    for operation in val.split(';').map(str::trim) {
                        if self.chord_handoff.is_some() && !chord_handoff_preserves_command(operation) {
                            self.cancel_chord_handoff();
                        }""")
    source += '\n' + (assets / 'queue-handoff-bridge.rs').read_text()
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/chord_queue.rs'
    source = replace_once(path.read_text(), '    fn clear_chord_queue(&mut self) {',
        '    fn clear_chord_queue(&mut self) {\n        self.cancel_chord_handoff();')
    source = replace_once(source, '    fn tick_chord_queue(&mut self) {',
        '    fn tick_chord_queue(&mut self) {\n        if self.service_chord_handoff() { return; }')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/chain_slots.rs'
    source = replace_once(path.read_text(), '    pub fn hb_chord_queue_take(&mut self, slot: usize) -> crate::hb_queue_read::Event {', '''    pub fn hb_chord_handoff_tick(&mut self, slot: usize) -> Option<u64> {
        let Some(Some(instance)) = self.slots.get_mut(slot) else { return None; };
        let mut buffer = [0u8; 32];
        let length = instance.hb_get_small(c"midi_fx1:hb_chord_queue_handoff_tick", &mut buffer);
        if length <= 0 || length as usize >= buffer.len() { return None; }
        std::str::from_utf8(&buffer[..length as usize]).ok()?.parse().ok()
    }

    pub fn hb_chord_handoff_ready(&mut self, slot: usize) -> Option<i8> {
        let Some(Some(instance)) = self.slots.get_mut(slot) else { return None; };
        let mut buffer = [0u8; 4];
        match instance.hb_get_small(c"midi_fx1:hb_chord_queue_handoff", &mut buffer) {
            1 if buffer[0] == b'0' => Some(0),
            1 if buffer[0] == b'1' => Some(1),
            _ => None,
        }
    }

    pub fn hb_chord_queue_take(&mut self, slot: usize) -> crate::hb_queue_read::Event {''')
    path.write_text(source)
    path = root / 'src/undo/verbs.ts'
    path.write_text(path.read_text().replace("'qcopy',", "'qcopy', 'qhandoff',"))
    path = root / 'engine/crates/seq-core/src/command.rs'
    path.write_text(path.read_text().replace('| "qcopy"', '| "qcopy" | "qhandoff"'))
    path = root / 'browser-test/logic/undo-core.mjs'
    source = path.read_text().replace('Some("qcopy")', 'Some("qcopy" | "qhandoff")')
    source = source.replace("dispatched.add('qcopy');", "dispatched.add('qcopy'); dispatched.add('qhandoff');")
    path.write_text(source)
    for relative_path in ('engine/crates/movy-dsp/src/lib.rs', 'src/seq/constants.ts'):
        path = root / relative_path
        path.write_text(path.read_text().replace('0.102.0-safe-state1', '0.103.0-queue-handoff1'))
