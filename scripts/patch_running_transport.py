"""Adopt an already-running host transport when Movy opens or loads a Set."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_running_transport(root: Path) -> None:
    """Seed the engine from host beat position once per state load."""
    path: Path = root / 'engine/crates/seq-core/src/engine.rs'
    source: str = path.read_text()
    source = replace_once(source, '    pub link_enabled: bool,', '    pub link_enabled: bool,\n    pub host_transport_attached: bool,')
    source = replace_once(source, '            link_enabled: true,', '            link_enabled: true,\n            host_transport_attached: false,')
    marker: str = '    /// Advance one audio block; pushes due MIDI into `out`.'
    addition: str = '''    /// Opening mid-song can miss FA entirely. Adopt the native absolute beat
    /// without emitting Play/Stop or replaying every elapsed note. The following
    /// F8 packets continue from this absolute 24-PPQN anchor.
    pub fn attach_host_transport(&mut self, running: bool, beat: f64, bpm: f64,
                                 out: &mut Vec<OutEvent>) {
        if self.host_transport_attached || !self.link_enabled { return; }
        if !beat.is_finite() || beat < 0.0 || !bpm.is_finite() || bpm <= 0.0 { return; }
        self.host_transport_attached = true;
        if !running { return; }
        self.flush_gates(out);
        self.pending_play = false;
        self.move_toggle_queue = 0;
        self.clock.set_bpm_x100((bpm * 100.0).round() as u32);
        self.play();
        let tick = (beat * crate::PPQN as f64).ceil() as u64;
        self.master_tick = tick;
        self.clock.tick = tick;
        for track in &mut self.tracks {
            if let Some(slot) = track.playing_slot {
                let clip = &track.clips[slot];
                let numerator = clip.scale_num.max(1) as u64;
                let denominator = clip.scale_den.max(1) as u64;
                let scaled = tick.saturating_mul(numerator);
                let elapsed = scaled / denominator;
                let length = clip.length_ticks().max(1) as u64;
                track.pos_tick = clip.loop_start_ticks() + (elapsed % length) as u32;
                track.scale_acc = (scaled % denominator) as u32;
                track.cycle = (elapsed / length).min(u32::MAX as u64 - 1) as u32 + 1;
            }
        }
        self.ext_running = true;
        self.ext_awaiting_first = false;
        self.ext_ticks = (beat * 24.0).floor() as u64;
        self.ext_base = 0;
        self.ext_base_set = true;
        self.ext_interval = 60.0 * self.clock.sample_rate() as f64 / (bpm * 24.0);
        self.ext_last_frame = self.frame_now;
        self.was_following = true;
        self.emitting_clock = false;
        self.resume_anchor_pending = false;
    }

'''
    source = replace_once(source, marker, addition + marker)
    source = replace_once(source, '        let live_link = self.link_enabled;', '        let live_link = self.link_enabled;\n        let live_attachment = self.host_transport_attached;')
    source = replace_once(source, '        self.link_enabled = live_link;', '        self.link_enabled = live_link;\n        self.host_transport_attached = live_attachment;')
    tests: Path = Path(__file__).resolve().parents[1] / 'integration/performance/hb_running_transport_tests.rs'
    path.write_text(source + '\n' + tests.read_text())
    path = root / 'engine/crates/seq-core/src/persist.rs'
    source = path.read_text()
    source = replace_once(source, '    engine.hb_performance.fill(Default::default());', '    engine.host_transport_attached = false;\n    engine.hb_performance.fill(Default::default());')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/host.rs'
    path.write_text(path.read_text() + '''
/// Normalize optional host capabilities, not host version strings. Both
/// Schwung 1.7.3 and 1.8.2 use this ABI; the browser may omit callbacks.
fn transport_snapshot_from(api: Option<&host_api_v1_t>) -> Option<(bool, f64, f64)> {
    let api = api?;
    let status = api.get_clock_status?;
    let beat = api.get_beat_position?;
    let bpm = api.get_bpm?;
    let status = unsafe { status() };
    // UNAVAILABLE is not STOPPED. Consuming it would prevent attachment when
    // the host finishes starting or becomes available after a Set switch.
    if status != 1 && status != 2 { return None; }
    let beat = unsafe { beat() };
    let bpm = unsafe { bpm() } as f64;
    let minimum_bpm = f64::from(seq_core::clock::BPM_X100_MIN) / 100.0;
    let maximum_bpm = f64::from(seq_core::clock::BPM_X100_MAX) / 100.0;
    if !beat.is_finite() || beat < 0.0 || !bpm.is_finite() || !(minimum_bpm..=maximum_bpm).contains(&bpm) {
        return None;
    }
    Some((status == 2, beat, bpm))
}

/// Snapshot native transport; never infer phase from tool-launch time.
pub fn transport_snapshot() -> Option<(bool, f64, f64)> {
    transport_snapshot_from(host())
}

/// Attach once per Set load. A completed attachment owes no more host reads;
/// the existing MIDI clock owns subsequent transport and lookahead timing.
pub fn attach_transport(engine: &mut seq_core::engine::Engine,
                        output: &mut Vec<seq_core::engine::OutEvent>) {
    attach_transport_from(engine, output, host());
}

fn attach_transport_from(engine: &mut seq_core::engine::Engine,
                         output: &mut Vec<seq_core::engine::OutEvent>,
                         api: Option<&host_api_v1_t>) {
    if !engine.link_enabled || engine.host_transport_attached { return; }
    if let Some((running, beat, bpm)) = transport_snapshot_from(api) {
        engine.attach_host_transport(running, beat, bpm, output);
    }
}
''')
    host_tests: Path = Path(__file__).resolve().parents[1] / 'integration/schwung-host/host_transport_tests.rs'
    path.write_text(path.read_text() + '\n' + host_tests.read_text())
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text()
    source = replace_once(source, '        self.engine\n            .advance_block', '''        host::attach_transport(&mut self.engine, &mut self.out);
        self.engine
            .advance_block''')
    path.write_text(source)
