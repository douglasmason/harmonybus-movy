// Included in Engine: Chord Play joins an existing take without toggling it.
impl Engine {
    /// Replace the conductor's playing interval when a live chord activates.
    /// Keep the original record track, slot policy, and other actors intact.
    pub fn record_chord_activation(&mut self, track: usize, out: &mut Vec<OutEvent>) {
        if track >= NUM_TRACKS || !self.playing || !self.recording { return; }
        let slot = self.tracks[track].playing_slot.unwrap_or(self.tracks[track].active_clip);
        self.tracks[track].clips[slot].ensure_exists();
        if self.tracks[track].playing_slot.is_none() {
            self.tracks[track].playing_slot = Some(slot);
            self.tracks[track].pos_tick = self.tracks[track].clips[slot].loop_start_ticks();
        }
        self.joint_overwrite_mask |= 1 << track;
        self.joint_erase_tick(track, slot, out);
    }
}
