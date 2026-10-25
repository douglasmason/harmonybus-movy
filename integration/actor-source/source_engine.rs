impl Engine {
    /// Bounded, read-only snapshot of one actor. Gate pitches are sequencer
    /// inputs to HB, not a prediction of final harmony/arp rendering.
    pub fn source_preview(&self, actor: usize) -> Option<String> {
        use std::fmt::Write;
        let track=self.tracks.get(actor)?;
        let route=self.source_routes[actor];
        let recording=self.recording && self.records_track(actor);
        let mut text=format!("{{\"schema\":1,\"actor\":{},\"enabled\":{},\"playing\":{},\"muted\":{},\"recording\":{},\"instrument_fit\":{},\"expression_fit\":{},\"alignment\":{},\"timeline\":{},\"sources\":[",actor,route.enabled,self.playing,track.muted,recording,route.instrument_fit,route.expression_fit,route.alignment as u8,(route.alignment==crate::source_route::Alignment::Timeline));
        for (dimension,configured) in [route.pitch,route.rhythm,route.expression,route.instrument,route.hb_render,route.note_ops,route.grid_holds,route.gestures].into_iter().enumerate() {
            if dimension>0 {text.push(',');}
            let resolved=configured.or_else(||track.playing_slot.map(|slot|crate::source_route::ClipRef{track:actor,slot}));
            if let Some(reference)=resolved {
                let donor=&self.tracks[reference.track];let clip=&donor.clips[reference.slot];
                let active=self.playing && !donor.muted && donor.playing_slot==Some(reference.slot) && clip.exists();
                let phase=donor.pos_tick.saturating_sub(clip.loop_start_ticks());
                let selected=if (dimension==0 && route.alignment==crate::source_route::Alignment::FitWindow)
                    || (dimension==2 && route.expression_fit) || (dimension==3 && route.instrument_fit) {
                    track.playing().map_or(phase,|actor_clip|crate::source_route::fitted_phase(
                        track.pos_tick,actor_clip.loop_start_ticks(),actor_clip.length_ticks(),0,clip.length_ticks()))
                } else {phase};
                write!(&mut text,"{{\"track\":{},\"slot\":{},\"active\":{},\"phase_ticks\":{},\"selection_phase_ticks\":{},\"length_ticks\":{}}}",reference.track,reference.slot,active,phase,selected,clip.length_ticks()).unwrap();
            } else {text.push_str("null");}
        }
        text.push_str("],\"notes\":[");
        let mut count=0;
        let mut pitches=[false;128];let mut gates=0;
        for gate in &self.gates {if gate.track as usize==actor {pitches[gate.pitch as usize]=true;gates+=1;}}
        // Scan the existing gate owner; never retain another output history.
        for pitch in 0..128u8 {
            if pitches[pitch as usize] {
                if count>0 {text.push(',');}
                write!(&mut text,"{}",pitch).unwrap();count+=1;
            }
        }
        write!(&mut text,"],\"gates\":{}}}",gates).unwrap();
        Some(text)
    }

    /// On-demand diagnostics only; never formatted by the audio render loop.
    pub fn source_diagnostics(&self) -> String {
        use std::fmt::Write;
        let mut text=String::from("{\"material\":\"direct\",\"cache_entries\":0,\"actors\":[");
        for actor in 0..NUM_TRACKS {
            if actor>0 {text.push(',');}
            let route=self.source_routes[actor];
            write!(&mut text,"{{\"actor\":{},\"enabled\":{},\"instrument_fit\":{},\"expression_fit\":{},\"alignment\":{},\"timeline\":{},\"gates\":{},\"sources\":[",actor,route.enabled,route.instrument_fit,route.expression_fit,route.alignment as u8,(route.alignment==crate::source_route::Alignment::Timeline),self.gates.iter().filter(|gate|gate.track as usize==actor).count()).unwrap();
            for (dimension,configured) in [route.pitch,route.rhythm,route.expression,route.instrument,route.hb_render,route.note_ops,route.grid_holds,route.gestures].into_iter().enumerate() {
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
            let previous=self.source_routes[actor];
            if previous.pitch!=route.pitch || previous.rhythm!=route.rhythm || previous.alignment!=route.alignment || previous.enabled!=route.enabled {
                self.source_cursors[actor]=Default::default();
            }
            self.source_automation_seen[actor]=None;
            self.source_routes[actor]=route;
            self.dirty=true;
        }
        true
    }

    /// Sample the last raw note at the donor's independently captured phase.
    /// Tied chord entries use the last stored note, matching legacy Own behavior.
    fn source_phase_note(&self, reference: crate::source_route::ClipRef) -> Option<crate::clip::Note> {
        self.source_note_at(reference,self.source_positions[reference.track])
    }

    fn source_note_at(&self, reference: crate::source_route::ClipRef, phase:u32) -> Option<crate::clip::Note> {
        let clip=&self.tracks[reference.track].clips[reference.slot];
        let notes=||clip.notes.iter().take(crate::clip::MAX_NOTES).filter(|note|
            note.vel>0 && !note.suppress && note.tick>=clip.loop_start_ticks() && note.tick<clip.loop_end_ticks());
        notes().filter(|note|note.tick<=phase).max_by_key(|note|note.tick)
            .or_else(||notes().max_by_key(|note|note.tick)).cloned()
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
            // An explicitly selected expression clip must be available before
            // consuming a sequential pitch. Read raw notes, never its own route.
            let expression_source=route.expression.unwrap_or(own);
            let expression_track=&self.tracks[expression_source.track];
            let expression_clip=&expression_track.clips[expression_source.slot];
            if expression_track.muted || expression_track.playing_slot!=Some(expression_source.slot) || !expression_clip.exists() {continue;}
            let pitch_phase=if route.alignment==crate::source_route::Alignment::FitWindow {
                let actor_clip=&self.tracks[actor].clips[actor_slot];
                crate::source_route::fitted_phase(self.source_positions[actor],actor_clip.loop_start_ticks(),
                    actor_clip.length_ticks(),clip.loop_start_ticks(),clip.length_ticks())
            } else {self.source_positions[source.track]};
            let cursor=&mut self.source_cursors[actor];
            if cursor.source!=Some(source) {*cursor=crate::source_route::Cursor{source:Some(source),onset:None};}
            let start=clip.loop_start_ticks();let end=clip.loop_end_ticks();
            let eligible=|note: &&crate::clip::Note| note.vel>0 && !note.suppress && note.tick>=start && note.tick<end;
            let onset=if route.alignment!=crate::source_route::Alignment::Sequential {
                // Captured before any track advances on this master tick, so
                // source track numbering cannot change the selected pitch.
                let phase=pitch_phase;
                clip.notes.iter().take(crate::clip::MAX_NOTES).filter(eligible).filter(|note|note.tick<=phase).map(|note|note.tick).max()
                    .or_else(||clip.notes.iter().take(crate::clip::MAX_NOTES).filter(eligible).map(|note|note.tick).max())
            } else {
                clip.notes.iter().take(crate::clip::MAX_NOTES).filter(eligible).filter(|note|cursor.onset.map_or(true,|last|note.tick>last)).map(|note|note.tick).min()
                    .or_else(||clip.notes.iter().take(crate::clip::MAX_NOTES).filter(eligible).map(|note|note.tick).min())
            };
            let Some(onset)=onset else {continue;};
            cursor.onset=Some(onset);
            let length=clip.notes.len().min(crate::clip::MAX_NOTES);
            let destination=if source!=own {self.source_phase_note(own)} else {None};
            let expression=route.expression.map(|reference| {
                let phase=if route.expression_fit {
                    let actor_clip=&self.tracks[actor].clips[actor_slot];
                    crate::source_route::fitted_phase(self.source_positions[actor],actor_clip.loop_start_ticks(),
                        actor_clip.length_ticks(),expression_clip.loop_start_ticks(),expression_clip.length_ticks())
                } else {self.source_positions[reference.track]};
                self.source_note_at(reference,phase)
            });
            // Operations are immutable note-relative outcomes, not timed holds.
            // An unavailable donor restores the existing destination behavior.
            let note_ops=route.note_ops.filter(|reference| {
                let track=&self.tracks[reference.track];
                !track.muted && track.playing_slot==Some(reference.slot) && track.clips[reference.slot].exists()
            }).map(|reference|self.source_phase_note(reference).and_then(|note|note.actions));
            for index in 0..length {
                let note=&self.tracks[source.track].clips[source.slot].notes[index];
                if note.tick!=onset || note.vel==0 || note.suppress {continue;}
                let mut note=note.clone();
                if source != own {
                    // Only pitches are borrowed. Expression and per-note
                    // operations default to the destination actor's material.
                    note.vel=destination.as_ref().map_or(100,|entry|entry.vel);
                    note.pressure=destination.as_ref().map_or_else(Vec::new,|entry|entry.pressure.clone());
                    note.actions=destination.as_ref().and_then(|entry|entry.actions);
                }
                if let Some(expression)=&expression {
                    note.vel=expression.as_ref().map_or(100,|entry|entry.vel);
                    note.pressure=expression.as_ref().map_or_else(Vec::new,|entry|entry.pressure.clone());
                }
                if let Some(actions)=note_ops {note.actions=actions;}
                // Preserve source key/rendered metadata, but resolve the output
                // on the destination actor through the ordinary HB MIDI path.
                self.emit_clip_note(actor,source.track,source.slot,note,Some(duration),None,
                    Default::default(),true,rhythm_track,out);
            }
        }
    }
}
