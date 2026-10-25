//! Edit-time clip composition. Playback remains the ordinary sequencer.
use crate::{clip::{Clip,MAX_NOTES,MAX_STEPS}, engine::{Engine,OutEvent}, part_settings::Settings,TICKS_PER_STEP};
use std::collections::BTreeMap;
use std::hash::{Hash,Hasher};

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
struct Plan {clip:Clip, signature:u64}
impl Engine {
    fn fill_plan(&self,request:&str)->Result<Plan,&'static str>{
        let fields:Vec<usize>=request.split('_').map(str::parse).collect::<Result<_,_>>().map_err(|_|"Invalid sources")?;
        if fields.len()!=6 {return Err("Invalid sources");}
        let [pitch_track,pitch_slot,rhythm_track,rhythm_slot,bars,alignment]=fields[..] else {unreachable!()};
        if bars==0||bars>16||alignment>1 {return Err("Invalid length or alignment");}
        let source=|track:usize,slot:usize| self.tracks.get(track).and_then(|track|track.clips.get(slot)).ok_or("Invalid clip");
        let original_pitch=source(pitch_track,pitch_slot)?;
        let rhythm=source(rhythm_track,rhythm_slot)?;
        if self.track_is_drum(pitch_track){return Err("Choose melodic pitch content");}
        // These are authored notes, not a capture of stochastic/live operations.
        if !rhythm.trigs.is_empty()||!rhythm.operation_intervals.is_empty()||!rhythm.grid_gates.is_empty()||!original_pitch.shared_events.is_empty()||!original_pitch.operation_intervals.is_empty(){return Err("Use plain clips; live operations need Weaving");}
        if rhythm.quant!=0||rhythm.scale_num!=rhythm.scale_den {return Err("Rhythm needs original timing/speed");}
        let mut pitch=original_pitch.clone();for note in &mut pitch.notes {note.fired=false;note.suppress=false;}
        if pitch.notes.iter().any(|note|note.rendered||note.input_key.or(pitch.input_key).is_none()){return Err("Pitch clip needs saved input key");}
        let duration=bars as u32*16*TICKS_PER_STEP;
        let rhythm_length=rhythm.length_ticks();if rhythm_length==0||pitch.length_ticks()==0{return Err("Empty source clip");}
        let mut attacks=BTreeMap::<u32,(u32,u8)>::new();
        for note in &rhythm.notes {
            if note.vel==0||note.tick<rhythm.loop_start_ticks()||note.tick>=rhythm.loop_end_ticks(){continue;}
            let attack=attacks.entry(note.tick-rhythm.loop_start_ticks()).or_insert((1,note.vel));
            attack.0=attack.0.max(note.gate);attack.1=attack.1.max(note.vel);
        }
        if attacks.is_empty(){return Err("Rhythm clip has no attacks");}
        let mut clip=Clip::new();clip.length_steps=(bars*16) as u16;clip.input_key=pitch.input_key;clip.transpose=pitch.transpose;
        clip.recipe=pitch.recipe.clone();let mut previous=None;
        // Repeat rhythm at authored rate. Fit maps the pitch phrase into the target window.
        for cycle in (0..duration).step_by(rhythm_length as usize) {
            for (&offset,&(gate,velocity)) in &attacks {
                let tick=cycle+offset;if tick>=duration{break;}
                let phase=(alignment==1).then(||crate::source_route::fitted_phase(tick,0,duration,pitch.loop_start_ticks(),pitch.length_ticks()));
                let onset=pitch_onset(&pitch,phase,previous).ok_or("Pitch clip has no notes")?;previous=Some(onset);
                for source_note in pitch.notes.iter().filter(|note|note.tick==onset&&note.vel>0) {
                    if clip.notes.len()>=MAX_NOTES{return Err("Clip note capacity exceeded");}
                    let mut note=source_note.clone();note.input_key=note.input_key.or(pitch.input_key);
                    note.tick=tick;note.step=(tick/TICKS_PER_STEP) as u16;note.gate=gate.max(1).min(duration-tick);note.vel=velocity;
                    note.pressure.clear();clip.notes.push(note);
                }
            }
        }
        if clip.notes.is_empty()||clip.length_steps>MAX_STEPS{return Err("Empty result");}
        let mut hash=std::collections::hash_map::DefaultHasher::new();request.hash(&mut hash);
        crate::motif_load::fingerprint(original_pitch).hash(&mut hash);crate::motif_load::fingerprint(rhythm).hash(&mut hash);
        Ok(Plan{clip,signature:hash.finish()})
    }
    pub fn fill_preview(&self,request:&str)->String {
        match self.fill_plan(request) {
            Err(error)=>format!("error:{error}"),
            Ok(plan)=>{
                let events=plan.clip.notes.iter().take(64).map(|note|format!("{},{},{},{}",note.tick,note.gate,note.pitch,note.vel)).collect::<Vec<_>>().join(";");
                format!("{:x}|{}|{}|{}",plan.signature,plan.clip.length_ticks(),plan.clip.notes.len(),events)
            }
        }
    }
    pub fn fill_target(&self,request:&str)->String {
        let values:Vec<usize>=request.split('_').filter_map(|value|value.parse().ok()).collect();
        if values.len()!=2{return "error:Invalid target".into();}
        self.tracks.get(values[0]).and_then(|track|track.clips.get(values[1])).map_or_else(||"error:Invalid target".into(),|clip|format!("{:x}",crate::motif_load::fingerprint(clip)))
    }
    pub fn fill_write(&mut self,message:&str,out:&mut Vec<OutEvent>){
        self.part_result=match self.fill_write_checked(message,out){Ok(())=>"Filled - Undo available".into(),Err(error)=>format!("error:{error}")};
    }
    fn fill_write_checked(&mut self,message:&str,out:&mut Vec<OutEvent>)->Result<(),&'static str>{
        let values:Vec<_>=message.split_whitespace().collect();if values.len()!=8{return Err("Invalid fill request");}
        if self.part_recording_busy(){return Err("Finish recording first");}
        let track=values[1].parse::<usize>().map_err(|_|"Invalid track")?;let slot=values[2].parse::<usize>().map_err(|_|"Invalid clip")?;
        if track>=self.tracks.len()||self.track_is_drum(track){return Err("Choose a melodic destination");}
        if self.fill_target(&format!("{track}_{slot}"))!=values[3]{return Err("Destination changed - retry");}
        let mut plan=self.fill_plan(values[4])?;
        if format!("{:x}",plan.signature)!=values[5]{return Err("Source changed - preview again");}
        let baseline=Settings::parse(values[6]).ok_or("Destination needs HarmonyBus settings")?;
        if baseline.0[0]!=1{return Err("Choose a follower destination");}
        let settings=plan.clip.recipe.as_ref().map_or(baseline,|recipe|recipe.settings);
        if !settings.mapped(){return Err("Destination needs Relative or Split mapping");}
        if !matches!(values[7],"own"|"keep"){return Err("Invalid weaving choice");}
        plan.clip.recipe.get_or_insert(crate::clip_recipe::Recipe{name:"Clip-Fill".into(),settings,gate:100}).gate=100;
        if self.tracks[track].playing_slot==Some(slot){self.flush_track_gates(track,out);}
        self.recipe_bases[track].get_or_insert(baseline);
        self.tracks[track].clips[slot]=plan.clip;
        self.tracks[track].last_auto_step=-1;self.tracks[track].auto_cur=[-1;8];
        if self.tracks[track].playing_slot==Some(slot){self.tracks[track].pos_tick=0;}
        if values[7]=="own"{self.source_route_set(&crate::source_route::Route::default().message(track));}
        self.source_automation_invalidate();self.recipe_tick(out);Ok(())
    }
}
