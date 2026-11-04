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
            if fields.next() != Some("qcopy") { return Err("Invalid queue copy".into()); }
            let track = fields.next().and_then(|text| text.parse::<usize>().ok()).ok_or("Invalid conductor")?;
            let slot = fields.next().and_then(|text| text.parse::<usize>().ok()).ok_or("Invalid clip")?;
            let token = fields.next().and_then(|text| u64::from_str_radix(text, 16).ok()).ok_or("Invalid queue identity")?;
            if fields.next().is_some() { return Err("Invalid queue copy".into()); }
            let snapshot = self.chord_copy_snapshot(track)?;
            self.engine.copy_chord_queue(snapshot, track, slot, token).map_err(str::to_owned)
        })();
        self.chord_copy_result = match result {
            Ok(()) => "Copied - queue still live".into(),
            Err(error) => format!("error:{error}"),
        };
    }
}
