"""Install the allocation-free Movy clip metadata bridge into pinned upstream."""
from pathlib import Path


def patch_loop_bridge(root: Path) -> None:
    """Add one render hook and raw C-string parameter forwarding."""
    source_path: Path = Path(__file__).resolve().parent.parent / 'integration/hb_loop.rs'
    (root / 'engine/crates/movy-dsp/src/hb_loop.rs').write_text(source_path.read_text())
    path: Path = root / 'engine/crates/seq-core/src/engine.rs'
    source: str = path.read_text()
    if 'pub fn hb_master_tick' not in source:
        source = source.replace('impl Engine {', 'impl Engine {\n    pub fn hb_master_tick(&self) -> u64 { self.master_tick }', 1)
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/chain_host.rs'
    source = path.read_text()
    marker: str = '    pub fn set_param(&mut self, key: &str, val: &str) {'
    if 'pub fn hb_set_param' not in source:
        source = source.replace(marker, '''    pub fn hb_set_param(&mut self, key: &CStr, value: &CStr) {
        if let Some(set) = self.api.set_param { unsafe { set(self.inst,key.as_ptr(),value.as_ptr()) }; }
    }

''' + marker, 1)
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/chain_slots.rs'
    source = path.read_text()
    marker = '    pub fn get_param(&mut self, slot: usize, key: &str) -> Option<String> {'
    if 'pub fn hb_clip' not in source:
        source = source.replace(marker, '''    pub fn hb_clip(&mut self, slot: usize, message: &std::ffi::CStr) {
        if let Some(Some(instance)) = self.slots.get_mut(slot) {
            let key = std::ffi::CStr::from_bytes_with_nul(b"midi_fx1:hb_movy_clip\\0").unwrap();
            instance.hb_set_param(key,message);
        }
    }

''' + marker, 1)
    if 'pub fn hb_conductor_block' not in source:
        source = source.replace(marker, '''    pub fn hb_conductor_block(&mut self, message: &std::ffi::CStr) {
        let key = std::ffi::CStr::from_bytes_with_nul(b"midi_fx1:hb_movy_block\\0").unwrap();
        for instance in self.slots.iter_mut().flatten() { instance.hb_set_param(key,message); }
    }

''' + marker, 1)
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text()
    if 'mod hb_loop;' not in source:
        source = source.replace('mod click;', 'mod click;\nmod hb_loop;', 1)
        source = source.replace('    blocks: u64,', '    blocks: u64,\n    hb_last_tick: u64,\n    hb_last_running: bool,', 1)
        source = source.replace('            blocks: 0,', '            blocks: 0,\n            hb_last_tick: u64::MAX,\n            hb_last_running: false,', 1)
        marker = '        self.drain_out();\n        self.click.render(out_audio);'
        source = source.replace(marker, """        // Musical metadata changes at sequencer ticks. While stopped, refresh
        // occasionally so edits and newly loaded chains are still discovered.
        let master_tick = self.engine.hb_master_tick();
        if master_tick != self.hb_last_tick || self.hb_last_running != self.engine.playing || self.blocks % 64 == 0 {
            self.hb_last_running = self.engine.playing;
            self.hb_last_tick = master_tick;
            for track in 0..self.engine.tracks.len() {
                if chain_for(track as u8,self.movy_tracks).is_some() {
                    let message = hb_loop::snapshot(&self.engine,track).message();
                    self.chains.hb_clip(track,message.as_c_str());
                }
            }
        }
        self.drain_out();
        // Every conductor sees the entire MIDI batch before any follower can
        // release a due note, including chains that render on worker lanes.
        let message = hb_loop::block_message(self.blocks,out_audio.len()/2,host::sample_rate());
        self.chains.hb_conductor_block(message.as_c_str());
        self.click.render(out_audio);""", 1)
    path.write_text(source)
