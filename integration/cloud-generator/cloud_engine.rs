impl Engine {
    fn cloud_expire_contacts(&mut self) {
        let now=self.frame_now;let lease=self.clock.sample_rate() as u64*2;
        for runtime in &mut self.clouds {
            runtime.contacts.retain(|contact|now.saturating_sub(contact.frame)<lease);
            runtime.pending_touches.retain(|stroke|now.saturating_sub(stroke.contact.frame)<lease);
        }
    }
    /// A contact belongs to one track and one input surface; up never re-targets.
    pub fn cloud_touch(&mut self,message:&str)->bool {
        let clear:Vec<_>=message.split_whitespace().collect();
        if clear.len()==3&&clear[2]=="clear" {
            if let Ok(track)=clear[1].parse::<usize>() {if track<NUM_TRACKS {self.clouds[track]=crate::cloud::Runtime{field:true,..Default::default()};return true;}}return false;
        }
        let fields:Vec<u32>=message.split_whitespace().skip(1).map(str::parse).collect::<Result<_,_>>().unwrap_or_default();
        if !matches!(fields.len(),5|6)||fields[0]>=NUM_TRACKS as u32||fields[1]>127||fields[2..].iter().any(|value|*value>127){return false;}
        let Some(activity)=crate::cloud::Activity::parse(*fields.get(5).unwrap_or(&0)) else{return false;};
        let track=fields[0] as usize;
        if !self.generator_explore[track].is_some_and(|state|state.current.is_cloud()){return false;}
        self.clouds[track].touch(fields[1] as u8,fields[2] as u8,fields[3] as u8,fields[4] as u8,activity,self.master_tick,self.frame_now)
    }
    fn cloud_capture(&mut self,track:usize,slot:usize,pos:u32) {
        let Some(state)=self.generator_explore[track].filter(|state|state.current.is_cloud()) else{return;};
        if pos%TICKS_PER_STEP!=0{return;}
        let now=self.master_tick.saturating_sub(1);
        let recording=self.recording&&self.records_track(track);
        let runtime=&mut self.clouds[track];
        if state.source.is_some()&&pos==0 {runtime.points.clear();runtime.overridden.clear();runtime.last_sample=None;}
        runtime.sample(now);
        if runtime.field&&state.source.is_some()&&!runtime.overridden.contains(&((pos/TICKS_PER_STEP) as u16)){runtime.overridden.push((pos/TICKS_PER_STEP) as u16);}

        if !recording||!runtime.field{return;}
        let step=(pos/TICKS_PER_STEP) as i32;let origin=(now/TICKS_PER_STEP as u64) as i32;
        let clip=&mut self.tracks[track].clips[slot];
        if !clip.cloud_field {clip.cloud_field_start=step as u16;}
        if state.take.is_none()&&state.source.is_none(){
            clip.cloud_points=runtime.points.iter().map(|point|crate::cloud::Point{step:point.step-origin+step,..*point}).collect();
        }else {
            let fresh:Vec<_>=runtime.points.iter().filter(|point|point.step==origin).map(|point|crate::cloud::Point{step,..*point}).collect();
            let count=clip.cloud_points.iter().filter(|point|point.step!=step).count()+fresh.len();
            if count>crate::cloud::MAX_POINTS {self.recording=false;self.generator_result="Cloud gesture capacity reached".into();return;}
            clip.cloud_points.retain(|point|point.step!=step);clip.cloud_points.extend(fresh);
        }
        clip.cloud_field=true;self.dirty=true;
    }
    fn cloud_notes(&mut self,track:usize,slot:usize,step:u16,config:crate::generator::Config,free:bool)->Vec<crate::clip::Note> {
        let runtime=&mut self.clouds[track];
        let live=self.generator_explore[track].is_some()&&runtime.field;
        let (points,field)=if live {
            let now=(self.master_tick.saturating_sub(1)/TICKS_PER_STEP as u64) as i32;
            let mut points=runtime.points.iter().map(|point|crate::cloud::Point{step:point.step-now+step as i32,..*point}).collect::<Vec<_>>();
            if self.generator_explore[track].is_some_and(|state|state.source.is_some()) {
                points.extend(self.tracks[track].clips[slot].cloud_points.iter().filter(|point|point.step>=0&&point.step<=step as i32&&step as i32-point.step<crate::cloud::TAIL_STEPS&&!runtime.overridden.contains(&(point.step as u16))).copied());
            }
            (points,true)
        }else if let Some(part)=&self.generator_library[track] {(part.clip.cloud_points.iter().filter(|point|point.step<=step as i32&&step as i32-point.step<crate::cloud::TAIL_STEPS).copied().collect(),part.clip.cloud_field&&step>=part.clip.cloud_field_start)}
        else if free {(Vec::new(),false)}else{let clip=&self.tracks[track].clips[slot];(clip.cloud_points.iter().filter(|point|point.step<=step as i32&&step as i32-point.step<crate::cloud::TAIL_STEPS).copied().collect(),clip.cloud_field&&step>=clip.cloud_field_start)};
        let now=(self.master_tick.saturating_sub(1)/TICKS_PER_STEP as u64) as i32;
        runtime.view=points.iter().filter(|point|point.step<=step as i32&&step as i32-point.step<crate::cloud::TAIL_STEPS).map(|point|crate::cloud::Point{step:point.step-step as i32+now,..*point}).collect();
        let grains=crate::cloud::grains(config,step,&points,field);
        runtime.pending=grains.iter().map(|(note,point)|(note.pitch,*point)).collect();
        grains.into_iter().map(|(note,_)|note).collect()
    }
    fn cloud_observe(&mut self,track:usize,note:&crate::clip::Note) {
        let now=(self.master_tick.saturating_sub(1)/TICKS_PER_STEP as u64) as i32;
        let runtime=&mut self.clouds[track];
        runtime.grains.retain(|point|now-point.step<crate::cloud::TAIL_STEPS);
        if runtime.grains.len()>=64 {runtime.grains.remove(0);}
        if let Some((_,point))=runtime.pending.iter().find(|(pitch,_)|*pitch==note.pitch){runtime.grains.push(crate::cloud::Point{step:now,..*point});}
    }
    pub fn cloud_view(&self,track:usize)->String {
        let Some(runtime)=self.clouds.get(track) else{return String::new();};
        let now=self.master_tick.saturating_sub(1) as f64/TICKS_PER_STEP as f64;
        let points=|points:&[crate::cloud::Point]|points.iter().filter(|point|now-(point.step as f64)<crate::cloud::TAIL_STEPS as f64).map(|point|format!("{},{},{},{:.3}",point.x,point.y,point.pressure,(now-point.step as f64).max(0.0))).collect::<Vec<_>>().join(";");
        let contacts=runtime.contacts.iter().filter(|contact|self.master_tick.saturating_sub(contact.refreshed)<192&&self.frame_now.saturating_sub(contact.frame)<self.clock.sample_rate() as u64*2).map(|contact|format!("{},{},{}",contact.point.x,contact.point.y,contact.point.pressure)).collect::<Vec<_>>().join(";");
        format!("cf1|{}|{}|{}",contacts,points(&runtime.view),points(&runtime.grains))
    }
}
