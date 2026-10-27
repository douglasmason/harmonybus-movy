impl Engine {
    pub fn generator_exploring(&self,track:usize)->bool {self.generator_explore.is_some_and(|state|state.track==track)}
    pub fn generator_owns(&self,track:usize)->bool {
        self.generator_exploring(track)||self.tracks.get(track).and_then(|target|target.playing()).is_some_and(|clip|clip.generator.is_some())
    }
    pub fn generator_mask(&self)->u16 {(0..NUM_TRACKS).filter(|track|self.generator_exploring(*track)||(self.playing&&(self.generator_owns(*track)||self.tracks[*track].playing().is_some_and(|clip|clip.recipe.as_ref().is_some_and(|recipe|recipe.name=="Comp-Generator"))))).fold(0,|mask,track|mask|(1<<track))}
    pub fn generator_settings(&self,track:usize)->Option<crate::part_settings::Settings> {
        if self.generator_exploring(track) {self.generator_restore[track]} else {None}
    }
    pub fn generator_info(&self,track:usize)->String {
        let Some(target)=self.tracks.get(track) else {return "error:Invalid track".into();};
        let config=self.generator_explore.filter(|state|state.track==track).map(|state|state.desired)
            .or(target.active().generator).unwrap_or_default();
        let mode=if self.generator_exploring(track) {if self.recording&&self.records_track(track){"Recording"}else{"Exploring"}}
            else if target.active().generator.is_some(){"Recorded"}else{"Off"};
        format!("{}|{}|{}|{}",mode,target.active_clip,config.wire(),self.generator_result)
    }
    /// Audition commands never enter the edit/dirty/Undo path.
    pub fn generator_explore_set(&mut self,message:&str,out:&mut Vec<OutEvent>)->bool {
        let fields:Vec<_>=message.split_whitespace().collect();
        if fields.len()==2&&fields[1]=="off" {self.generator_cancel(out);return true;}
        if fields.len()!=6 {self.generator_result="Invalid generator".into();return false;}
        let Some(track)=fields[1].parse::<usize>().ok().filter(|track|*track<NUM_TRACKS&&!self.track_is_drum(*track)) else {self.generator_result="Choose a melodic Comp track".into();return false;};
        let Some(config)=crate::generator::Config::parse(&fields[2..].join(" ")) else {return false;};
        if self.part_recording_busy() {
            let Some(state)=self.generator_explore.as_mut().filter(|state|state.track==track) else {self.generator_result="Finish recording first".into();return false;};
            if config.seed!=state.desired.seed {self.generator_result="Seed locked during recording".into();return false;}
            state.desired=config;return true;
        }
        if let Some(state)=self.generator_explore.as_mut().filter(|state|state.track==track) {state.desired=config;return true;}
        self.generator_cancel(out);
        self.flush_track_gates(track,out);
        self.generator_restore[track]=self.recipe_seen[track].or(self.recipe_bases[track]);
        self.generator_explore=Some(crate::generator::Explore {track,desired:config,current:config,take:None});
        self.generator_result="Explore - Rec saves to an empty clip".into();
        out.push(OutEvent::RecipeCapture{track:track as u8});true
    }
    pub fn generator_cancel(&mut self,out:&mut Vec<OutEvent>) {
        if let Some(state)=self.generator_explore.take() {
            if self.part_recording_busy()&&self.records_track(state.track) {if self.pending_rec {self.tracks[state.track].queued_slot=None;}self.recording=false;self.pending_rec=false;self.count_in_left=0;}
            self.flush_track_gates(state.track,out);
            self.recipe_seen[state.track]=None;
            self.generator_finish_take(state);
            self.recipe_tick(out);
        }
    }
    fn generator_finish_take(&mut self,state:crate::generator::Explore) {
        if let Some(slot)=state.take {
            let clip=&mut self.tracks[state.track].clips[slot];
            if let Some(config)=clip.generator {clip.length_steps=(config.end.max(1).div_ceil(crate::TICKS_PER_BAR)*16).min(256) as u16;}
        }
    }
    /// Validate before the normal Record command creates or arms a destination.
    fn generator_prepare_record(&mut self)->bool {
        let Some(state)=self.generator_explore else {return true;};
        if self.generator_restore[state.track].is_some_and(|settings|!settings.mapped()) {self.generator_result="Comp needs mapped input".into();return false;}
        let track=&self.tracks[state.track];
        let clip=track.active();
        if clip.exists() {self.generator_result="Choose an empty Comp clip".into();return false;}
        if self.source_routes[state.track].enabled {self.generator_result="Set Comp sources to Own before recording".into();return false;}
        let available=(0..8).filter(|lane|!track.lane_assigned[*lane]||crate::generator::internal(&track.lane_label[*lane])).count();
        if available<3 {self.generator_result="Three automation lanes needed".into();return false;}
        self.generator_result="Recording armed".into();true
    }
    fn generator_capture_tick(&mut self,track:usize,slot:usize,pos:u32) {
        let Some(mut state)=self.generator_explore.filter(|state|state.track==track) else {return;};
        if !self.recording||!self.records_track(track) {return;}
        if state.take.is_none() {
            let available=(0..8).filter(|lane|!self.tracks[track].lane_assigned[*lane]||crate::generator::internal(&self.tracks[track].lane_label[*lane])).count();
            if available<3 {self.recording=false;self.generator_result="Three automation lanes needed".into();return;}
            state.take=Some(slot);self.generator_explore=Some(state);
            let clip=&mut self.tracks[track].clips[slot];
            clip.generator=Some(state.current);
            clip.input_key=crate::follower_input::InputKey::new(0,1);
            clip.recipe=Some(crate::clip_recipe::Recipe {name:"Comp-Generator".into(),settings:self.generator_restore[track].unwrap_or_else(crate::part_settings::Settings::comp),gate:100});
            if let Some(base)=self.generator_restore[track] {self.recipe_bases[track].get_or_insert(base);}
            for (field,label) in crate::generator::LABELS.iter().enumerate() {
                let lane=(0..8).find(|lane|self.tracks[track].lane_assigned[*lane]&&self.tracks[track].lane_label[*lane]==*label)
                    .or_else(||(0..8).find(|lane|!self.tracks[track].lane_assigned[*lane])).unwrap();
                self.auto_label(track,lane,label);
                self.tracks[track].clips[slot].set_lock(lane as u8,0,state.current.values()[field]);
            }
            self.dirty=true;
        }
        if state.take!=Some(slot) {return;}
        if let Some(config)=&mut self.tracks[track].clips[slot].generator {config.end=config.end.max(pos+1);self.dirty=true;}
        if pos%TICKS_PER_STEP!=0 {return;}
        let step=(pos/TICKS_PER_STEP) as u16;
        for (field,label) in crate::generator::LABELS.iter().enumerate() {
            let Some(lane)=self.tracks[track].lane_label.iter().position(|name|name==label) else {self.generator_result="Generator lane removed".into();continue;};
            let value=state.current.values()[field];
            let clip=&self.tracks[track].clips[slot];
            let old=clip.generator.unwrap().at(clip,&self.tracks[track].lane_label,step).values()[field];
            if old!=value {if self.tracks[track].clips[slot].locks.len()>=crate::clip::MAX_LOCKS&&self.tracks[track].clips[slot].lock_at(lane as u8,step).is_none(){self.recording=false;self.generator_result="Automation capacity reached".into();return;}self.tracks[track].clips[slot].set_lock(lane as u8,step,value);self.dirty=true;}
        }
    }
    /// Called by the existing per-track clock, sharing its gate countdown and
    /// emit_clip_note ownership. No plan building or catalog parsing on ticks.
    fn generator_tick(&mut self,track:usize,out:&mut Vec<OutEvent>) {
        if !self.generator_owns(track)||self.tracks[track].muted {return;}
        if self.generator_exploring(track)&&self.generator_restore[track].is_some_and(|settings|!settings.mapped()) {
            self.generator_result="Comp needs Relative or Closest Split mapping".into();return;
        }
        let slot=self.tracks[track].playing_slot.unwrap_or(self.tracks[track].active_clip);
        if self.generator_explore.is_some_and(|state|state.track==track&&state.take.is_some_and(|take|take!=slot||self.tracks[track].clips[take].generator.is_none())) {
            self.generator_cancel(out);self.generator_result="Recording ended: clip changed".into();return;
        }
        let exploring=self.generator_exploring(track);
        let recording=self.recording&&self.records_track(track);
        let pos=if exploring&&!recording {self.master_tick.saturating_sub(1) as u32% (crate::TICKS_PER_BAR*4)} else {self.tracks[track].pos_tick};
        if let Some(state)=self.generator_explore.as_mut().filter(|state|state.track==track) {
            if pos%TICKS_PER_STEP==0 {state.current.complexity=state.desired.complexity;state.current.intensity=state.desired.intensity;}
            if pos%crate::TICKS_PER_BAR==0 {state.current.style=state.desired.style;state.current.seed=state.desired.seed;}
        }
        self.generator_capture_tick(track,slot,pos);
        // At most sixteen grid positions; only one can fire at this tick.
        let clip=&self.tracks[track].clips[slot];
        let (start,end,snum,sden)=if exploring&&!recording {(0,crate::TICKS_PER_BAR*4,1,1)}else{(clip.loop_start_ticks(),clip.loop_end_ticks(),clip.scale_num,clip.scale_den)};
        let bar=pos/crate::TICKS_PER_BAR*16;
        for local in 0..16 {
            let step=(bar+local) as u16;
            let tick=step as u32*TICKS_PER_STEP;
            if tick<start||tick>=end {continue;}
            let fire=(tick+self.swing_delay(step,snum,sden)).min(end-1);
            if fire!=pos {continue;}
            let config=if let Some(state)=self.generator_explore.filter(|state|state.track==track) {state.current}
                else {let clip=&self.tracks[track].clips[slot];clip.generator.unwrap().at(clip,&self.tracks[track].lane_label,step)};
            if let Some(note)=config.note(step) {self.emit_clip_note(track,track,slot,note,None,None,Default::default(),false,track,out);}
        }
    }
    pub fn generator_bake(&mut self,message:&str,out:&mut Vec<OutEvent>) {
        self.generator_result=match self.generator_bake_checked(message,out){Ok(())=>"Baked - Undo available".into(),Err(error)=>error.into()};
    }
    fn generator_bake_checked(&mut self,message:&str,out:&mut Vec<OutEvent>)->Result<(),&'static str> {
        let fields:Vec<_>=message.split_whitespace().collect();
        if fields.len()!=3 {return Err("Invalid Bake target");}
        let track=fields[1].parse::<usize>().map_err(|_|"Invalid track")?;
        let slot=fields[2].parse::<usize>().map_err(|_|"Invalid clip")?;
        if self.part_recording_busy()||self.generator_explore.is_some(){return Err("Stop exploring or recording first");}
        let target=self.tracks.get(track).ok_or("Invalid track")?;
        if slot!=target.active_clip{return Err("Clip changed");}
        let clip=target.clips.get(slot).ok_or("Invalid clip")?;
        let config=clip.generator.ok_or("Record a generator take first")?;
        if self.humanize.time_active(track)||(self.humanize.tracks&(1<<track)!=0&&self.humanize.velocity>0)
            ||self.hb_rhythm[track].enabled()||!clip.operation_intervals.is_empty()||!clip.grid_gates.is_empty()||!clip.trigs.is_empty() {
            return Err("Bake needs Humanize and clip rhythm operations off");
        }
        let mut baked=clip.clone();
        for step in clip.loop_start_steps..clip.loop_start_steps+clip.length_steps {
            if let Some(note)=config.at(clip,&target.lane_label,step).note(step) {baked.notes.push(note);}
        }
        for lane in 0..8 {
            if !target.lane_assigned[lane]||crate::generator::internal(&target.lane_label[lane]) {continue;}
            for note in &baked.notes {
                if clip.lock_at(lane as u8,note.step).is_some(){continue;}
                let value=crate::generator::lane_value(clip,lane as u8,note.step,target.lane_base[lane]);
                if baked.locks.len()>=crate::clip::MAX_LOCKS {return Err("Bake exceeds automation capacity");}
                baked.locks.push(crate::clip::Lock {lane:lane as u8,step:note.step,val:value});
            }
        }
        baked.generator=None;
        // Internal controls are consumed by the recipe, never sent to a synth.
        baked.locks.retain(|lock|!crate::generator::internal(&target.lane_label[lock.lane as usize]));
        self.flush_track_gates(track,out);
        self.tracks[track].clips[slot]=baked;
        self.free_unused_lanes(track);
        self.dirty=true;Ok(())
    }
}
