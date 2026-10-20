    /// On-demand display metadata only. Never projects or modifies a stored note.
    pub fn clip_input_info(&self) -> String {
        let track = self.watch_track;
        let clip = self.tracks[track].active();
        let target = self.follower_inputs[track];
        let mut kind = "empty";
        let mut source = None;
        for note in &clip.notes {
            let note_kind = if note.rendered { "rendered" }
                else if note.input_key.is_some() && target.is_some() { "mapped" }
                else { "fixed" };
            if kind == "empty" { kind = note_kind; source = note.input_key; }
            else if kind != note_kind || (kind == "mapped" && source != note.input_key) {
                kind = "mixed";
                break;
            }
        }
        let (root, scale) = source.map_or((-1, -1), |key| (key.root as i32, key.scale as i32));
        let (target_root, target_scale) = target.map_or((-1, -1), |key| (key.root as i32, key.scale as i32));
        format!("ci1,{track},{kind},{root},{scale},{target_root},{target_scale}")
    }
