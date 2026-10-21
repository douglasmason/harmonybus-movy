"""Preserve generated-note identity through retrospective Capture."""
from pathlib import Path

from patch_movy_stock_schwung_pages import replace_once


def patch_capture(root: Path) -> None:
    """Keep Capture and Record consistent about already-rendered voices."""
    core: Path = root / "engine/crates/seq-core/src"
    path: Path = core / "capture.rs"
    source: str = path.read_text()
    source = replace_once(source, "pub struct CapEvent {", "pub struct CapEvent {\n    pub rendered: bool,", "Capture note identity")
    source = replace_once(source, "CapEvent { actions: None,", "CapEvent { rendered: false, actions: None,", "Capture note identity")
    path.write_text(source)

    path = core / "engine.rs"
    source = path.read_text()
    source = replace_once(source,
        "fn capture_push(&mut self, track: usize, pitch: u8, vel: u8, on: bool)",
        "fn capture_push(&mut self, track: usize, pitch: u8, vel: u8, on: bool, rendered: bool)", "Capture note identity")
    source = replace_once(source, "        let ev = CapEvent {", "        let ev = CapEvent {\n            rendered,", "Capture note identity")
    source = replace_once(source,
        "    pub fn live_note_on(&mut self, track: usize, pitch: u8, vel: u8) {\n        self.capture_push(track, pitch, vel, true);",
        """    pub fn live_note_on(&mut self, track: usize, pitch: u8, vel: u8) {
        self.live_note_on_kind(track, pitch, vel, false);
    }

    // Mark the onset before either the retrospective ring or Record sees it.
    fn live_note_on_kind(&mut self, track: usize, pitch: u8, vel: u8, rendered: bool) {
        self.capture_push(track, pitch, vel, true, rendered);""", "Capture note identity")
    source = replace_once(source, "            rendered: false,\n            start_tick,", "            rendered,\n            start_tick,", "Capture note identity")
    source = replace_once(source,
        """        self.live_note_on(track,pitch,vel);
        if let Some(note)=self.rec_pending.iter_mut().rfind(|note|note.track==track&&note.pitch==pitch){
            note.rendered=true; note.input_key=None;
        }""",
        "        self.live_note_on_kind(track, pitch, vel, true);", "Capture note identity")
    source = replace_once(source, "self.capture_push(track, pitch, 0, false);", "self.capture_push(track, pitch, 0, false, false);", "Capture note identity")
    # Both stopped Capture (including tempo reselection) and running Capture
    # restore the identity saved at onset, independent of later HB settings.
    old: str = "if clip.notes.len()>count { clip.notes.last_mut().unwrap().actions=ev.actions; clip.notes.last_mut().unwrap().input_key=ev.input_key; }"
    new: str = """if clip.notes.len()>count {
                let note = clip.notes.last_mut().unwrap();
                note.rendered = ev.rendered;
                note.actions = if ev.rendered { None } else { ev.actions };
                note.input_key = if ev.rendered { None } else { ev.input_key };
            }"""
    if source.count(old) != 2:
        raise RuntimeError("Expected stopped and running Capture note writers")
    source = source.replace(old, new)
    # Conductor voices must never inherit a stale follower input key.
    prefix: str
    for prefix in ["actions: self.record_actions[track][pitch as usize], ", "actions, "]:
        old = prefix + "input_key: self.follower_inputs[track].map(|mut key|{key.transpose=self.active_clip_transpose(track) as i8;key}),"
        new = prefix + "input_key: if rendered { None } else { self.follower_inputs[track].map(|mut key|{key.transpose=self.active_clip_transpose(track) as i8;key}) },"
        source = replace_once(source, old, new, "Capture note identity")
    tests: Path = Path(__file__).resolve().parent.parent / "integration/capture_tests.rs"
    source += "\n" + tests.read_text()
    path.write_text(source)
