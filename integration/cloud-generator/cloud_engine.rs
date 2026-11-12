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
        if clear.len()==4&&clear[2]=="hold" {
            let Ok(track)=clear[1].parse::<usize>() else{return false;};
            if track>=NUM_TRACKS||!matches!(clear[3],"0"|"1")||!self.generator_explore[track].is_some_and(|state|state.current.is_cloud()){return false;}
            self.cloud_expire_contacts();
            return self.clouds[track].hold(clear[3]=="1",self.master_tick);
        }
        if clear.len()==3&&clear[2]=="clear" {
            if let Ok(track)=clear[1].parse::<usize>() {if track<NUM_TRACKS {self.clouds[track]=crate::cloud::Runtime{field:true,..Default::default()};return true;}}return false;
        }
        let precise=matches!(clear.get(2),Some(&"touch14")|Some(&"move14"));
        let moving=matches!(clear.get(2),Some(&"move")|Some(&"move14"));
        let fields:Vec<u32>=clear.iter().enumerate().filter(|(index,_)|*index>0&&(!(moving||precise)||*index!=2)).map(|(_,value)|value.parse()).collect::<Result<_,_>>().unwrap_or_default();
        if !matches!(fields.len(),5|6|7)||fields[0]>=NUM_TRACKS as u32||fields[1]>127||fields[2..4].iter().any(|value|*value>if precise {16383}else{127})||fields[4]>127{return false;}
        let Some(activity)=crate::cloud::Activity::parse(*fields.get(5).unwrap_or(&0)) else{return false;};
        let Some(pressure_target)=crate::cloud::PressureTarget::parse(*fields.get(6).unwrap_or(&0)) else{return false;};
        let track=fields[0] as usize;
        if !self.generator_explore[track].is_some_and(|state|state.current.is_cloud()){return false;}
        // Updates never acquire a contact. Stop, Clear, release and expiry are
        // boundaries that an old pressure packet or browser heartbeat cannot undo.
        if moving&&!self.clouds[track].contacts.iter().any(|contact|contact.id==fields[1] as u8&&self.master_tick.saturating_sub(contact.refreshed)<192&&self.frame_now.saturating_sub(contact.frame)<self.clock.sample_rate() as u64*2){return false;}
        let scale=if precise {1}else{crate::cloud::XY_LEGACY_SCALE};
        self.clouds[track].touch_expression(fields[1] as u8,fields[2] as u16*scale,fields[3] as u16*scale,fields[4] as u8,activity,pressure_target,self.master_tick,self.frame_now,precise)
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
            clip.cloud_points.clear();
            clip.cloud_points.extend(runtime.points.iter().map(|point|crate::cloud::Point{step:point.step-origin+step,..*point}));
        }else {
            let fresh=runtime.points.iter().filter(|point|point.step==origin).map(|point|crate::cloud::Point{step,..*point});
            let count=clip.cloud_points.iter().filter(|point|point.step!=step).count()+fresh.clone().count();
            if count>crate::cloud::MAX_POINTS {self.recording=false;self.generator_result="Cloud gesture capacity reached".into();return;}
            clip.cloud_points.retain(|point|point.step!=step);clip.cloud_points.extend(fresh);
        }
        clip.cloud_field=true;self.dirty=true;
    }
    fn cloud_notes(&mut self,track:usize,slot:usize,step:u16,config:crate::generator::Config,free:bool)->[Option<crate::clip::Note>;4] {
        let runtime=&mut self.clouds[track];
        let live=self.generator_explore[track].is_some()&&runtime.field;
        let points=&mut runtime.work;
        points.clear();
        let field=if live {
            let now=(self.master_tick.saturating_sub(1)/TICKS_PER_STEP as u64) as i32;
            points.extend(runtime.points.iter().map(|point|crate::cloud::Point{step:point.step-now+step as i32,..*point}));
            if self.generator_explore[track].is_some_and(|state|state.source.is_some()) {
                points.extend(self.tracks[track].clips[slot].cloud_points.iter().filter(|point|point.step>=0&&point.step<=step as i32&&step as i32-point.step<crate::cloud::TAIL_STEPS&&!runtime.overridden.contains(&(point.step as u16))).copied());
            }
            true
        }else if let Some(part)=&self.generator_library[track] {
            points.extend(part.clip.cloud_points.iter().filter(|point|point.step<=step as i32&&step as i32-point.step<crate::cloud::TAIL_STEPS).copied());
            part.clip.cloud_field&&step>=part.clip.cloud_field_start
        }else if free {false}else{
            let clip=&self.tracks[track].clips[slot];
            points.extend(clip.cloud_points.iter().filter(|point|point.step<=step as i32&&step as i32-point.step<crate::cloud::TAIL_STEPS).copied());
            clip.cloud_field&&step>=clip.cloud_field_start
        };
        let now=(self.master_tick.saturating_sub(1)/TICKS_PER_STEP as u64) as i32;
        runtime.view.clear();
        runtime.view.extend(points.iter().filter(|point|point.step<=step as i32&&step as i32-point.step<crate::cloud::TAIL_STEPS).map(|point|crate::cloud::Point{step:point.step-step as i32+now,..*point}));
        let grains=crate::cloud::grains_in_place(config,step,points,field);
        runtime.pending.clear();
        runtime.pending.extend(grains.iter().flatten().map(|(note,point)|(note.pitch,*point)));
        grains.map(|entry|entry.map(|(note,_)|note))
    }
    fn cloud_observe(&mut self,track:usize,note:&crate::clip::Note) {
        let now=(self.master_tick.saturating_sub(1)/TICKS_PER_STEP as u64) as i32;
        let runtime=&mut self.clouds[track];
        runtime.grains.retain(|point|now-point.step<crate::cloud::TAIL_STEPS);
        if runtime.grains.len()>=64 {runtime.grains.remove(0);}
        if let Some((_,point))=runtime.pending.iter().find(|(pitch,_)|*pitch==note.pitch){runtime.grains.push(crate::cloud::Point{step:now,..*point});}
    }
    pub fn cloud_view(&self,track:usize)->String {
        let mut output=String::new();
        self.append_cloud_view(track,&mut output).expect("writing a String cannot fail");
        output
    }
    /// Append a legacy or precise snapshot into the caller's reusable buffer.
    pub fn append_cloud_view(&self,track:usize,output:&mut impl std::fmt::Write)->std::fmt::Result {
        let Some(runtime)=self.clouds.get(track) else{return Ok(());};
        let now=self.master_tick.saturating_sub(1) as f64/TICKS_PER_STEP as f64;
        let precise=runtime.contacts.iter().any(|contact|!contact.point.legacy_xy())||runtime.view.iter().chain(runtime.grains.iter()).any(|point|!point.legacy_xy());
        let divisor=if precise {1}else{crate::cloud::XY_LEGACY_SCALE};
        output.write_str(if precise {"cf2|"}else{"cf1|"})?;
        let mut separator="";
        for contact in runtime.contacts.iter().filter(|contact|self.master_tick.saturating_sub(contact.refreshed)<192&&self.frame_now.saturating_sub(contact.frame)<self.clock.sample_rate() as u64*2) {
            write!(output,"{separator}{},{},{}",contact.point.x/divisor,contact.point.y/divisor,contact.point.pressure)?;
            separator=";";
        }
        for points in [&runtime.view,&runtime.grains] {
            output.write_char('|')?;
            let mut separator="";
            for point in points.iter().filter(|point|now-(point.step as f64)<crate::cloud::TAIL_STEPS as f64) {
                write!(output,"{separator}{},{},{},{:.3}",point.x/divisor,point.y/divisor,point.pressure,(now-point.step as f64).max(0.0))?;
                separator=";";
            }
        }
        Ok(())
    }
}
