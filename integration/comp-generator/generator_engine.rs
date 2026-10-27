impl Engine {
    pub fn generator_exploring(&self,track:usize)->bool {self.generator_explore.get(track).is_some_and(Option::is_some)}
    pub fn generator_free(&self,track:usize)->bool {self.generator_explore.get(track).copied().flatten().is_some_and(|state|state.source.is_none())}
    pub fn generator_owns(&self,track:usize)->bool {
        self.generator_exploring(track)||self.tracks.get(track).and_then(|target|target.playing()).is_some_and(|clip|clip.generator.is_some())
    }
    pub fn generator_mask(&self)->u16 {(0..NUM_TRACKS).filter(|track|self.generator_exploring(*track)||(self.playing&&(self.generator_owns(*track)||self.tracks[*track].playing().is_some_and(|clip|clip.recipe.as_ref().is_some_and(|recipe|matches!(recipe.name.as_str(),"Comp-Generator"|"Bass-Generator")))))).fold(0,|mask,track|mask|(1<<track))}
    pub fn generator_settings(&self,track:usize)->Option<crate::part_settings::Settings> {
        self.generator_explore[track].and_then(|state|self.generator_restore[track].map(|settings|if state.source.is_none(){state.current.settings(settings)}else{settings}))
    }
    pub fn generator_info(&self,track:usize)->String {
        let Some(target)=self.tracks.get(track) else {return "error:Invalid track".into();};
        let clip=target.active();
        let step=if self.playing&&target.playing_slot==Some(target.active_clip) {(target.pos_tick/TICKS_PER_STEP) as u16}else{clip.loop_start_steps};
        let mut config=clip.generator.map(|config|config.at(clip,&target.lane_label,step)).unwrap_or_default();
        let state=self.generator_explore[track].filter(|state|state.source.is_none_or(|slot|slot==target.active_clip&&clip.generator.is_some()));
        if let Some(state)=state {
            if state.source.is_none(){config=state.desired;}else{config=Self::generator_override(config,state.desired,state.touched);}
        }
        let mode=if let Some(state)=state {if self.recording&&self.records_track(track){if state.source.is_some(){"Overdub"}else{"Recording"}}else if state.source.is_some(){"Preview"}else{"Exploring"}}
            else if target.active().generator.is_some(){"Recorded"}else{"Off"};
        format!("{}|{}|{}|{}|{}",mode,target.active_clip,config.wire(),self.generator_result,self.generator_record_track().map_or(-1,|owner|owner as i32))
    }
    /// Audition commands never enter the edit/dirty/Undo path.
    pub fn generator_explore_set(&mut self,message:&str,out:&mut Vec<OutEvent>)->bool {
        let fields:Vec<_>=message.split_whitespace().collect();
        if fields.len()==2&&fields[1]=="off" {self.generator_cancel(out);return true;}
        if fields.len()==3&&fields[2]=="off" {
            let Some(track)=fields[1].parse::<usize>().ok().filter(|track|*track<NUM_TRACKS) else{return false;};
            self.generator_cancel_track(track,out);return true;
        }
        if fields.len()!=6 {self.generator_result="Invalid generator".into();return false;}
        let Some(track)=fields[1].parse::<usize>().ok().filter(|track|*track<NUM_TRACKS&&!self.track_is_drum(*track)) else {self.generator_result="Choose a melodic actor track".into();return false;};
        let Some(config)=crate::generator::Config::parse(&fields[2..].join(" ")) else {return false;};
        if self.part_recording_busy()&&self.records_track(track) {
            let Some(state)=self.generator_explore[track].as_mut() else {self.generator_result="Finish recording first".into();return false;};
            if config.seed!=state.desired.seed {self.generator_result="Seed locked during recording".into();return false;}
            if !state.current.accepts_style(config.style){self.generator_result="Finish this actor take first".into();return false;}
            state.desired=config;return true;
        }
        if self.tracks[track].active().generator.is_some(){self.generator_result="Use the recorded clip controls".into();return false;}
        if let Some(state)=self.generator_explore[track].as_mut() {if !state.current.accepts_style(config.style){self.generator_result="Stop this track before changing actor".into();return false;}state.desired=config;return true;}
        self.generator_cancel_track(track,out);
        self.flush_track_gates(track,out);
        self.generator_restore[track]=self.recipe_seen[track].or(self.recipe_bases[track]);
        self.generator_explore[track]=Some(crate::generator::Explore {track,desired:config,current:config,take:None,destination:None,source:None,touched:7});
        self.generator_result="Explore - Rec saves to an empty clip".into();
        out.push(OutEvent::RecipeCapture{track:track as u8});true
    }
    fn generator_override(mut base:crate::generator::Config,values:crate::generator::Config,mask:u8)->crate::generator::Config {
        if mask&1!=0 {base.complexity=values.complexity;}
        if mask&2!=0 {base.intensity=values.intensity;}
        if mask&4!=0 {base.style=values.style;}
        base
    }
    /// Audition one control against a recorded source without editing its lanes.
    pub fn generator_preview_set(&mut self,message:&str,out:&mut Vec<OutEvent>)->bool {
        let fields:Vec<_>=message.split_whitespace().collect();
        if !matches!(fields.len(),3|5){return false;}
        let Some(track)=fields[1].parse::<usize>().ok().filter(|track|*track<NUM_TRACKS) else{return false;};
        let Some(slot)=fields[2].parse::<usize>().ok().filter(|slot|*slot<CLIPS_PER_TRACK) else{return false;};
        let target=&self.tracks[track];
        let Some(config)=target.clips[slot].generator else {self.generator_result="Select a recorded generator clip".into();return false;};
        if target.active_clip!=slot {self.generator_result="Clip changed".into();return false;}
        if self.playing&&target.playing_slot!=Some(slot) {self.generator_result="Play the selected actor clip first".into();return false;}
        let same=self.generator_explore[track].is_some_and(|state|state.source==Some(slot));
        let adopting=self.generator_explore[track].is_none()&&self.records_track(track)&&self.joint_record_mask==0&&!self.source_routes[track].enabled;
        if self.part_recording_busy()&&self.records_track(track)&&!same&&!adopting {self.generator_result="Finish recording first".into();return false;}
        let edit=if fields.len()==5 {
            let Some(field)=fields[3].parse::<usize>().ok().filter(|field|*field<3) else{return false;};
            let Some(value)=fields[4].parse::<u8>().ok().filter(|value|*value<=127&&(field!=2||(*value as usize)<crate::generator::STYLES.len())) else{return false;};
            if field==2&&!config.accepts_style(value){self.generator_result="Choose a style for this actor".into();return false;}
            Some((field,value))
        }else{None};
        if !same {
            self.generator_cancel_track(track,out);
            let target=&self.tracks[track];let clip=&target.clips[slot];
            let step=if self.playing {(target.pos_tick/TICKS_PER_STEP) as u16}else{clip.loop_start_steps};
            let current=config.at(clip,&target.lane_label,step);
            self.generator_restore[track]=clip.recipe.as_ref().map(|recipe|recipe.settings).or(self.recipe_bases[track]);
            self.generator_explore[track]=Some(crate::generator::Explore {track,desired:current,current,take:None,destination:if self.part_recording_busy()&&self.records_track(track){Some(slot)}else{None},source:Some(slot),touched:0});
        }
        if let Some((field,value))=edit {
            let state=self.generator_explore[track].as_mut().unwrap();state.touched|=1<<field;
            match field {0=>state.desired.complexity=value,1=>state.desired.intensity=value,2=>state.desired.style=value,_=>{}}
        }
        self.generator_result="Preview - Record captures changes".into();true
    }
    /// Recording is owned by the ordinary recorder, never by the browsed actor.
    pub fn generator_record_track(&self)->Option<usize> {
        (self.part_recording_busy()&&self.generator_exploring(self.rec_track)).then_some(self.rec_track)
    }
    fn generator_check_target(&mut self,out:&mut Vec<OutEvent>) {
        for track in 0..NUM_TRACKS {
            let changed=self.generator_explore[track].is_some_and(|state| {
                let target=&self.tracks[track];
                state.destination.is_some_and(|slot|target.active_clip!=slot||
                    (self.recording&&self.records_track(track)&&target.playing_slot!=Some(slot))) ||
                state.source.is_some_and(|slot|target.active_clip!=slot||
                    (self.playing&&self.count_in_left==0&&target.playing_slot!=Some(slot))||target.clips[slot].generator.is_none())
            });
            if changed {self.generator_cancel_track(track,out);self.generator_result="Preview ended: clip changed".into();}
        }
    }
    pub fn generator_cancel(&mut self,out:&mut Vec<OutEvent>) {
        for track in 0..NUM_TRACKS {self.generator_cancel_track(track,out);}
    }
    pub fn generator_cancel_track(&mut self,track:usize,out:&mut Vec<OutEvent>) {
        if let Some(state)=self.generator_explore[track].take() {
            if self.part_recording_busy()&&self.records_track(track) {if self.pending_rec {self.tracks[track].queued_slot=None;}self.recording=false;self.pending_rec=false;self.count_in_left=0;}
            self.flush_track_gates(track,out);
            self.generator_finish_take(state);
            self.recipe_tick(out);
        }
    }
    fn generator_finish_take(&mut self,state:crate::generator::Explore) {
        if state.source.is_some(){return;}
        if let Some(slot)=state.take {
            let clip=&mut self.tracks[state.track].clips[slot];
            if let Some(config)=clip.generator {clip.length_steps=(config.end.max(1).div_ceil(crate::TICKS_PER_BAR)*16).min(256) as u16;}
        }
    }
    /// Validate before the normal Record command creates or arms a destination.
    fn generator_prepare_record(&mut self,track:usize)->bool {
        let Some(state)=self.generator_explore.get(track).copied().flatten() else {return true;};
        if self.generator_restore[state.track].is_some_and(|settings|!settings.mapped()) {self.generator_result="Actor needs mapped input".into();return false;}
        let track=&self.tracks[state.track];
        let clip=track.active();
        if let Some(slot)=state.source {
            if slot!=track.active_clip||clip.generator.is_none() {self.generator_result="Clip changed".into();return false;}
            if crate::generator::LABELS.iter().any(|label|!(0..8).any(|lane|track.lane_assigned[lane]&&track.lane_label[lane]==*label)) {
                self.generator_result="Generator automation lanes missing".into();return false;
            }
        }else if clip.exists() {self.generator_result="Choose an empty actor clip".into();return false;}
        if self.source_routes[state.track].enabled {self.generator_result="Set actor sources to Own before recording".into();return false;}
        let available=(0..8).filter(|lane|!track.lane_assigned[*lane]||crate::generator::internal(&track.lane_label[*lane])).count();
        if available<3 {self.generator_result="Three automation lanes needed".into();return false;}
        self.generator_explore[state.track].as_mut().unwrap().destination=Some(track.active_clip);
        self.generator_result="Recording armed".into();true
    }
    fn generator_capture_tick(&mut self,track:usize,slot:usize,pos:u32,out:&mut Vec<OutEvent>) {
        let Some(mut state)=self.generator_explore[track] else {return;};
        if !self.recording||!self.records_track(track) {return;}
        if state.source.is_some() {
            state.take=Some(slot);self.generator_explore[track]=Some(state);
            if pos%TICKS_PER_STEP==0 {
                match self.generator_overdub_step(track,slot,(pos/TICKS_PER_STEP) as u16,state) {
                    Ok(changed)=>self.dirty|=changed,
                    Err(error)=>{self.generator_cancel_track(track,out);self.generator_result=error.into();}
                }
            }
            return;
        }
        if state.take.is_none() {
            let available=(0..8).filter(|lane|!self.tracks[track].lane_assigned[*lane]||crate::generator::internal(&self.tracks[track].lane_label[*lane])).count();
            if available<3 {self.recording=false;self.generator_result="Three automation lanes needed".into();return;}
            state.take=Some(slot);self.generator_explore[track]=Some(state);
            let clip=&mut self.tracks[track].clips[slot];
            clip.generator=Some(state.current);
            clip.input_key=crate::follower_input::InputKey::new(0,1);
            clip.recipe=Some(crate::clip_recipe::Recipe {name:state.current.recipe_name().into(),settings:state.current.settings(self.generator_restore[track].unwrap_or_else(crate::part_settings::Settings::comp)),gate:100});
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
    /// Replace only the visited control interval and restore its old curve at
    /// the next boundary. Six bounded edits are preflighted before any writes.
    fn generator_overdub_step(&mut self,track:usize,slot:usize,step:u16,state:crate::generator::Explore)->Result<bool,&'static str> {
        let target=&self.tracks[track];let clip=&target.clips[slot];
        let config=clip.generator.ok_or("Generator clip removed")?;
        let mut edits:[Option<(u8,u16,Option<u8>)>;6]=[None;6];let mut count=0;
        for (field,label) in crate::generator::LABELS.iter().enumerate() {
            if state.touched&(1<<field)==0||(field==2&&step%16!=0&&step!=clip.loop_start_steps){continue;}
            let lane=(0..8).find(|lane|target.lane_assigned[*lane]&&target.lane_label[*lane]==*label).ok_or("Generator automation lane removed")? as u8;
            let value=state.current.values()[field];
            let previous=if step==clip.loop_start_steps {config.values()[field]}else{crate::generator::lane_value(clip,lane,step-1,config.values()[field])};
            let current=(previous!=value).then_some(value);
            if clip.lock_at(lane,step)!=current {edits[count]=Some((lane,step,current));count+=1;}
            let next=if field==2 {(step/16+1)*16}else{step+1};
            if next<clip.loop_start_steps+clip.length_steps&&clip.lock_at(lane,next).is_none() {
                let restore=config.at(clip,&target.lane_label,next).values()[field];
                if restore!=value {edits[count]=Some((lane,next,Some(restore)));count+=1;}
            }
        }
        let added=edits.iter().flatten().filter(|(lane,step,value)|value.is_some()&&clip.lock_at(*lane,*step).is_none()).count();
        let removed=edits.iter().flatten().filter(|(_,_,value)|value.is_none()).count();
        if clip.locks.len()+added-removed>crate::clip::MAX_LOCKS {return Err("Automation capacity reached");}
        let clip=&mut self.tracks[track].clips[slot];
        for (lane,step,value) in edits.into_iter().flatten() {
            if let Some(value)=value {clip.set_lock(lane,step,value);}else{clip.locks.retain(|lock|lock.lane!=lane||lock.step!=step);}
        }
        Ok(count>0)
    }
    /// Called by the existing per-track clock, sharing its gate countdown and
    /// emit_clip_note ownership. No plan building or catalog parsing on ticks.
    fn generator_tick(&mut self,track:usize,out:&mut Vec<OutEvent>) {
        if !self.generator_owns(track)||self.tracks[track].muted {return;}
        if self.generator_exploring(track)&&self.generator_restore[track].is_some_and(|settings|!settings.mapped()) {
            self.generator_result="Actor needs Relative or Closest Split mapping".into();return;
        }
        let slot=self.tracks[track].playing_slot.unwrap_or(self.tracks[track].active_clip);
        if self.generator_explore[track].is_some_and(|state|state.take.is_some_and(|take|take!=slot||self.tracks[track].clips[take].generator.is_none())) {
            self.generator_cancel_track(track,out);self.generator_result="Recording ended: clip changed".into();return;
        }
        let recording=self.recording&&self.records_track(track);
        let free=self.generator_free(track)&&!recording;
        let pos=if free {self.master_tick.saturating_sub(1) as u32% (crate::TICKS_PER_BAR*4)} else {self.tracks[track].pos_tick};
        let clip=&self.tracks[track].clips[slot];
        let base=clip.generator.map(|config|config.at(clip,&self.tracks[track].lane_label,(pos/TICKS_PER_STEP) as u16));
        let loop_start=clip.loop_start_ticks();
        if let Some(state)=self.generator_explore[track].as_mut() {
            let mut accepted=state.current;
            if pos%TICKS_PER_STEP==0 {accepted.complexity=state.desired.complexity;accepted.intensity=state.desired.intensity;}
            if pos%crate::TICKS_PER_BAR==0||(state.source.is_some()&&pos==loop_start) {accepted.style=state.desired.style;accepted.seed=state.desired.seed;}
            state.current=if state.source.is_some(){Self::generator_override(base.unwrap(),accepted,state.touched)}else{accepted};
        }
        self.generator_capture_tick(track,slot,pos,out);
        // At most sixteen grid positions; only one can fire at this tick.
        let clip=&self.tracks[track].clips[slot];
        let (start,end,snum,sden)=if free {(0,crate::TICKS_PER_BAR*4,1,1)}else{(clip.loop_start_ticks(),clip.loop_end_ticks(),clip.scale_num,clip.scale_den)};
        let bar=pos/crate::TICKS_PER_BAR*16;
        for local in 0..16 {
            let step=(bar+local) as u16;
            let tick=step as u32*TICKS_PER_STEP;
            if tick<start||tick>=end {continue;}
            let fire=(tick+self.swing_delay(step,snum,sden)).min(end-1);
            if fire!=pos {continue;}
            let config=if let Some(state)=self.generator_explore[track] {state.current}
                else {let clip=&self.tracks[track].clips[slot];clip.generator.unwrap().at(clip,&self.tracks[track].lane_label,step)};
            if let Some(note)=config.note(step) {
                if config.bass() {
                    let mut index=0;
                    while index<self.gates.len() {
                        if self.gates[index].track==track as u8&&self.gates[index].generated {
                            out.push(self.gates.remove(index).off_event());
                        }else{index+=1;}
                    }
                }
                self.generator_emitting=true;
                self.emit_clip_note(track,track,slot,note,None,None,Default::default(),false,track,out);
                self.generator_emitting=false;
            }
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
        if self.part_recording_busy()||self.generator_exploring(track){return Err("Stop exploring or recording first");}
        let target=self.tracks.get(track).ok_or("Invalid track")?;
        if slot!=target.active_clip{return Err("Clip changed");}
        let clip=target.clips.get(slot).ok_or("Invalid clip")?;
        let config=clip.generator.ok_or("Record a generator take first")?;
        if self.humanize.time_active(track)||(self.humanize.tracks&(1<<track)!=0&&self.humanize.velocity>0)
            ||self.hb_rhythm[track].enabled()||!clip.operation_intervals.is_empty()||!clip.grid_gates.is_empty()||!clip.trigs.is_empty() {
            return Err("Bake needs Humanize and clip rhythm operations off");
        }
        let mut baked=clip.clone();
        let mut generated:Vec<_>=(clip.loop_start_steps..clip.loop_start_steps+clip.length_steps)
            .filter_map(|step|config.at(clip,&target.lane_label,step).note(step)).collect();
        if config.bass()&&!generated.is_empty() {
            let end=clip.loop_end_ticks();let span=end-clip.loop_start_ticks();
            let fire:Vec<_>=generated.iter().map(|note|(note.tick+self.swing_delay(note.step,clip.scale_num,clip.scale_den)).min(end-1)).collect();
            let count=generated.len();
            for (index,note) in generated.iter_mut().enumerate() {
                let next=if index+1<count {fire[index+1]}else{fire[0]+span};
                note.gate=note.gate.min(next.saturating_sub(fire[index]).max(1));
            }
        }
        if config.bass(){generated.extend(std::mem::take(&mut baked.notes));baked.notes=generated;}else{baked.notes.extend(generated);}
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
