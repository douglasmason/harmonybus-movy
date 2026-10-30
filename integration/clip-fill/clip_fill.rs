//! Edit-time clip composition. Playback remains the ordinary sequencer.
use crate::{clip::{Clip,MAX_NOTES,MAX_STEPS}, engine::{Engine,OutEvent}, part_settings::Settings,TICKS_PER_STEP};
use std::collections::BTreeMap;
use std::hash::{Hash,Hasher};
use crate::part_load::{PreparedPart,PartLanes,prepare_part,remap_part_lanes};

/// One transient saved-library source; never part of a Set or the Undo snapshot.
pub struct FillLibrarySource {bank:usize,choice:usize,part:PreparedPart}

/// Preserve full recipes at their authored length. Resize only timing we can
/// repeat faithfully; conditional/live timelines remain available at Style length.
fn repeat_style(source:&Clip,bars:usize)->Result<Clip,&'static str> {
    let mut clip=source.clone();
    for note in &mut clip.notes {note.fired=false;note.suppress=false;}
    if bars==0||bars as u32*16*TICKS_PER_STEP==source.length_ticks(){return Ok(clip);}
    if source.generator.is_some()||!source.trigs.is_empty()||!source.operation_intervals.is_empty()||!source.grid_gates.is_empty()
        ||source.quant!=0||source.scale_num!=source.scale_den {
        return Err("Use Style length for this saved timing");
    }
    let duration=bars as u32*16*TICKS_PER_STEP;
    if source.length_ticks()==0{return Err("Empty style");}
    clip.notes.clear();clip.locks.clear();clip.loop_start_steps=0;clip.length_steps=(bars*16) as u16;
    for cycle in (0..duration).step_by(source.length_ticks() as usize) {
        for source_note in source.notes.iter().filter(|note|note.tick>=source.loop_start_ticks()&&note.tick<source.loop_end_ticks()) {
            let tick=cycle+source_note.tick-source.loop_start_ticks();if tick>=duration{continue;}
            if clip.notes.len()>=MAX_NOTES{return Err("Clip note capacity exceeded");}
            let mut note=source_note.clone();note.tick=tick;
            note.step=(cycle/TICKS_PER_STEP) as u16+source_note.step.saturating_sub(source.loop_start_steps);
            note.gate=note.gate.max(1).min(duration-tick);note.pressure.retain(|&(offset,_)|offset<note.gate);
            note.fired=false;note.suppress=false;clip.notes.push(note);
        }
        for source_lock in source.locks.iter().filter(|lock|lock.step>=source.loop_start_steps&&lock.step<source.loop_start_steps+source.length_steps) {
            let step=(cycle/TICKS_PER_STEP) as u16+source_lock.step-source.loop_start_steps;
            if step>=clip.length_steps{continue;}
            if clip.locks.len()>=crate::clip::MAX_LOCKS{return Err("Automation capacity exceeded");}
            let mut lock=*source_lock;lock.step=step;clip.locks.push(lock);
        }
    }
    Ok(clip)
}

/// Shared with live Source Weaving: chord groups are selected by onset, not voice.
pub fn pitch_onset(clip:&Clip, phase:Option<u32>, previous:Option<u32>)->Option<u32> {
    let eligible=|note:&&crate::clip::Note|note.vel>0&&!note.suppress&&note.tick>=clip.loop_start_ticks()&&note.tick<clip.loop_end_ticks();
    if let Some(phase)=phase {
        clip.notes.iter().take(MAX_NOTES).filter(eligible).filter(|note|note.tick<=phase).map(|note|note.tick).max()
            .or_else(||clip.notes.iter().take(MAX_NOTES).filter(eligible).map(|note|note.tick).max())
    } else {
        clip.notes.iter().take(MAX_NOTES).filter(eligible).filter(|note|previous.map_or(true,|last|note.tick>last)).map(|note|note.tick).min()
            .or_else(||clip.notes.iter().take(MAX_NOTES).filter(eligible).map(|note|note.tick).min())
    }
}
struct Plan {clip:Clip, signature:u64, drum:bool, lanes:Option<PartLanes>}
impl Engine {
    /// UI transfers a saved entry explicitly through the existing command channel.
    /// This replaces only preview material: no notes, dirty flag or clip edits.
    pub fn fill_prepare_library(&mut self,message:&str) {
        self.fill_library=(|| {
            let fields:Vec<_>=message.split_whitespace().collect();
            if fields.len()!=4{return Err("Invalid saved style");}
            let bank=fields[1].parse::<usize>().map_err(|_|"Invalid library")?;
            let choice=fields[2].parse::<usize>().map_err(|_|"Invalid style")?;
            let count=match bank {16=>crate::part_catalog::NAMES.len(),17=>crate::part_catalog::BASS_NAMES.len(),_=>return Err("Invalid library")};
            if choice<count||choice>=count+8{return Err("Invalid user slot");}
            Ok(FillLibrarySource{bank,choice,part:prepare_part("user",fields[3])?})
        })();
    }
    fn fill_style_plan(&self,request:&str,fields:&[usize])->Result<Plan,&'static str> {
        let bank=fields[0];let choice=fields[1];let bars=fields[4];
        if fields[5]!=2||fields.get(6).copied().unwrap_or(0)!=0||fields.get(7).copied().unwrap_or(0)!=0 {
            return Err("Library styles keep original rhythm");
        }
        let (kind,count)=match bank {16=>("stock",crate::part_catalog::NAMES.len()),17=>("bass",crate::part_catalog::BASS_NAMES.len()),_=>return Err("Invalid library")};
        let part=if choice<count {prepare_part(kind,&choice.to_string())?} else {
            let saved=self.fill_library.as_ref().map_err(|error|*error)?;
            if saved.bank!=bank||saved.choice!=choice{return Err("Saved style changed - preview again");}
            saved.part.clone()
        };
        let clip=repeat_style(&part.clip,bars)?;
        let mut hash=std::collections::hash_map::DefaultHasher::new();
        request.hash(&mut hash);crate::motif_load::fingerprint(&part.clip).hash(&mut hash);
        format!("{:?}",part.lanes).hash(&mut hash);
        Ok(Plan{clip,signature:hash.finish(),drum:false,lanes:Some(part.lanes)})
    }
    fn fill_plan(&self,request:&str)->Result<Plan,&'static str>{
        let fields:Vec<usize>=request.split('_').map(str::parse).collect::<Result<_,_>>().map_err(|_|"Invalid sources")?;
        if fields.len()!=6&&fields.len()!=8 {return Err("Invalid sources");}
        let [pitch_track,pitch_slot,rhythm_track,rhythm_slot,bars,alignment]=fields[..6] else {unreachable!()};
        // Optional edit-time phase offsets. The legacy six-field request remains identical.
        let pitch_rotation=fields.get(6).copied().unwrap_or(0);
        let rhythm_rotation=fields.get(7).copied().unwrap_or(0);
        if bars>16||alignment>2||pitch_rotation>15||rhythm_rotation>15 {
            return Err("Invalid length, alignment or rotation");
        }
        if matches!(pitch_track,16|17){return self.fill_style_plan(request,&fields);}
        if bars==0{return Err("Invalid length");}
        if alignment==2&&(pitch_rotation!=0||rhythm_rotation!=0) {
            return Err("Original phrases keep their authored pitch and rhythm");
        }
        let source=|track:usize,slot:usize| self.tracks.get(track).and_then(|track|track.clips.get(slot)).ok_or("Invalid clip");
        let original_pitch=source(pitch_track,pitch_slot)?;
        let rhythm=if alignment==2 {original_pitch}else{source(rhythm_track,rhythm_slot)?};
        let drum=self.track_is_drum(pitch_track);
        if drum&&alignment!=2{return Err("Drum grooves need Original mode");}
        if drum&&(!original_pitch.locks.is_empty()||original_pitch.notes.iter().any(|note|note.actions.as_ref().is_some_and(|actions|actions.iter().any(|word|*word!=0)))){return Err("Use drum clips without automation or operations");}
        // These are authored notes, not a capture of stochastic/live operations.
        if !rhythm.trigs.is_empty()||!rhythm.operation_intervals.is_empty()||!rhythm.grid_gates.is_empty()||!original_pitch.shared_events.is_empty()||!original_pitch.operation_intervals.is_empty(){return Err("Use plain clips; live operations need Weaving");}
        if rhythm.quant!=0||rhythm.scale_num!=rhythm.scale_den {return Err("Rhythm needs original timing/speed");}
        let mut pitch=original_pitch.clone();for note in &mut pitch.notes {note.fired=false;note.suppress=false;}
        if !drum&&pitch.notes.iter().any(|note|note.rendered||(!note.actions.as_ref().is_some_and(crate::recorded_actions::chord_selection)&&note.input_key.or(pitch.input_key).is_none())){return Err("Pitch clip needs saved input key");}
        let duration=bars as u32*16*TICKS_PER_STEP;
        let rhythm_length=rhythm.length_ticks();if rhythm_length==0||pitch.length_ticks()==0{return Err("Empty source clip");}
        let mut attacks=BTreeMap::<u32,(u32,u8)>::new();
        for note in &rhythm.notes {
            if note.vel==0||note.tick<rhythm.loop_start_ticks()||note.tick>=rhythm.loop_end_ticks(){continue;}
            // Rotate the source's rhythm within its own loop, not against the destination
            // bars. Ties, gaps, accents and their existing gate lengths remain authored.
            let phase=(note.tick-rhythm.loop_start_ticks()+rhythm_rotation as u32*TICKS_PER_STEP)%rhythm_length;
            let attack=attacks.entry(phase).or_insert((1,note.vel));
            attack.0=attack.0.max(note.gate);attack.1=attack.1.max(note.vel);
        }
        if attacks.is_empty()&&alignment!=2{return Err("Rhythm clip has no attacks");}
        let mut clip=Clip::new();clip.length_steps=(bars*16) as u16;
        if !drum {clip.input_key=pitch.input_key;clip.transpose=pitch.transpose;clip.recipe=pitch.recipe.clone();}
        let mut previous=None;
        if alignment==2 {
            // Authored gates encode ties; gaps and empty loops encode rests.
            // Repeat the original phrase without introducing a new attack at a tie.
            for cycle in (0..duration).step_by(pitch.length_ticks() as usize) {
                for source_note in pitch.notes.iter().filter(|note|note.vel>0&&note.tick>=pitch.loop_start_ticks()&&note.tick<pitch.loop_end_ticks()) {
                    let tick=cycle+source_note.tick-pitch.loop_start_ticks();if tick>=duration{continue;}
                    if clip.notes.len()>=MAX_NOTES{return Err("Clip note capacity exceeded");}
                    let mut note=source_note.clone();note.input_key=note.input_key.or(pitch.input_key);
                    note.tick=tick;note.step=(tick/TICKS_PER_STEP) as u16;note.gate=note.gate.max(1).min(duration-tick);
                    if drum {
                        // Drum pitches are kit addresses, never harmonic input.
                        note.input_key=None;note.actions=None;note.rendered=false;
                        note.pressure.retain(|&(offset,_)|offset<note.gate);
                    } else {note.pressure.clear();}
                    clip.notes.push(note);
                }
            }
        } else {
        // Rotate pitch groups, never individual chord notes. Keep the shared onset
        // selector and source-key/operation identities used by live weaving.
        let onsets:Vec<u32>=pitch.notes.iter()
            .filter(|note|note.vel>0&&note.tick>=pitch.loop_start_ticks()&&note.tick<pitch.loop_end_ticks())
            .map(|note|note.tick).collect::<std::collections::BTreeSet<_>>().into_iter().collect();
        if onsets.is_empty(){return Err("Pitch clip has no notes");}
        // Repeat rhythm at authored rate. Fit maps the pitch phrase into the target window.
        for cycle in (0..duration).step_by(rhythm_length as usize) {
            for (&offset,&(gate,velocity)) in &attacks {
                let tick=cycle+offset;if tick>=duration{break;}
                let phase=(alignment==1).then(||crate::source_route::fitted_phase(tick,0,duration,pitch.loop_start_ticks(),pitch.length_ticks()));
                let base_onset=pitch_onset(&pitch,phase,previous).ok_or("Pitch clip has no notes")?;
                previous=Some(base_onset);
                let position=onsets.binary_search(&base_onset).map_err(|_|"Pitch clip changed")?;
                let onset=onsets[(position+pitch_rotation)%onsets.len()];
                for source_note in pitch.notes.iter().filter(|note|note.tick==onset&&note.vel>0) {
                    if clip.notes.len()>=MAX_NOTES{return Err("Clip note capacity exceeded");}
                    let mut note=source_note.clone();note.input_key=note.input_key.or(pitch.input_key);
                    note.tick=tick;note.step=(tick/TICKS_PER_STEP) as u16;note.gate=gate.max(1).min(duration-tick);note.vel=velocity;
                    note.pressure.clear();clip.notes.push(note);
                }
            }
        }
        }
        if (clip.notes.is_empty()&&alignment!=2)||clip.length_steps>MAX_STEPS{return Err("Empty result");}
        let mut hash=std::collections::hash_map::DefaultHasher::new();
        // Explicit zero offsets and old six-field requests have identical signatures.
        if fields.len()==8&&pitch_rotation==0&&rhythm_rotation==0 {
            fields[..6].iter().map(usize::to_string).collect::<Vec<_>>().join("_").hash(&mut hash);
        } else { request.hash(&mut hash); }
        drum.hash(&mut hash);
        crate::motif_load::fingerprint(original_pitch).hash(&mut hash);crate::motif_load::fingerprint(rhythm).hash(&mut hash);
        Ok(Plan{clip,signature:hash.finish(),drum,lanes:None})
    }
    pub fn fill_preview(&self,request:&str)->String {
        match self.fill_plan(request) {
            Err(error)=>format!("error:{error}"),
            Ok(plan)=>{
                let start=plan.clip.loop_start_ticks();let end=plan.clip.loop_end_ticks();
                let events=plan.clip.notes.iter().filter(|note|note.tick>=start&&note.tick<end).take(64).map(|note|format!("{},{},{},{}",note.tick-start,note.gate,note.pitch,note.vel)).collect::<Vec<_>>().join(";");
                let lanes=plan.clip.notes.iter().map(|note|note.pitch).collect::<std::collections::BTreeSet<_>>().into_iter().map(|pitch|pitch.to_string()).collect::<Vec<_>>().join(",");
                format!("{:x}|{}|{}|{}|{}|{}",plan.signature,plan.clip.length_ticks(),plan.clip.notes.len(),events,if plan.drum{"drums"}else{"melodic"},lanes)
            }
        }
    }
    pub fn fill_target(&self,request:&str)->String {
        let values:Vec<usize>=request.split('_').filter_map(|value|value.parse().ok()).collect();
        if values.len()!=2{return "error:Invalid target".into();}
        self.tracks.get(values[0]).and_then(|track|track.clips.get(values[1])).map_or_else(||"error:Invalid target".into(),|clip|{
            let mut hash=std::collections::hash_map::DefaultHasher::new();
            crate::motif_load::fingerprint(clip).hash(&mut hash);self.track_is_drum(values[0]).hash(&mut hash);
            format!("{:x}",hash.finish())
        })
    }
    pub fn fill_write(&mut self,message:&str,out:&mut Vec<OutEvent>){
        self.part_result=match self.fill_write_checked(message,out){Ok(())=>"Filled - Undo available".into(),Err(error)=>format!("error:{error}")};
    }
    fn fill_write_checked(&mut self,message:&str,out:&mut Vec<OutEvent>)->Result<(),&'static str>{
        let values:Vec<_>=message.split_whitespace().collect();if values.len()!=8{return Err("Invalid fill request");}
        if self.part_recording_busy(){return Err("Finish recording first");}
        let track=values[1].parse::<usize>().map_err(|_|"Invalid track")?;let slot=values[2].parse::<usize>().map_err(|_|"Invalid clip")?;
        if track>=self.tracks.len(){return Err("Invalid track");}
        if self.fill_target(&format!("{track}_{slot}"))!=values[3]{return Err("Destination changed - retry");}
        let mut plan=self.fill_plan(values[4])?;
        if format!("{:x}",plan.signature)!=values[5]{return Err("Source changed - preview again");}
        if plan.drum!=self.track_is_drum(track){return Err(if plan.drum{"Choose a drum destination"}else{"Choose a melodic destination"});}
        if !matches!(values[7],"own"|"keep"){return Err("Invalid weaving choice");}
        let baseline=if plan.drum {
            if values[6]!="drums"{return Err("Drum destination changed - retry");}
            if values[7]=="keep"&&self.source_routes[track].enabled{return Err("Choose Own content for drums");}
            None
        } else {
            let baseline=Settings::parse(values[6]).ok_or("Destination needs HarmonyBus settings")?;
            let conductor=baseline.0[0]==0;
            if !conductor&&baseline.0[0]!=1{return Err("Choose a conductor or follower destination");}
            let settings=plan.clip.recipe.as_ref().map_or(baseline,|recipe|recipe.settings);
            if conductor {
                if settings.0[0]!=0{return Err("Choose conductor content; source recipe is a follower");}
            } else {
                if plan.clip.notes.iter().any(|note|note.actions.as_ref().is_some_and(crate::recorded_actions::chord_selection)){return Err("Chord selections need a conductor destination");}
                if !settings.mapped(){return Err("Destination needs Relative or Split mapping");}
            }
            let recipe=plan.clip.recipe.get_or_insert(crate::clip_recipe::Recipe{name:"Clip-Fill".into(),settings,gate:100});
            if plan.lanes.is_none(){recipe.gate=100;}
            Some(baseline)
        };
        let lanes=plan.lanes.as_ref().map(|source|remap_part_lanes(&mut plan.clip,source,&self.tracks[track])).transpose()?;
        if self.tracks[track].playing_slot==Some(slot){self.flush_track_gates(track,out);}
        if let Some(baseline)=baseline {self.recipe_bases[track].get_or_insert(baseline);}
        self.tracks[track].clips[slot]=plan.clip;
        self.tracks[track].last_auto_step=-1;self.tracks[track].auto_cur=[-1;8];
        if let Some(lanes)=lanes {
            self.tracks[track].lane_label=lanes.labels;self.tracks[track].lane_assigned=lanes.assigned;self.tracks[track].lane_base=lanes.bases;
            out.push(OutEvent::RecipeLanes{track:track as u8});
        }
        if self.tracks[track].playing_slot==Some(slot){self.tracks[track].pos_tick=self.tracks[track].clips[slot].loop_start_ticks();}
        if values[7]=="own"{self.source_route_set(&crate::source_route::Route::default().message(track));}
        self.source_automation_invalidate();self.recipe_tick(out);Ok(())
    }
}
