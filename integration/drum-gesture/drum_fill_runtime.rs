// Included in engine.rs; uses the ordinary clip clock and note owner.
#[derive(Clone,Copy)]
pub(crate) struct DrumFillGesture {spec:crate::drum_fill_spec::Spec,slot:usize,start:u32,end:u32,loop_start:u32,cycle:u32}
impl Engine {
    pub fn trigger_drum_fill(&mut self,message:&str){
        self.drum_fill_result=match self.prepare_drum_fill(message){Ok(())=>"Drum fill queued".into(),Err(error)=>format!("error:{error}")};
    }
    fn prepare_drum_fill(&mut self,message:&str)->Result<(),&'static str>{
        let spec=crate::drum_fill_spec::Spec::parse(message).ok_or("Invalid drum fill")?;
        if !self.track_is_drum(spec.track){return Err("Select a drum track");}
        if !self.playing||self.count_in_left>0{return Err("Start the drum clip first");}
        let track=&self.tracks[spec.track];
        let slot=track.playing_slot.ok_or("Start the drum clip first")?;
        let clip=&track.clips[slot];if !clip.exists(){return Err("Start the drum clip first");}
        if self.source_routes[spec.track].enabled{return Err("Disable drum source weaving first");}
        let (start,end)=spec.window(clip);
        // No mutation on a failed recording request; performance without Record
        // does not consume clip capacity.
        if self.recording&&self.records_track(spec.track)&&clip.notes.len()+(end-start).div_ceil(spec.grid) as usize>crate::clip::MAX_NOTES{return Err("Clip full; finish recording or free notes");}
        self.drum_fills[spec.track]=Some(DrumFillGesture{spec,slot,start,end,loop_start:clip.loop_start_ticks(),cycle:track.cycle});Ok(())
    }
    fn drum_fill_tick(&mut self,track:usize,out:&mut Vec<OutEvent>)->Option<u8>{
        let fill=self.drum_fills[track]?;
        let target=&self.tracks[track];let pos=target.pos_tick;
        let valid=self.track_is_drum(track)&&target.playing_slot==Some(fill.slot)&&target.cycle==fill.cycle&&
            target.clips[fill.slot].loop_start_ticks()==fill.loop_start&&target.clips[fill.slot].loop_end_ticks()==fill.end&&!self.source_routes[track].enabled;
        if !valid {self.drum_fills[track]=None;return None;}
        if pos<fill.start{return None;}
        if pos>=fill.end{self.drum_fills[track]=None;return None;}
        if pos+1==fill.end{self.drum_fills[track]=None;}
        if target.muted||self.song_clip_rest(track){return Some(fill.spec.pitch);}
        let (snum,sden,quant)={let clip=&target.clips[fill.slot];(clip.scale_num,clip.scale_den,clip.quant)};
        let recording=self.recording&&self.records_track(track);
        // Record only elapsed time. Turning Record off mid-fill leaves the
        // unperformed remainder intact; other drum lanes are never replaced.
        if recording {
            let swing=self.swing_pct;
            let clip=&mut self.tracks[track].clips[fill.slot];let before=clip.notes.len();
            clip.notes.retain(|note|note.pitch!=fill.spec.pitch||note.suppress||crate::clip_tools::playback_tick(note,quant,crate::clip_tools::swing_delay(swing,note.step,snum,sden),fill.end,fill.end-fill.loop_start)!=pos);
            self.dirty|=before!=clip.notes.len();
        }
        // At most sixteen candidates, only while this gesture is in its tail.
        // Use the editor's authored grid and ordinary swing playback mapping.
        for tick in (fill.start..fill.end).step_by(fill.spec.grid as usize){
            let mut note=fill.spec.note(tick,fill.end);
            let onset=crate::clip_tools::playback_tick(&note,quant,self.swing_delay(note.step,snum,sden),fill.end,fill.end-fill.loop_start);
            if onset!=pos{continue;}
            note.gate=note.gate.min(fill.end-pos);
            if recording {
                let clip=&mut self.tracks[track].clips[fill.slot];
                if clip.notes.len()>=crate::clip::MAX_NOTES{self.drum_fill_result="error:Clip full; fill not recorded".into();}
                else {let mut saved=note.clone();saved.suppress=true;saved.fired=true;clip.notes.push(saved);self.dirty=true;}
            }
            self.emit_clip_note(track,track,fill.slot,note,None,None,Default::default(),true,track,out);
        }
        Some(fill.spec.pitch)
    }
}
