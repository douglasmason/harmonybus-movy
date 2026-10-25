//! Atomic library import, including renderer defaults and named automation lanes.
use crate::{engine::{Engine,OutEvent},part_settings::Settings,clip::Clip};
impl Engine {
    pub fn part_load(&mut self,message:&str,out:&mut Vec<OutEvent>) {
        self.part_result=match self.part_load_checked(message,out){Ok(())=>"Loaded - Undo available".into(),Err(error)=>format!("error:{error}")};
    }
    fn part_load_checked(&mut self,message:&str,out:&mut Vec<OutEvent>)->Result<(),&'static str>{
        let fields:Vec<_>=message.split_whitespace().collect();
        if fields.len()!=7 {return Err("Incomplete preset");}
        let track=fields[1].parse::<usize>().map_err(|_|"Invalid track")?;
        let slot=fields[2].parse::<usize>().map_err(|_|"Invalid clip")?;
        if self.part_recording_busy() {return Err("Finish recording first");}
        if track>=self.tracks.len()||self.track_is_drum(track){return Err("Select a melodic comp track");}
        let target=&self.tracks[track];
        if target.active_clip!=slot||target.playing_slot.is_some_and(|playing|playing!=slot) {return Err("Select the playing comp clip");}
        let info=self.motif_clip_info(track);let signature=info.split(',').nth(1).unwrap_or("");
        if signature!=fields[3] {return Err("Clip changed - preview again");}
        let baseline=Settings::parse(fields[6]).ok_or("Incomplete track settings")?;
        let (mut clip,donor)=if fields[4]=="stock" {
            (crate::part_catalog::comp(fields[5].parse().map_err(|_|"Invalid style")?).ok_or("Unknown style")?,None)
        }else if fields[4]=="user" {
            let text=decode(fields[5]).ok_or("Invalid saved preset")?;
            if !text.starts_with("part1\n") {return Err("Unsupported preset version");}
            let mut source=Engine::new(48000,12000);
            if !crate::persist::load(&mut source,&text[6..]) {return Err("Invalid preset state");}
            let clip=source.tracks[0].clips[0].clone();
            if !valid(&clip,&source.tracks[0].lane_label) {return Err("Preset must contain mapped input");}
            (clip,Some(source))
        }else{return Err("Unsupported preset source");};
        // Allocate by full target names; never steal lanes referenced by another clip.
        let mut labels=target.lane_label.clone();let mut assigned=target.lane_assigned;let mut bases=target.lane_base;
        if let Some(donor)=donor {
            let mut map_source_to_target=[0usize;8];
            for source_lane in 0..8 {
                if !clip.has_lock_on_lane(source_lane as u8){continue;}
                let source=&donor.tracks[0];let name=&source.lane_label[source_lane];
                if !source.lane_assigned[source_lane]||name.is_empty(){return Err("Missing automation target");}
                let lane=(0..8).find(|&lane|assigned[lane]&&labels[lane]==*name).or_else(||(0..8).find(|&lane|!assigned[lane])).ok_or("No free automation lane");
                let lane=lane?;
                if !assigned[lane]{assigned[lane]=true;labels[lane]=name.clone();bases[lane]=source.lane_base[source_lane];}
                // A note resets a lane to base. Materialize the saved base on
                // those steps, so importing onto an existing target lane cannot
                // inherit its unrelated base or change another clip's base.
                let reset_steps:Vec<u16>=clip.notes.iter().map(|note|note.step).filter(|step|clip.lock_at(source_lane as u8,*step).is_none()).collect();
                for step in reset_steps {if clip.locks.len()>=crate::clip::MAX_LOCKS{return Err("Automation capacity exceeded");}clip.set_lock(source_lane as u8,step,source.lane_base[source_lane]);}
                map_source_to_target[source_lane]=lane;
            }
            for lock in &mut clip.locks {lock.lane=map_source_to_target[lock.lane as usize] as u8;}
        }
        self.flush_track_gates(track,out);
        self.recipe_bases[track].get_or_insert(baseline);
        let target=&mut self.tracks[track];
        target.clips[slot]=clip;target.lane_label=labels;target.lane_assigned=assigned;target.lane_base=bases;
        target.last_auto_step=-1;target.auto_cur=[-1;8];
        if target.playing_slot==Some(slot){target.pos_tick=target.clips[slot].loop_start_ticks();}
        self.source_routes[track]=Default::default();self.source_automation_invalidate();
        out.push(OutEvent::RecipeLanes{track:track as u8});
        self.ensure_selected_playing(track);self.recipe_tick(out);Ok(())
    }
    pub fn part_export(&self,track:usize)->String {
        let Some(target)=self.tracks.get(track) else{return "error:Invalid track".into();};
        if self.recording {return "error:Finish recording first".into();}
        let clip=target.active();if !valid(clip,&target.lane_label){return "error:Load a mapped comp style first".into();}
        let mut preset=Engine::new(48000,12000);
        preset.tracks[0].clips[0]=clip.clone();
        preset.tracks[0].lane_label=target.lane_label.clone();preset.tracks[0].lane_assigned=target.lane_assigned;preset.tracks[0].lane_base=target.lane_base;
        let text=format!("part1\n{}",crate::persist::serialize(&preset));
        if text.len()>18000{return "error:Preset exceeds transfer capacity".into();}
        text.bytes().map(|byte|format!("{byte:02x}")).collect()
    }
}
fn valid(clip:&Clip,labels:&[String;8])->bool {
    // These two defaults guarantee mapped input. A recalled automation lane
    // must not silently turn either off; other renderer automation is retained.
    if clip.locks.iter().any(|lock|labels.get(lock.lane as usize).map_or(true,|label|matches!(label.as_str(),"midi_fx1:travel_map"|"midi_fx1:track_role"|"midi_fx1:role"))){return false;}

    clip.exists()&&!clip.notes.is_empty()&&clip.recipe.as_ref().is_some_and(|recipe|recipe.settings.mapped())&&
        clip.shared_events.is_empty()&&clip.notes.iter().all(|note|!note.rendered&&note.input_key.is_some()&&!note.actions.as_ref().is_some_and(crate::recorded_actions::chord_selection))
}
fn decode(value:&str)->Option<String>{
    if value.len()>36000||value.len()%2!=0||!value.is_ascii(){return None;}
    String::from_utf8((0..value.len()).step_by(2).map(|offset|u8::from_str_radix(&value[offset..offset+2],16).ok()).collect::<Option<Vec<_>>>()?).ok()
}
