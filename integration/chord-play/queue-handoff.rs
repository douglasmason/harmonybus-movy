// A one-shot transfer at HB's existing service boundary. No new transport clock.
impl Engine {
    pub fn chord_handoff_context(&self, track: usize, slot: usize) -> bool {
        self.playing && !self.part_recording_busy() && track < self.tracks.len()
            && slot < crate::track::CLIPS_PER_TRACK && !self.tracks[track].muted
            && self.tracks[track].queued_slot.is_none() && !self.tracks[track].pending_stop
            && self.tracks[track].pending_select.is_none()
            && !self.track_is_drum(track) && !self.generator_exploring(track)
            && !self.source_routes[track].has_independent_sources(track, slot)
    }

    pub fn chord_handoff_valid(&self, track: usize, slot: usize) -> bool {
        self.chord_handoff_context(track, slot) && self.tracks[track].clips[slot].exists()
    }

    /// Enter the normal clip player on this completed master tick. Its first
    /// step replaces the queue's first chord; subsequent ticks use service_tick.
    pub fn handoff_chord_clip(&mut self, track: usize, slot: usize, late_ticks: u32, out: &mut Vec<OutEvent>) {
        self.clear_song(); // Same arrangement takeover semantics as a manual launch.
        self.flush_track_gates(track, out);
        self.key_playback[track].reset();
        self.shared_seen[track] = [None; 3];
        self.hb_performance[track] = Default::default();
        self.drum_fills[track] = None;
        self.source_automation_invalidate();
        for actor in 0..NUM_TRACKS {
            if actor == track || self.source_cursors[actor].source.is_some_and(|source| source.track == track) {
                self.source_cursors[actor] = Default::default();
            }
        }
        let target = &mut self.tracks[track];
        target.playing_slot = Some(slot);
        target.active_clip = slot;
        target.pos_tick = target.clips[slot].loop_start_ticks();
        target.clips[slot].release_pass_flags();
        target.last_auto_step = -1;
        target.auto_cur = [-1; 8];
        target.scale_acc = 0;
        target.cycle = 1;
        self.source_positions[track] = target.pos_tick;
        self.source_playing_slots[track] = Some(slot);
        for _ in 0..=late_ticks { self.step_tick(track, out); }
    }
}

#[cfg(test)]
mod queue_handoff_tests {
    use super::*;

    #[test]
    fn launch_preserves_clock_and_melody_focus_and_emits_one_first_step() {
        let mut engine = Engine::new(48000, 12000);
        let mut output = Vec::new();
        engine.playing = true;
        engine.master_tick = 193;
        engine.watch_track = 3;
        engine.tracks[3].active_clip = 2;
        engine.tracks[3].playing_slot = Some(2);
        engine.tracks[3].pos_tick = 37;
        engine.tracks[0].clips[1].set_loop(0, 8);
        engine.tracks[0].clips[1].add_note_raw(0, 0, 96, 60, 100);
        assert!(engine.chord_handoff_valid(0, 1));
        engine.handoff_chord_clip(0, 1, 0, &mut output);
        assert_eq!(engine.master_tick, 193);
        assert_eq!(engine.watch_track, 3);
        assert_eq!((engine.tracks[3].active_clip, engine.tracks[3].playing_slot, engine.tracks[3].pos_tick), (2, Some(2), 37));
        assert_eq!((engine.tracks[0].playing_slot, engine.tracks[0].pos_tick), (Some(1), 1));
        assert_eq!(output.iter().filter(|event| matches!(event, OutEvent::NoteOn { track: 0, pitch: 60, .. })).count(), 1);
    }

    #[test]
    fn changing_playback_ownership_blocks_handoff() {
        let mut engine = Engine::new(48000, 12000);
        engine.playing = true;
        engine.tracks[0].clips[1].ensure_exists();
        assert!(engine.chord_handoff_valid(0, 1));
        engine.tracks[0].queued_slot = Some(2);
        assert!(!engine.chord_handoff_valid(0, 1));
        engine.tracks[0].queued_slot = None;
        engine.source_routes[0].enabled = true;
        engine.source_routes[0].rhythm = Some(crate::source_route::ClipRef { track: 3, slot: 0 });
        assert!(!engine.chord_handoff_valid(0, 1));
        engine.source_routes[0] = Default::default();
        engine.recording = true;
        assert!(!engine.chord_handoff_valid(0, 1));
        engine.recording = false;
        engine.playing = false;
        assert!(!engine.chord_handoff_valid(0, 1));
        assert!(!engine.chord_handoff_valid(16, 0));
        assert!(!engine.chord_handoff_valid(0, 8));
    }
}
