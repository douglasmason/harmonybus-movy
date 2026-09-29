"""Shared Render Rhythm: cached configuration and nondestructive clip lookahead."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_render_rhythm(root: Path) -> None:
    integration = Path(__file__).resolve().parents[1] / 'integration/performance'
    target=root/'engine/crates/seq-core/src'
    (target/'hb_render_rhythm.rs').write_text((integration/'hb_render_rhythm.rs').read_text())
    path=target/'lib.rs'
    path.write_text(replace_once(path.read_text(),'pub mod hb_clip_performance;','pub mod hb_clip_performance;\npub mod hb_render_rhythm;'))
    path=target/'engine.rs';s=path.read_text()
    s=replace_once(s,'    pub hb_performance:', '    pub hb_rhythm: Vec<crate::hb_render_rhythm::Rhythm>,\n    pub hb_rhythm_active: Vec<crate::hb_render_rhythm::Rhythm>,\n    pub hb_rhythm_cycle: Vec<Option<(usize,u32)>>,\n    pub hb_performance:')
    s=replace_once(s,'            hb_performance:', '            hb_rhythm: vec![Default::default(); NUM_TRACKS],\n            hb_rhythm_active: vec![Default::default(); NUM_TRACKS],\n            hb_rhythm_cycle: vec![None; NUM_TRACKS],\n            hb_performance:')
    s=replace_once(s,'        let next=crate::hb_clip_performance::AutoConfig::parse(message)', '''        let (message,rhythm)=message.split_once('|').unwrap_or((message,""));
        self.hb_rhythm[track]=crate::hb_render_rhythm::Rhythm::parse(rhythm).unwrap_or_default();
        let next=crate::hb_clip_performance::AutoConfig::parse(message)''')
    s=replace_once(s,'            let clip = &self.tracks[ti].clips[slot];\n            let hb_window', '''            if self.hb_rhythm_cycle[ti].map_or(true, |(old_slot,old_pos)|old_slot!=slot || pos<=old_pos) {self.hb_rhythm_active[ti]=self.hb_rhythm[ti];}
            self.hb_rhythm_cycle[ti]=Some((slot,pos));
            let clip = &self.tracks[ti].clips[slot];
            let hb_window''')
    s=replace_once(s,'            let hb_window = self.hb_performance[ti].advance', '''            let hb_rhythm=if self.recording && self.rec_track==ti {Default::default()} else {self.hb_rhythm_active[ti]};
            let hb_rhythm_start=clip.loop_start_ticks();
            let hb_window = self.hb_performance[ti].advance''')
    needle='                        if !hb_window.map_or(fire_tick == pos,'
    s=replace_once(s,needle,'''                        let fire_tick=hb_rhythm.tick(fire_tick,hb_rhythm_start,clip_end);
'''+needle)
    s=replace_once(s,'&& (hb_window.is_some() || gate.hb_modified)', '&& (hb_window.is_some() || hb_rhythm.enabled() || gate.hb_modified)')
    s=replace_once(s,'hb_modified: hb_window.is_some()||humanize.time_active(ti),','hb_modified: hb_window.is_some()||humanize.time_active(ti)||hb_rhythm.enabled(),')
    s=replace_once(s,'        self.hb_performance.fill(Default::default());','        self.hb_performance.fill(Default::default());\n        self.hb_rhythm_cycle.fill(None);')
    s+=(integration/'hb_rhythm_engine_tests.rs').read_text()
    path.write_text(s)
    path=target/'persist.rs'
    path.write_text(replace_once(path.read_text(),'    engine.hb_auto.fill([None;16]);','    engine.hb_auto.fill([None;16]);\n    engine.hb_rhythm.fill(Default::default());\n    engine.hb_rhythm_active.fill(Default::default());\n    engine.hb_rhythm_cycle.fill(None);'))
    path=root/'engine/crates/movy-dsp/src/chain_slots.rs';s=path.read_text()
    # Settings are global as well as per-track; refresh all cached effective values.
    s=replace_once(s,'if key.starts_with("midi_fx1:motion_")','if key.starts_with("midi_fx1:motion_") || key.starts_with("midi_fx1:motif_") || key.starts_with("midi_fx1:render_rhythm_") || key == "midi_fx1:state"')
    s=replace_once(s,'if component == "midi_fx1" { self.hb_config_dirty[slot] = true; }','if component == "midi_fx1" { self.hb_config_dirty.fill(true); }')
    s=replace_once(s,'        Some(message.unwrap_or_default())','''        let rhythm=instance.get_param("midi_fx1:render_rhythm_config");
        if rhythm.is_some() { instance.set_param("midi_fx1:render_rhythm_host","movy-rhythm-v1"); }
        Some(format!("{}|{}",message.unwrap_or_default(),rhythm.unwrap_or_default()))''')
    path.write_text(s)
