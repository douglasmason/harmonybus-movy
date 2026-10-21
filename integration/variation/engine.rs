impl Engine {
    pub fn variation_set(&mut self, message: &str) -> bool {
        let Some((actor, config)) = crate::variation::Variation::parse(message) else { return false; };
        if self.variations[actor] != config {
            self.variations[actor] = config;
            if !self.playing { self.variation_seeds[actor] = config.seed; }
            self.dirty = true;
        }
        true
    }
    fn variation_bar(&mut self) {
        if self.master_tick % (TICKS_PER_STEP * 16) as u64 == 0 {
            for actor in 0..NUM_TRACKS { self.variation_seeds[actor] = self.variations[actor].seed; }
        }
    }
}
