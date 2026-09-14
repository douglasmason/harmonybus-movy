"""Install runtime-only clip playback gestures and the direct HB host bridge."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_clip_performance(root: Path) -> None:
    """Keep clip storage/transport intact while transforming emitted note events."""
    integration: Path = Path(__file__).resolve().parents[1] / 'integration/performance'
    (root / 'engine/crates/seq-core/src/hb_clip_performance.rs').write_text((integration / 'hb_clip_performance.rs').read_text())
    path: Path = root / 'engine/crates/seq-core/src/lib.rs'
    path.write_text(replace_once(path.read_text(), 'pub mod engine;', 'pub mod engine;\npub mod hb_clip_performance;'))
    path = root / 'engine/crates/seq-core/src/engine.rs'
    source: str = path.read_text()
    source = replace_once(source, '    pub tracks: Vec<Track>,', '    pub tracks: Vec<Track>,\n    pub hb_performance: Vec<crate::hb_clip_performance::Performance>,')
    source = replace_once(source, '            tracks: (0..NUM_TRACKS).map(|_| Track::new()).collect(),', '            tracks: (0..NUM_TRACKS).map(|_| Track::new()).collect(),\n            hb_performance: vec![Default::default(); NUM_TRACKS],')
    source = replace_once(source, 'impl Engine {', '''impl Engine {
    /// Capture the selected clip on press. Releases always address that track/slot.
    pub fn hb_perform(&mut self, track: usize, lane: usize, down: bool, operation: u8, amount: i32, grid: u8) {
        if track >= self.tracks.len() || lane >= 16 { return; }
        if !down { self.hb_performance[track].hold(lane,false,0,0,0,0,0); return; }
        if !self.playing || (self.recording && self.rec_track == track) { return; }
        let Some(clip) = self.tracks[track].playing_slot else { return; };
        self.hb_performance[track].hold(lane,true,operation,amount,grid,self.tracks[track].pos_tick,clip);
    }
    pub fn hb_perform_reset(&mut self, track: usize) {
        if track < self.hb_performance.len() { self.hb_performance[track] = Default::default(); }
    }''')
    source = replace_once(source, '            for t in &mut self.tracks {\n                if let Some(slot) = t.queued_slot.take() {', '            for (t,performance) in self.tracks.iter_mut().zip(self.hb_performance.iter_mut()) {\n                if t.queued_slot.is_some() || t.pending_stop { *performance = Default::default(); }\n                if let Some(slot) = t.queued_slot.take() {')
    source = replace_once(source, '        // Gate countdown now lives in step_tick', '        for (track,performance) in self.tracks.iter().zip(self.hb_performance.iter_mut()) {\n            if !track.playing_slot.is_some_and(|slot| track.clips[slot].exists()) { *performance = Default::default(); }\n        }\n        // Gate countdown now lives in step_tick')
    source = replace_once(source, '    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {', '    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {\n        self.hb_performance.fill(Default::default());')
    source = replace_once(source, '        let Some(slot) = self.tracks[ti].playing_slot else {\n            return;\n        };', '        let Some(slot) = self.tracks[ti].playing_slot else {\n            self.hb_perform_reset(ti);\n            return;\n        };')
    source = replace_once(source, '            let pos = self.tracks[ti].pos_tick;\n            if !muted {', '''            let pos = self.tracks[ti].pos_tick;
            if self.recording && self.rec_track == ti { self.hb_perform_reset(ti); }
            let clip = &self.tracks[ti].clips[slot];
            let hb_window = self.hb_performance[ti].advance(slot,clip.loop_start_ticks(),clip.length_ticks(),pos);
            if !muted {''')
    source = replace_once(source, '                        if fire_tick != pos || n.suppress || n.fired {', '''                        if !hb_window.map_or(fire_tick == pos, |window| window.contains(fire_tick,n.gate))
                            || n.suppress || (hb_window.is_none() && n.fired) {''')
    source = replace_once(source, '                        self.tracks[ti].clips[slot].notes[ni].fired = true;', '                        if hb_window.is_none() { self.tracks[ti].clips[slot].notes[ni].fired = true; }')
    source = replace_once(source, '    ticks_left: u32,', '    ticks_left: u32,\n    hb_modified: bool,')
    source = replace_once(source, '                        out.push(if n.rendered {OutEvent::RenderedOn', '''                        // A retrigger must close the preceding transformed gate first;
                        // its later note-off must never cut off the new voice.
                        let mut index = 0;
                        while index < self.gates.len() {
                            let gate = &self.gates[index];
                            if gate.track == ti as u8 && gate.pitch == emit_pitch && gate.rendered == n.rendered
                                && (hb_window.is_some() || gate.hb_modified) {
                                let gate = self.gates.remove(index);
                                out.push(if gate.rendered {OutEvent::RenderedOff {track:gate.track,pitch:gate.pitch}}
                                    else {OutEvent::NoteOff {track:gate.track,pitch:gate.pitch}});
                            } else { index += 1; }
                        }
                        out.push(if n.rendered {OutEvent::RenderedOn''')
    source = replace_once(source, '                            pressure:n.pressure, pressure_index, elapsed:0,', '''                            pressure:n.pressure.into_iter().map(|(offset,value)|
                                (hb_window.map_or(offset,|window| if offset==0 {0} else {window.duration(offset)}),value)).collect(),
                            pressure_index, elapsed:0,
                            hb_modified: hb_window.is_some(),''')
    source = replace_once(source, '                            ticks_left: n.gate.max(1),', '                            ticks_left: hb_window.map_or(n.gate.max(1), |window| window.duration(n.gate)),')
    source += (integration / 'hb_clip_engine_tests.rs').read_text()
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/persist.rs'
    path.write_text(replace_once(path.read_text(), '    // Reset all clips before applying.', '    engine.hb_performance.fill(Default::default());\n    // Reset all clips before applying.'))
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = replace_once(path.read_text(), 'const ENGINE_VERSION: &str = "0.71.0";', 'const ENGINE_VERSION: &str = "0.71.0-hb47";')
    source = replace_once(source, '            "file_path" => {}', '''            "hbperform" => {
                let fields: Vec<_> = val.split(',').collect();
                if let [track,lane,down,operation,amount,grid] = fields.as_slice() {
                    if let (Ok(track),Ok(lane),Ok(down),Ok(operation),Ok(amount),Ok(grid)) =
                        (track.parse::<usize>(),lane.parse::<usize>(),down.parse::<u8>(),operation.parse::<u8>(),amount.parse::<i32>(),grid.parse::<u8>()) {
                        self.engine.hb_perform(track,lane,down!=0,operation,amount,grid);
                    }
                }
            }
            "hbperform_reset" => {
                if let Ok(track) = val.parse::<usize>() { self.engine.hb_perform_reset(track); }
            }
            "file_path" => {}''')
    path.write_text(source)
    path = root / 'src/seq/constants.ts'
    path.write_text(replace_once(path.read_text(), "export const ENGINE_VERSION = '0.71.0';", "export const ENGINE_VERSION = '0.71.0-hb47';"))
    path = root / 'src/renderer/schwung-page.ts'
    source = "import { registerHbHost } from './hb-performance.js';\n" + path.read_text()
    source = replace_once(source, '    function reload(): void {', '''    function reload(): void {
        if (componentKey === 'midi_fx1' && port.getParam(moduleReadKey(componentKey)) === 'harmonybus') {
            registerHbHost(port.track.index, (value: string) => port.setParam(componentKey + ':motion_host', value));
        }''')
    source = replace_once(source, '    performanceSet(key: string, value: string): void;', '    readonly performanceTrack: number;\n    performanceSet(key: string, value: string): void;')
    source = replace_once(source, '        performanceSet: (key:', '        performanceTrack: port.track.index,\n        performanceSet: (key:')
    path.write_text(source)
    path = root / 'src/app/unload.ts'
    source = "import { releaseHbHosts } from '../renderer/hb-performance.js';\n" + path.read_text()
    source = replace_once(source, '    resetHbPerformance();', '    resetHbPerformance();\n    releaseHbHosts();')
    path.write_text(source)
