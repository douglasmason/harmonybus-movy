"""Make Record from stopped use the same host start handshake as Play."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_record_start(root: Path) -> None:
    """Arm count-in before the linked transport starts, preserving punch-in."""
    path: Path = root / 'engine/crates/seq-core/src/engine.rs'
    source: str = path.read_text()
    source = replace_once(source, '        let _ = out;\n        if !self.link_drives_move() {', '''        let _ = out;
        self.request_play_start();
    }

    fn request_play_start(&mut self) {
        if self.pending_play { return; }
        if !self.link_drives_move() {''')
    source = replace_once(source, '            self.play();                       // seeds playheads + starts transport', '''            // The count-in must not run ahead while Move is still starting.
            self.request_play_start();''')
    source = replace_once(source, '            self.queue_move_play_toggle(); // Move may already be starting: toggle back\n            return;', '''            self.queue_move_play_toggle(); // Move may already be starting: toggle back
            self.stop(out); // Cancel an armed count-in too.
            return;''')
    source = replace_once(source, '    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {', '''    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {
        self.pending_play = false;''')
    source = replace_once(source, 'if self.link_enabled && self.playing {\n                    self.stop(out);', 'if self.link_enabled && (self.playing || self.pending_play) {\n                    self.stop(out);')
    tests_path: Path = Path(__file__).resolve().parents[1] / 'integration/performance/hb_record_transport_tests.rs'
    path.write_text(source + '\n' + tests_path.read_text())
    path = root / 'engine/crates/seq-core/src/command.rs'
    source = path.read_text().replace('other play()/stop() callers (session auto-start, record)', 'other play()/stop() callers (session auto-start)')
    path.write_text(source)
