// Included in engine.rs: Copy is a single persistent edit; live queue and
// playback ownership remain outside this saved abstract clip.
#[derive(Debug)]
pub struct ChordQueueSnapshot {
    pub token: u64,
    pub clip: crate::clip::Clip,
}
impl ChordQueueSnapshot {
    /// Validate a bounded native export before changing any destination.
    pub fn parse(message: &str) -> Result<Self, &'static str> {
        let mut fields = message.split('|');
        if fields.next() != Some("qx1") { return Err("Queue export unavailable - update HarmonyBus"); }
        let token = u64::from_str_radix(fields.next().ok_or("Missing queue identity")?, 16)
            .map_err(|_| "Invalid queue identity")?;
        let count = fields.next().and_then(|value| value.parse::<usize>().ok()).ok_or("Invalid chord count")?;
        let duration = fields.next().and_then(|value| value.parse::<u32>().ok()).ok_or("Invalid queue length")?;
        if count == 0 || count > crate::clip::MAX_NOTES || duration == 0 || duration > crate::clip::MAX_STEPS as u32 * crate::TICKS_PER_STEP || duration % crate::TICKS_PER_STEP != 0 {
            return Err("Queue exceeds clip capacity");
        }
        let mut clip = crate::clip::Clip::new();
        clip.length_steps = (duration / crate::TICKS_PER_STEP) as u16;
        clip.notes.try_reserve_exact(count).map_err(|_| "Not enough memory to copy queue")?;
        let mut tick = 0u32;
        let mut signature = 14695981039346656037u64;
        for _ in 0..count {
            let mut values = fields.next().ok_or("Incomplete queue export")?.split(',');
            let pitch = values.next().and_then(|value| value.parse::<u8>().ok()).filter(|pitch| *pitch < 128).ok_or("Invalid chord pitch")?;
            let word = u64::from_str_radix(values.next().ok_or("Missing chord descriptor")?, 16).map_err(|_| "Invalid chord descriptor")?;
            let gate = values.next().and_then(|value| value.parse::<u32>().ok()).filter(|gate| *gate > 0).ok_or("Invalid chord duration")?;
            if values.next().is_some() { return Err("Invalid chord entry"); }
            let mut actions = [0; crate::recorded_actions::LANES + 1];
            actions[0] = word;
            if !crate::recorded_actions::chord_selection(&actions) { return Err("Invalid chord descriptor"); }
            let end = tick.checked_add(gate).filter(|end| *end <= duration).ok_or("Invalid queue duration")?;
            for value in [word, pitch as u64, gate as u64] {
                for byte in value.to_le_bytes() { signature = (signature ^ byte as u64).wrapping_mul(1099511628211); }
            }
            clip.notes.push(crate::clip::Note {
                tick, gate, pitch, vel: 100, step: (tick / crate::TICKS_PER_STEP) as u16,
                actions: Some(actions), input_key: None, pressure: Vec::new(),
                rendered: false, suppress: false, fired: false,
            });
            tick = end;
        }
        if fields.next().is_some() || tick != duration || token != signature { return Err("Incomplete or changed queue export"); }
        Ok(Self { token, clip })
    }
}
impl Engine {
    /// Empty means no saved clip, including empty-but-created and recipe clips.
    pub fn chord_copy_empty_mask(&self, track: usize) -> u16 {
        let Some(target) = self.tracks.get(track) else { return 0; };
        target.clips.iter().enumerate().fold(0, |mask, (slot, clip)| {
            mask | if !clip.exists() && clip.notes.is_empty() && clip.locks.is_empty() && clip.trigs.is_empty()
                && clip.shared_events.is_empty() && clip.operation_intervals.is_empty() && clip.grid_gates.is_empty()
                && clip.recipe.is_none() && clip.generator.is_none() { 1 << slot } else { 0 }
        })
    }

    /// Publish only after all checks; preserve focus, clip clocks and live notes.
    pub fn copy_chord_queue(&mut self, mut snapshot: ChordQueueSnapshot, track: usize, slot: usize, token: u64) -> Result<(), &'static str> {
        if self.part_recording_busy() { return Err("Finish recording first"); }
        if track >= self.tracks.len() || self.track_is_drum(track) || slot >= crate::track::CLIPS_PER_TRACK {
            return Err("Invalid conductor destination");
        }
        if token != snapshot.token { return Err("Queue changed - copy again"); }
        if self.chord_copy_empty_mask(track) & (1 << slot) == 0 { return Err("Clip occupied - choose an empty slot"); }
        let target = &self.tracks[track];
        if target.playing_slot == Some(slot) || target.queued_slot == Some(slot) || target.pending_select == Some(slot) {
            return Err("Destination is already launching");
        }
        let key = self.follower_inputs[track].map(|mut key| { key.transpose = 0; key });
        snapshot.clip.input_key = key;
        for note in &mut snapshot.clip.notes { note.input_key = key; }
        self.tracks[track].clips[slot] = snapshot.clip;
        self.source_automation_invalidate();
        self.capture.clear();
        self.dirty = true;
        Ok(())
    }
}
