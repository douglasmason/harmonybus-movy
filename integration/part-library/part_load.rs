//! Atomic library import, including renderer defaults and named automation lanes.
use crate::{engine::{Engine,OutEvent},part_settings::Settings,clip::Clip};

/// Named lane metadata travels with a library snapshot, not its original track.
#[derive(Clone,Debug)]
pub struct PartLanes {
    pub labels:[String;8],
    pub assigned:[bool;8],
    pub bases:[u8;8],
}
impl PartLanes {
    pub fn from_track(track:&crate::track::Track)->Self {
        Self {labels:track.lane_label.clone(),assigned:track.lane_assigned,bases:track.lane_base}
    }
}
#[derive(Clone,Debug)]
pub struct PreparedPart {pub clip:Clip,pub lanes:PartLanes}

/// Decode once on an explicit source choice. Both library surfaces use this path.
pub fn prepare_part(kind:&str,value:&str)->Result<PreparedPart,&'static str> {
    if matches!(kind,"stock"|"bass") {
        let choice=value.parse().map_err(|_|"Invalid style")?;
        let clip=if kind=="bass" {crate::part_catalog::bass(choice)}else{crate::part_catalog::comp(choice)};
        return Ok(PreparedPart{clip:clip.ok_or("Unknown style")?,lanes:PartLanes{
            labels:std::array::from_fn(|_|String::new()),assigned:[false;8],bases:[0;8],
        }});
    }
    if kind!="user" {return Err("Unsupported preset source");}
    let text=decode(value).ok_or("Invalid saved preset")?;
    let generator=text.starts_with("part2\n");
    if !generator&&!text.starts_with("part1\n") {return Err("Unsupported preset version");}
    let mut source=Engine::new(48000,12000);
    if !crate::persist::load(&mut source,&text[6..]) {return Err("Invalid preset state");}
    let clip=source.tracks[0].clips[0].clone();
    if generator!=clip.generator.is_some(){return Err("Invalid generator preset");}
    if generator {crate::generator::library_valid(&clip,&source.tracks[0].lane_label)?;}
    if !valid(&clip,&source.tracks[0].lane_label) {return Err("Preset must contain mapped input");}
    Ok(PreparedPart{clip,lanes:PartLanes::from_track(&source.tracks[0])})
}

/// Allocate by full names without stealing lanes or changing another clip's base.
pub fn remap_part_lanes(clip:&mut Clip,source:&PartLanes,target:&crate::track::Track)->Result<PartLanes,&'static str> {
    let mut lanes=PartLanes::from_track(target);
    let mut map_source_to_target=[0usize;8];
    for source_lane in 0..8 {
        if !clip.has_lock_on_lane(source_lane as u8){continue;}
        let name=&source.labels[source_lane];
        if !source.assigned[source_lane]||name.is_empty(){return Err("Missing automation target");}
        let lane=(0..8).find(|&lane|lanes.assigned[lane]&&lanes.labels[lane]==*name)
            .or_else(||(0..8).find(|&lane|!lanes.assigned[lane])).ok_or("No free automation lane")?;
        if !lanes.assigned[lane]{lanes.assigned[lane]=true;lanes.labels[lane]=name.clone();lanes.bases[lane]=source.bases[source_lane];}
        // A note resets a lane to base. Materialize its saved base on those steps.
        let reset_steps:Vec<u16>=clip.notes.iter().map(|note|note.step)
            .filter(|step|clip.lock_at(source_lane as u8,*step).is_none()).collect();
        for step in reset_steps {
            if clip.lock_at(source_lane as u8,step).is_some(){continue;}
            if clip.locks.len()>=crate::clip::MAX_LOCKS{return Err("Automation capacity exceeded");}
            clip.set_lock(source_lane as u8,step,source.bases[source_lane]);
        }
        map_source_to_target[source_lane]=lane;
    }
    for lock in &mut clip.locks {
        lock.lane=*map_source_to_target.get(lock.lane as usize).ok_or("Invalid automation lane")? as u8;
    }
    Ok(lanes)
}
impl Engine {
    pub fn part_load(&mut self,message:&str,out:&mut Vec<OutEvent>) {
        self.part_result=match self.part_load_checked(message,out){Ok(())=>"Loaded - Undo available".into(),Err(error)=>format!("error:{error}")};
    }
    fn part_load_checked(&mut self,message:&str,out:&mut Vec<OutEvent>)->Result<(),&'static str>{
        let fields:Vec<_>=message.split_whitespace().collect();
        if fields.len()!=7 && fields.len()!=8 {return Err("Incomplete preset");}
        let keep_weaving=match fields.get(7).copied().unwrap_or("own") {
            "own"=>false,"keep"=>true,_=>return Err("Invalid source routing choice"),
        };
        let track=fields[1].parse::<usize>().map_err(|_|"Invalid track")?;
        let slot=fields[2].parse::<usize>().map_err(|_|"Invalid clip")?;
        if self.part_recording_busy() {return Err("Finish recording first");}
        if track>=self.tracks.len()||self.track_is_drum(track){return Err("Select a melodic track");}
        let target=&self.tracks[track];
        if target.active_clip!=slot||target.playing_slot.is_some_and(|playing|playing!=slot) {return Err("Select the playing clip");}
        let info=self.motif_clip_info(track);let signature=info.split(',').nth(1).unwrap_or("");
        if signature!=fields[3] {return Err("Clip changed - preview again");}
        let baseline=Settings::parse(fields[6]).ok_or("Incomplete track settings")?;
        let PreparedPart{mut clip,lanes}=prepare_part(fields[4],fields[5])?;
        let lanes=remap_part_lanes(&mut clip,&lanes,target)?;
        self.flush_track_gates(track,out);
        self.recipe_bases[track].get_or_insert(baseline);
        let target=&mut self.tracks[track];
        target.clips[slot]=clip;target.lane_label=lanes.labels;target.lane_assigned=lanes.assigned;target.lane_base=lanes.bases;
        target.last_auto_step=-1;target.auto_cur=[-1;8];
        if target.playing_slot==Some(slot){target.pos_tick=target.clips[slot].loop_start_ticks();}
        if !keep_weaving {self.source_route_set(&crate::source_route::Route::default().message(track));}
        self.source_automation_invalidate();
        out.push(OutEvent::RecipeLanes{track:track as u8});
        self.ensure_selected_playing(track);self.recipe_tick(out);Ok(())
    }
    pub fn part_export(&self,track:usize)->String {
        let Some(target)=self.tracks.get(track) else{return "error:Invalid track".into();};
        if self.part_recording_busy() {return "error:Finish recording first".into();}
        if self.generator_exploring(track){return "error:Stop exploration before saving".into();}
        let clip=target.active();
        if clip.generator.is_some(){if let Err(error)=crate::generator::library_valid(clip,&target.lane_label){return format!("error:{error}");}}
        if !valid(clip,&target.lane_label){return "error:Load a mapped style first".into();}
        let mut preset=Engine::new(48000,12000);
        preset.tracks[0].clips[0]=clip.clone();
        preset.tracks[0].lane_label=target.lane_label.clone();preset.tracks[0].lane_assigned=target.lane_assigned;preset.tracks[0].lane_base=target.lane_base;
        let text=format!("{}\n{}",if clip.generator.is_some(){"part2"}else{"part1"},crate::persist::serialize(&preset));
        if text.len()>18000{return "error:Preset exceeds transfer capacity".into();}
        text.bytes().map(|byte|format!("{byte:02x}")).collect()
    }
}
fn valid(clip:&Clip,labels:&[String;8])->bool {
    // These two defaults guarantee mapped input. A recalled automation lane
    // must not silently turn either off; other renderer automation is retained.
    if clip.locks.iter().any(|lock|labels.get(lock.lane as usize).map_or(true,|label|matches!(label.as_str(),"midi_fx1:travel_map"|"midi_fx1:track_role"|"midi_fx1:role"))){return false;}

    clip.exists()&&(!clip.notes.is_empty()||clip.generator.is_some())&&clip.recipe.as_ref().is_some_and(|recipe|recipe.settings.mapped())&&
        clip.shared_events.is_empty()&&clip.notes.iter().all(|note|!note.rendered&&note.input_key.is_some()&&!note.actions.as_ref().is_some_and(crate::recorded_actions::chord_selection))
}
fn decode(value:&str)->Option<String>{
    if value.len()>36000||value.len()%2!=0||!value.is_ascii(){return None;}
    String::from_utf8((0..value.len()).step_by(2).map(|offset|u8::from_str_radix(&value[offset..offset+2],16).ok()).collect::<Option<Vec<_>>>()?).ok()
}
