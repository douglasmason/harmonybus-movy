impl Engine {
    /// On-demand diagnostics only; never formatted by the audio render loop.
    pub fn source_diagnostics(&self) -> String {
        use std::fmt::Write;
        let mut text=String::from("{\"material\":\"direct\",\"cache_entries\":0,\"actors\":[");
        for actor in 0..NUM_TRACKS {
            if actor>0 {text.push(',');}
            let route=self.source_routes[actor];
            write!(&mut text,"{{\"actor\":{},\"enabled\":{},\"timeline\":{},\"gates\":{},\"sources\":[",actor,route.enabled,route.timeline,self.gates.iter().filter(|gate|gate.track as usize==actor).count()).unwrap();
            for (dimension,configured) in [route.pitch,route.rhythm].into_iter().enumerate() {
                if dimension>0 {text.push(',');}
                let resolved=configured.or_else(||self.tracks[actor].playing_slot.map(|slot|crate::source_route::ClipRef{track:actor,slot}));
                if let Some(reference)=resolved {
                    let track=&self.tracks[reference.track];let clip=&track.clips[reference.slot];
                    let active=self.playing && !track.muted && track.playing_slot==Some(reference.slot) && clip.exists();
                    write!(&mut text,"{{\"track\":{},\"slot\":{},\"active\":{},\"phase_ticks\":{},\"length_ticks\":{},\"speed_num\":{},\"speed_den\":{}}}",reference.track,reference.slot,active,track.pos_tick.saturating_sub(clip.loop_start_ticks()),clip.length_ticks(),clip.scale_num,clip.scale_den).unwrap();
                } else {text.push_str("null");}
            }
            text.push_str("]}");
        }
        text.push_str("]}");text
    }

    pub fn source_route_set(&mut self, message: &str) -> bool {
        let Some((actor, route))=crate::source_route::Route::parse(message) else {return false;};
        if self.source_routes[actor] != route {
            self.source_routes[actor]=route;
            self.source_cursors[actor]=Default::default();
            self.dirty=true;
        }
        true
    }

    /// Raw source views are resolved only at accepted rhythm attacks. No cached
    /// pointers survive an edit, launch, load, or eviction. At most MAX_NOTES
    /// entries are examined per source attack, never on an idle audio block.
    fn source_attack(&mut self, rhythm_track: usize, rhythm_slot: usize, duration: u32, out: &mut Vec<OutEvent>) {
        use crate::source_route::ClipRef;
        for actor in 0..NUM_TRACKS {
            let route=self.source_routes[actor];
            if !route.enabled || self.tracks[actor].muted || (self.recording && self.records_track(actor)) {continue;}
            let Some(actor_slot)=self.tracks[actor].playing_slot else {continue;};
            if !self.tracks[actor].clips[actor_slot].exists() {continue;}
            let own=ClipRef{track:actor,slot:actor_slot};
            if route.rhythm.unwrap_or(own)!= (ClipRef{track:rhythm_track,slot:rhythm_slot}) {continue;}
            // A donor can run before its destination in the track loop. Resolve
            // destination controls first, without advancing its clock or replaying
            // an actor that already ran (and may now point at the next tick).
            if self.shared_tick_seen[actor]!=self.master_tick {
                self.grid_tick(actor,out);
                self.shared_track(actor,out);
                self.emit_automation(actor,actor_slot,(self.source_positions[actor]/TICKS_PER_STEP) as u16,out);
            }
            let source=route.pitch.unwrap_or(own);
            let source_track=&self.tracks[source.track];
            if source_track.playing_slot!=Some(source.slot) || source_track.muted {continue;}
            let clip=&source_track.clips[source.slot];
            if !clip.exists() {continue;}
            let cursor=&mut self.source_cursors[actor];
            if cursor.source!=Some(source) {*cursor=crate::source_route::Cursor{source:Some(source),onset:None};}
            let start=clip.loop_start_ticks();let end=clip.loop_end_ticks();
            let eligible=|note: &&crate::clip::Note| note.vel>0 && !note.suppress && note.tick>=start && note.tick<end;
            let onset=if route.timeline {
                // Captured before any track advances on this master tick, so
                // source track numbering cannot change the selected pitch.
                let phase=self.source_positions[source.track];
                clip.notes.iter().take(crate::clip::MAX_NOTES).filter(eligible).filter(|note|note.tick<=phase).map(|note|note.tick).max()
                    .or_else(||clip.notes.iter().take(crate::clip::MAX_NOTES).filter(eligible).map(|note|note.tick).max())
            } else {
                clip.notes.iter().take(crate::clip::MAX_NOTES).filter(eligible).filter(|note|cursor.onset.map_or(true,|last|note.tick>last)).map(|note|note.tick).min()
                    .or_else(||clip.notes.iter().take(crate::clip::MAX_NOTES).filter(eligible).map(|note|note.tick).min())
            };
            let Some(onset)=onset else {continue;};
            cursor.onset=Some(onset);
            let length=clip.notes.len().min(crate::clip::MAX_NOTES);
            let expression=if source!=own {
                    let own_clip=&self.tracks[actor].clips[actor_slot];
                    let phase=self.source_positions[actor];
                    let own_notes=||own_clip.notes.iter().take(crate::clip::MAX_NOTES).filter(|entry|entry.vel>0&&!entry.suppress&&entry.tick>=own_clip.loop_start_ticks()&&entry.tick<own_clip.loop_end_ticks());
                    let expression=own_notes().filter(|entry|entry.tick<=phase).max_by_key(|entry|entry.tick)
                        .or_else(||own_notes().max_by_key(|entry|entry.tick));
                    expression.cloned()
            } else {None};
            for index in 0..length {
                let note=&self.tracks[source.track].clips[source.slot].notes[index];
                if note.tick!=onset || note.vel==0 || note.suppress {continue;}
                let mut note=note.clone();
                if source != own {
                    // Only pitches are borrowed. Expression and per-note
                    // operations default to the destination actor's material.
                    note.vel=expression.as_ref().map_or(100,|entry|entry.vel);
                    note.pressure=expression.as_ref().map_or_else(Vec::new,|entry|entry.pressure.clone());
                    note.actions=expression.as_ref().and_then(|entry|entry.actions);
                }
                // Preserve source key/rendered metadata, but resolve the output
                // on the destination actor through the ordinary HB MIDI path.
                self.emit_clip_note(actor,source.track,source.slot,note,Some(duration),None,
                    Default::default(),true,rhythm_track,out);
            }
        }
    }
}
