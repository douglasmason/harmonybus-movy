fn chord_handoff_preserves_command(operation: &str) -> bool {
    matches!(operation.split_whitespace().next(), Some("usnap" | "ucommit" | "non" | "nof" | "npr" | "dfire" | "watch" | "wlane" | "hold" | "abase" | "abaseq" | "alabel" | "gview" | "cpy" | "cpyclr" | "clipcopy") | None)
}

impl Instance {
    fn cancel_chord_handoff(&mut self) {
        if let Some((track, _)) = self.chord_handoff.take() {
            self.chains.set_param(track, "midi_fx1:hb_chord_queue_handoff", "off");
            self.chord_copy_result = "Handoff cancelled".into();
        }
    }

    fn service_chord_handoff(&mut self) -> bool {
        let Some((track, slot)) = self.chord_handoff else { return false; };
        if self.chord_queue != Some(track) || !self.engine.chord_handoff_valid(track, slot) {
            self.cancel_chord_handoff();
            return false;
        }
        match self.chains.hb_chord_handoff_ready(track) {
            Some(0) => false,
            Some(1) => {
                let Some(due) = self.chains.hb_chord_handoff_tick(track) else {
                    self.cancel_chord_handoff(); return false;
                };
                let completed = self.engine.hb_master_tick().saturating_sub(1);
                let late = completed.saturating_sub(due);
                // Advance within the first gate to preserve the native phase.
                // A missed chord or long stall cancels instead of compressing music.
                let first_gate = self.engine.tracks[track].clips[slot].notes.first().map_or(0, |note| note.gate);
                if due > completed || late > 8 || late >= u64::from(first_gate) {
                    self.cancel_chord_handoff(); return false;
                }
                self.chord_handoff = None;
                // Release the virtual input before the one saved first attack.
                self.release_chord_selection();
                self.clear_chord_queue();
                self.engine.handoff_chord_clip(track, slot, late as u32, &mut self.out);
                let message = hb_loop::snapshot(&self.engine, track).message();
                self.chains.hb_clip(track, message.as_c_str());
                self.drain_out();
                self.chord_copy_result = "Handoff complete - clip playing".into();
                true
            }
            _ => { self.cancel_chord_handoff(); false }
        }
    }
}
