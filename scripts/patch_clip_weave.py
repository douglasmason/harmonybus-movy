"""Add donor-rhythm selection to existing clip operation timing and emission."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_clip_weave(root: Path) -> None:
    """Apply after reader/recording patches so there remains one emission path."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/performance'
    core: Path = root / 'engine/crates/seq-core/src'
    (core / 'hb_weave.rs').write_text((assets / 'hb_weave.rs').read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text() + '\npub mod hb_weave;\n')
    path = core / 'hb_clip_performance.rs'
    source: str = path.read_text().replace('!(12..=15).contains(operation)', '(!(12..=15).contains(operation)&&*operation!=65)').replace('!(12..=15).contains(&operation)', '(!(12..=15).contains(&operation)&&operation!=65)')
    source = replace_once(source, 'impl Performance {', '''impl Performance {
    /// Shared arbitration for ordinary readers and donor-rhythm readers.
    pub fn winner(&self, clip: usize) -> Option<(bool, Gesture)> {
        self.slots.iter().flatten().filter(|gesture| gesture.clip==clip).max_by_key(|gesture|gesture.order).copied().map(|gesture|(true,gesture))
            .or_else(||self.automatic.iter().flatten().filter(|gesture|gesture.clip==clip).max_by_key(|gesture|gesture.order).copied().map(|gesture|(false,gesture)))
    }''')
    source = replace_once(source, '        let newest = self.slots.iter().flatten().max_by_key(|gesture| gesture.order).copied()\n            .or_else(||self.automatic.iter().flatten().max_by_key(|gesture|gesture.order).copied());', '        let newest = self.winner(clip).map(|(_,gesture)|gesture);')
    path.write_text(source)
    path = core / 'clip_tools.rs'
    timing_source: str = path.read_text()
    engine_source: str = (core / 'engine.rs').read_text()
    swing_start: int = engine_source.index('    pub(crate) fn swing_delay(')
    swing_end: int = engine_source.index('\n    }', swing_start) + len('\n    }')
    swing_method: str = engine_source[swing_start:swing_end]
    swing_function: str = swing_method.replace('    pub(crate) fn swing_delay(&self,', 'pub fn swing_delay(swing_pct: u32,').replace('self.swing_pct', 'swing_pct')
    path.write_text(timing_source + '\n/// Shared scaled-sixteenth swing used by playback and rhythm borrowing.\n' + swing_function + '\n')
    path = core / 'engine.rs'
    path.write_text(replace_once(engine_source, swing_method, '    pub(crate) fn swing_delay(&self, step: u16, scale_num: u8, scale_den: u8) -> u32 {\n        crate::clip_tools::swing_delay(self.swing_pct, step, scale_num, scale_den)\n    }'))
    source = replace_once(path.read_text(), 'pub struct Engine {', 'pub struct Engine {\n    hb_weave: Vec<crate::hb_weave::Weave>,')
    source = replace_once(source, '            hb_performance:', '            hb_weave: vec![Default::default(); NUM_TRACKS],\n            hb_performance:')
    source = replace_once(source, '        if !self.playing { return; }', '        if !self.playing || (operation==65 && self.recording && self.records_track(track)) { return; }')
    # Exclude this runtime-only reader from recorded operation interval serialization.
    source = source.replace('self.hb_performance[ti].slots.iter().flatten().max_by_key', 'self.hb_performance[ti].slots.iter().flatten().filter(|gesture|gesture.operation!=65).max_by_key')
    anchor: str = '            let hb_window = self.hb_performance[ti].advance'
    source = replace_once(source, anchor, '''            let request=self.hb_performance[ti].winner(slot).or_else(||self.grid_performance[ti].winner(slot));
            let request=request.filter(|(_,gesture)|gesture.operation==65 && !joint_recording_here);
            let donor=request.and_then(|(_,gesture)|usize::try_from(gesture.amount-1).ok())
                .and_then(|track|self.tracks.get(track))
                .and_then(|track|track.playing_slot.map(|slot|(slot,&track.clips[slot])));
            let weave=self.hb_weave[ti].read(request,clip,donor,self.swing_pct);
            let hb_window = self.hb_performance[ti].advance''')
    anchor = '            if !muted {\n                    let len = self.tracks[ti].clips[slot].notes.len();'
    source = replace_once(source, anchor, '''            let hb_window=if request.is_some() {weave.map(|(window,_)|window)} else {hb_window};
            if !muted {
                    let len = self.tracks[ti].clips[slot].notes.len();''')
    source = replace_once(source, 'window.contains(fire_tick,n.gate)', 'window.contains(if weave.is_some() {n.tick} else {fire_tick},n.gate)')
    source = replace_once(source, 'ticks_left: hb_window.map_or(n.gate.max(1), |window| window.duration(n.gate)),', 'ticks_left: weave.map_or_else(||hb_window.map_or(n.gate.max(1), |window| window.duration(n.gate)),|(_,gate)|gate),')
    source = replace_once(source, '    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {', '    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {\n        for weave in &mut self.hb_weave { weave.clear(); }')
    source += (assets / 'hb_weave_tests.rs').read_text()
    path.write_text(source)
    # Existing physical-step and touch-knob bridges must recognize the appended ID.
    for path in (root / 'src/renderer').glob('*.ts'):
        source = path.read_text()
        changed: str = source.replace('binding[0] >= 12 && binding[0] <= 15', '((binding[0] >= 12 && binding[0] <= 15) || binding[0] === 65)').replace('binding[0]>=12 && binding[0]<=15', '((binding[0]>=12 && binding[0]<=15) || binding[0]===65)')
        if changed != source:
            path.write_text(changed)
