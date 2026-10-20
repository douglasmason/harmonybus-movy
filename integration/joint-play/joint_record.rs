// Included inside engine.rs, sharing the existing recorder and undo snapshot.
impl Engine {
    fn records_track(&self, track: usize) -> bool {
        track < NUM_TRACKS && if self.joint_record_mask == 0 {track == self.rec_track}
            else {self.joint_record_mask & (1 << track) != 0}
    }

    fn joint_cancel_queued(&mut self) {
        for track in 0..NUM_TRACKS {
            if self.joint_queued_mask & (1<<track)!=0 && self.tracks[track].queued_slot==Some(self.tracks[track].active_clip) {
                self.tracks[track].queued_slot=None;
            }
        }
        self.joint_queued_mask=0;
    }

    /// Start one take across an explicit actor mask. Existing playing clips win
    /// over edit selection. Conductor slots always replace, never overdub.
    pub fn toggle_joint_record(&mut self, mask: u16, overwrite: u16) {
        if self.recording || self.pending_rec || self.count_in_left > 0 {
            self.toggle_record(self.rec_track); return;
        }
        if mask == 0 {return;}
        self.joint_record_mask = 0;
        let leader = mask.trailing_zeros() as usize;
        for track in 0..NUM_TRACKS {
            if mask & (1 << track) == 0 {continue;}
            if let Some(slot) = self.tracks[track].playing_slot {self.tracks[track].active_clip = slot;}
        }
        self.toggle_record(leader);
        self.joint_queued_mask = 0;
        self.joint_record_mask = mask;
        self.joint_overwrite_mask = mask & (overwrite | 0x1111);
        self.rec_empty_start = false; // Each actor retains its chosen clip length.
        for track in 0..NUM_TRACKS {
            if mask & (1 << track) == 0 {continue;}
            let slot = self.tracks[track].active_clip;
            self.tracks[track].clips[slot].ensure_exists();
            self.tracks[track].pending_stop = false;
            if self.tracks[track].playing_slot.is_none() {
                if self.pending_rec {self.tracks[track].queued_slot = Some(slot);self.joint_queued_mask |= 1<<track;}
                else {self.tracks[track].playing_slot = Some(slot); self.tracks[track].pos_tick = self.tracks[track].clips[slot].loop_start_ticks();}
            }
        }
    }

    /// Replace only the elapsed recording interval, including rests. Newly
    /// recorded notes are protected for their first pass by the stock flag.
    fn joint_erase_tick(&mut self, track: usize, slot: usize, out: &mut Vec<OutEvent>) {
        if !self.recording || self.joint_overwrite_mask & (1 << track) == 0 || !self.records_track(track) {return;}
        let position = self.tracks[track].pos_tick;
        let clip = &mut self.tracks[track].clips[slot];
        let count = clip.notes.len();
        let mut changed = false;
        clip.notes.retain_mut(|note| {
            if note.suppress {return true;}
            if note.tick == position {return false;}
            if note.tick < position && note.tick.saturating_add(note.gate) > position {
                note.gate = position - note.tick;
                note.pressure.retain(|(offset,_)| *offset < note.gate);
                changed = true;
            }
            true
        });
        // Only notes and their attached intent are replaced. Independent knob
        // automation remains a separate editing responsibility.
        self.dirty |= changed || clip.notes.len() != count;
        let mut index = 0;
        while index < self.gates.len() {
            if self.gates[index].track as usize == track {
                let gate = self.gates.swap_remove(index);
                out.push(if gate.rendered {OutEvent::RenderedOff {track: gate.track,pitch:gate.pitch}}
                    else {OutEvent::NoteOff {track:gate.track,pitch:gate.pitch}});
            } else {index += 1;}
        }
    }

    /// Close recording ownership before a queued launch resets the playhead.
    /// The sounding note keeps its audio owner until the physical release.
    fn joint_before_launch(&mut self) {
        if self.joint_record_mask == 0 {return;}
        let mut index = 0;
        while index < self.rec_pending.len() {
            let track = self.rec_pending[index].track;
            if self.tracks[track].queued_slot.is_some() || self.tracks[track].pending_stop {
                let note = self.rec_pending.swap_remove(index); self.commit_rec_note(note, true);
            } else {index += 1;}
        }
        let mut index = 0;
        while index < self.rec_tail.len() {
            let track = self.rec_tail[index].track;
            if self.tracks[track].queued_slot.is_some() || self.tracks[track].pending_stop {
                let note = self.rec_tail.swap_remove(index); self.commit_rec_note(note, true);
            } else {index += 1;}
        }
    }
}

#[cfg(test)] mod joint_record_tests {
    use super::*;
    fn ready() -> Engine {
        let mut engine=Engine::new(48000,12000);
        engine.link_enabled=false;
        for track in 0..4 {engine.tracks[track].clips[0].ensure_exists();engine.tracks[track].clips[0].add_note_raw(0,0,24,60,90);engine.tracks[track].playing_slot=Some(0);}
        engine.playing=true; engine
    }
    #[test] fn equal_pitches_on_different_actors_keep_their_owners() {
        let mut engine=ready();engine.toggle_joint_record(15,5);
        engine.live_note_on(1,67,70);engine.live_note_on(3,67,100);
        engine.tracks[1].pos_tick=12;engine.tracks[3].pos_tick=24;
        engine.live_note_off(1,67);assert_eq!(engine.rec_pending.len(),1);
        engine.live_note_off(3,67);
        assert_eq!(engine.tracks[1].clips[0].notes.last().unwrap().gate,12);
        assert_eq!(engine.tracks[3].clips[0].notes.last().unwrap().gate,24);
    }
    #[test] fn conductor_replaces_while_bass_and_melody_layer() {
        let mut engine=ready();engine.toggle_joint_record(15,0);
        let mut output=Vec::new();for track in 0..4 {engine.joint_erase_tick(track,0,&mut output);}
        assert!(engine.tracks[0].clips[0].notes.is_empty());
        assert_eq!(engine.tracks[1].clips[0].notes.len(),1);
        assert_eq!(engine.tracks[3].clips[0].notes.len(),1);
    }
    #[test] fn targets_playing_clip_and_closes_tail_before_launch() {
        let mut engine=ready();engine.tracks[3].active_clip=2;engine.toggle_joint_record(8,0);
        engine.live_note_on(3,72,100);assert_eq!(engine.rec_pending[0].slot,0);
        engine.tracks[3].pos_tick=48;engine.tracks[3].queued_slot=Some(2);engine.joint_before_launch();
        assert!(engine.rec_pending.is_empty());assert_eq!(engine.tracks[3].clips[0].notes.last().unwrap().pitch,72);
        assert!(!engine.tracks[3].clips[2].exists());
    }
}

#[cfg(test)] mod joint_cancel_tests {
    use super::*;
    #[test]fn cancelling_queued_take_cancels_all_actor_launches(){
        let mut engine=Engine::new(48000,12000);engine.link_enabled=false;engine.playing=true;
        engine.toggle_joint_record(15,5);
        assert!(engine.pending_rec);
        assert_eq!(engine.tracks[3].queued_slot,Some(0));
        engine.toggle_record(0); // Cancellation also works after leaving Joint Play.
        assert!(engine.tracks[..4].iter().all(|track|track.queued_slot.is_none()));
    }
}
