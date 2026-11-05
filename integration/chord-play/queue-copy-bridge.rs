// The copy request and undo commands execute in their original batch order.
// Queue inspection happens only for an explicit review or commit.
impl Instance {
    fn chord_copy_snapshot(&mut self, track: usize) -> Result<seq_core::engine::ChordQueueSnapshot, String> {
        if self.chord_queue != Some(track) { return Err("No queue on this conductor".into()); }
        let mut buffer = [0u8; 32768];
        let length = self.chains.hb_chord_queue_export(track, &mut buffer);
        if length <= 0 || length as usize >= buffer.len() { return Err("Queue export unavailable - update HarmonyBus".into()); }
        let text = std::str::from_utf8(&buffer[..length as usize]).map_err(|_| "Invalid queue export")?;
        if let Some(error) = text.strip_prefix("error:") { return Err(error.into()); }
        seq_core::engine::ChordQueueSnapshot::parse(text).map_err(str::to_owned)
    }
    fn chord_copy_info(&mut self, track: usize) -> String {
        match self.chord_copy_snapshot(track) {
            Ok(snapshot) => format!("qc1|{:016x}|{}|{}|{}", snapshot.token, snapshot.clip.notes.len(),
                snapshot.clip.length_ticks(), self.engine.chord_copy_empty_mask(track)),
            Err(error) => format!("error:{error}"),
        }
    }
    fn copy_chord_queue_command(&mut self, operation: &str) {
        let result = (|| -> Result<(), String> {
            let mut fields = operation.split_whitespace();
            let handoff = match fields.next() { Some("qcopy") => false, Some("qhandoff") => true, _ => return Err("Invalid queue copy".into()) };
            let track = fields.next().and_then(|text| text.parse::<usize>().ok()).ok_or("Invalid conductor")?;
            let slot = fields.next().and_then(|text| text.parse::<usize>().ok()).ok_or("Invalid clip")?;
            let token = fields.next().and_then(|text| u64::from_str_radix(text, 16).ok()).ok_or("Invalid queue identity")?;
            if fields.next().is_some() { return Err("Invalid queue copy".into()); }
            let snapshot = self.chord_copy_snapshot(track)?;
            if handoff {
                if !self.engine.chord_handoff_context(track, slot) {
                    return Err("Handoff needs running own clip / no pending launch or generator".into());
                }
                self.chains.set_param(track, "midi_fx1:hb_chord_queue_handoff", &format!("{token:016x}"));
                if !matches!(self.chains.hb_chord_handoff_ready(track), Some(0 | 1)) {
                    return Err("Handoff unavailable - check queue / update HarmonyBus".into());
                }
            }
            if let Err(error) = self.engine.copy_chord_queue(snapshot, track, slot, token) {
                if handoff { self.chains.set_param(track, "midi_fx1:hb_chord_queue_handoff", "off"); }
                return Err(error.into());
            }
            if handoff { self.chord_handoff = Some((track, slot)); }
            Ok(())
        })();
        self.chord_copy_result = match result {
            Ok(()) => if self.chord_handoff.is_some() { "Copied - handoff at cycle start".into() } else { "Copied - queue still live".into() },
            Err(error) => format!("error:{error}"),
        };
    }
}
