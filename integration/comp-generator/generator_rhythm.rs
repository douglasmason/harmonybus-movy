impl Engine {
    /// A recorded recipe keeps musical material; only its external rhythm route
    /// becomes active. Cloud, free/first-take and Record retain their own clocks.
    pub fn generator_rhythm_following(&self,track:usize)->bool {
        let Some(target)=self.tracks.get(track) else {return false;};
        let Some(slot)=target.playing_slot else {return false;};
        let route=self.source_routes[track];
        route.enabled && route.rhythm.is_some_and(|source|source!=crate::source_route::ClipRef{track,slot})
            && !self.generator_free(track) && !((self.recording||self.pending_rec)&&self.records_track(track))
            && target.clips[slot].generator.is_some_and(|config|!config.is_cloud())
            && !(self.generator_exploring(track)&&self.generator_settings(track).is_some_and(|settings|!settings.mapped()))
    }

    /// The same complementary phase mask as ordinary Source Weaving. This is
    /// queried after the original generator decision, so raw donation is intact.
    fn generator_rhythm_own(&self,track:usize)->bool {
        if !self.generator_rhythm_following(track) {return false;}
        let target=&self.tracks[track];let slot=target.playing_slot.unwrap();
        !self.source_routes[track].follows_rhythm(track,slot,
            self.source_positions[track].saturating_sub(target.clips[slot].loop_start_ticks()))
    }

    /// Sample abstract phrase material only at an accepted donor onset. Read
    /// controls once, then search backwards through at most 256 pure candidates.
    /// No rendered MIDI, materialized clip, note cache or transport advancement.
    fn generator_rhythm_attack(&mut self,track:usize,slot:usize,clock_track:usize,duration:u32,out:&mut Vec<OutEvent>) {
        let target=&self.tracks[track];let clip=&target.clips[slot];
        let pos=self.source_positions[track];
        let config=if let Some(state)=self.source_generator_previews[track] {
            self.generator_preview_at(track,slot,pos,state).current
        }else{clip.generator.unwrap().at(clip,&target.lane_label,(pos/TICKS_PER_STEP) as u16)};
        if config.end>0&&pos>=config.end {return;}
        let start=clip.loop_start_steps;
        let end=start+clip.length_steps.min(256);
        let fire=|step:u16|(u32::from(step)*TICKS_PER_STEP+self.swing_delay(step,clip.scale_num,clip.scale_den)).min(clip.loop_end_ticks()-1);
        // A donor before/after the actor sees the same captured phase and
        // preview controls. A swung future attack belongs to the wrap fallback.
        let note=(start..end).rev().filter(|step|fire(*step)<=pos)
            .chain((start..end).rev().filter(|step|fire(*step)>pos))
            .find_map(|step|config.note(step));
        if let Some(note)=note {self.generator_emit_note(track,slot,note,config,Some(duration),clock_track,out);}
    }
}
