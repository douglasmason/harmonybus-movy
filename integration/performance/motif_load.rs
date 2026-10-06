//! Bounded, atomic motif input import. No voiced chord pitches are baked in.
use crate::{clip::{Clip,Note,MAX_NOTES,MAX_STEPS},engine::{Engine,OutEvent},follower_input::InputKey,TICKS_PER_STEP};
use std::hash::{Hash,Hasher};

fn fingerprint(clip:&Clip)->u64 {
    // Playback bookkeeping is deliberately excluded: a preview stays valid
    // while transport runs, but any persisted edit invalidates it.
    let mut saved=clip.clone();
    for note in &mut saved.notes {note.fired=false;note.suppress=false;}
    let mut hasher=std::collections::hash_map::DefaultHasher::new();
    format!("{saved:?}").hash(&mut hasher);hasher.finish()
}
fn number<T:std::str::FromStr>(value:Option<&str>)->Result<T,&'static str>{value.ok_or("Incomplete preview")?.parse().map_err(|_|"Invalid preview")}
impl Engine {
    pub fn motif_clip_info(&self,track:usize)->String {
        let Some(t)=self.tracks.get(track) else{return "error:Invalid track".into()};
        let clip=t.active();
        let occupied=!clip.notes.is_empty()||!clip.shared_events.is_empty()||!clip.operation_intervals.is_empty()||!clip.locks.is_empty()||!clip.trigs.is_empty();
        format!("{},{:x},{},{},{},{}",t.active_clip,fingerprint(clip),clip.length_steps,clip.loop_start_steps,clip.notes.len(),u8::from(occupied))
    }
    pub fn motif_load(&mut self,message:&str,out:&mut Vec<OutEvent>){
        self.motif_load_result=match self.motif_load_checked(message,out){Ok(())=>"Written — Undo available",Err(error)=>error}.into();
    }
    fn motif_load_checked(&mut self,message:&str,out:&mut Vec<OutEvent>)->Result<(),&'static str>{
        let mut fields=message.split_whitespace();
        if fields.next()!=Some("mload"){return Err("Invalid command")}
        let track:usize=number(fields.next())?;let slot:usize=number(fields.next())?;
        let signature=u64::from_str_radix(fields.next().ok_or("Missing preview")?,16).map_err(|_|"Invalid preview")?;
        let mode:u8=number(fields.next())?;let duration:u32=number(fields.next())?;
        let root:u8=number(fields.next())?;let scale:u8=number(fields.next())?;
        let payload=fields.next().ok_or("Empty motif")?;
        if fields.next().is_some()||payload.len()>40000||mode>2||duration==0||duration>MAX_STEPS as u32*TICKS_PER_STEP{return Err("Invalid motif length")}
        if self.recording{return Err("Finish recording first")}
        if track>=self.tracks.len()||self.track_is_drum(track){return Err("Select a melodic track")}
        let t=&self.tracks[track];let old=t.active();
        if t.active_clip!=slot||fingerprint(old)!=signature{return Err("Clip changed — preview again")}
        let mut key=InputKey::new(root,scale).ok_or("Unsupported input scale")?;
        key.transpose=old.transpose;
        let offset=if mode==1 {old.loop_end_ticks()}else if mode==2{old.loop_start_ticks()}else{0};
        let end=offset.checked_add(duration).ok_or("Invalid motif length")?;
        let steps=end.div_ceil(TICKS_PER_STEP);
        if steps>MAX_STEPS as u32{return Err("Exceeds 16 bars")}
        let mut notes=Vec::new();let mut event_count=0;let mut previous_end=0;
        for encoded in payload.split('|'){
            event_count+=1;if event_count>34{return Err("Too many motif events")}
            let (timing,words)=encoded.split_once(':').ok_or("Invalid motif event")?;
            let mut values=timing.split(',');let onset:u32=number(values.next())?;let gate:u32=number(values.next())?;
            if onset!=previous_end||gate==0||onset.checked_add(gate).filter(|end|*end<=duration).is_none(){return Err("Invalid event timing")}
            previous_end=onset+gate;
            let actions:Vec<u64>=words.split(',').map(|word|u64::from_str_radix(word,16)).collect::<Result<_,_>>().map_err(|_|"Invalid motif actions")?;
            let actions:[u64;52]=actions.try_into().map_err(|_|"Incomplete motif actions")?;
            if crate::recorded_actions::parse(&format!("ra4,{}",crate::recorded_actions::payload(0,actions))).is_none(){return Err("Unsupported motif actions")}
            let mut voices=0;
            for pair in values{
                voices+=1;if voices>8{return Err("Too many motif voices")}
                let (pitch,vel)=pair.split_once('.').ok_or("Invalid motif note")?;
                let pitch:i16=pitch.parse().map_err(|_|"Invalid pitch")?;let vel:u8=vel.parse().map_err(|_|"Invalid velocity")?;
                let stored=pitch-old.transpose as i16;
                if !(0..=127).contains(&pitch)||!(0..=127).contains(&stored)||!(1..=127).contains(&vel){return Err("Note exceeds MIDI range")}
                let tick=offset+onset;
                notes.push(Note{tick,gate,pitch:stored as u8,vel,step:(tick/TICKS_PER_STEP) as u16,
                    actions:Some(actions),input_key:Some(key),rendered:false,pressure:Vec::new(),suppress:false,fired:false});
            }
        }
        if previous_end!=duration||notes.is_empty(){return Err("Empty or incomplete motif")}
        if notes.len()+if mode==0{0}else{old.notes.len()}>MAX_NOTES{return Err("Clip note capacity exceeded")}
        // Stage the whole result before releasing notes or touching the clip.
        let mut clip=old.clone();
        if mode==0{
            clip.notes.clear();clip.shared_events.clear();clip.operation_intervals.clear();clip.locks.clear();clip.trigs.clear();
            clip.loop_start_steps=0;clip.length_steps=steps as u16;clip.input_key=Some(key);
        }else{
            clip.length_steps=clip.length_steps.max((steps as u16).saturating_sub(clip.loop_start_steps));
        }
        clip.notes.extend(notes);
        if mode==0&&self.tracks[track].playing_slot==Some(slot){self.flush_track_gates(track,out);}
        self.tracks[track].clips[slot]=clip;
        Ok(())
    }
}

#[cfg(test)] mod tests{
    use super::*;
    fn data()->String{let mut words=vec!["0";52];words[0]="80000001000003e8";words[51]="8000000000000010";format!("0,384,60.100,64.77:{}|384,384,62.90:{}",vec!["0";52].join(","),words.join(","))}
    fn command(e:&Engine,mode:u8)->String{let info=e.motif_clip_info(0);let v:Vec<_>=info.split(',').collect();format!("mload 0 {} {} {mode} 768 0 1 {}",v[0],v[1],data())}
    #[test] fn writes_input_actions_and_undo_roundtrips(){
        let mut e=Engine::new(48000,12000);let before=e.undo_snapshot();let cmd=command(&e,0);let mut out=vec![];
        crate::command::apply_batch(&mut e,&format!("usnap 41;{cmd};ucommit 41"),&mut out);
        let c=e.tracks[0].active();assert_eq!(c.notes.len(),3);assert_eq!(c.length_steps,32);
        assert_eq!(c.notes[2].actions.unwrap()[51],(1<<63)|16);assert!(!c.notes[0].rendered);assert!(c.notes[0].input_key.is_some());
        let saved=crate::persist::serialize(&e);let mut restored=Engine::new(48000,12000);assert!(crate::persist::load(&mut restored,&saved));
        assert_eq!(restored.tracks[0].active().notes[2].actions.unwrap()[51],(1<<63)|16);
        crate::command::apply_batch(&mut e,"uswap 41 42",&mut out);assert_eq!(e.undo_snapshot(),before);
    }
    #[test] fn append_overdub_and_rejections_are_atomic(){
        let mut e=Engine::new(48000,12000);let mut out=vec![];e.motif_load(&command(&e,0),&mut out);
        let stale=command(&e,0);e.tracks[0].active_mut().notes[0].vel=81;
        let before=e.undo_snapshot();e.motif_load(&stale,&mut out);assert_eq!(before,e.undo_snapshot());assert!(e.motif_load_result.contains("changed"));
        e.motif_load(&command(&e,1),&mut out);assert_eq!(e.tracks[0].active().length_steps,64);assert_eq!(e.tracks[0].active().notes[3].tick,768);
        e.motif_load(&command(&e,2),&mut out);assert_eq!(e.tracks[0].active().notes.len(),9);assert_eq!(e.tracks[0].active().notes[6].tick,0);
        for bad in [format!("{}broken",command(&e,0)),command(&e,3),command(&e,0).replace(" 768 0 1 "," 99999 0 1 ")]{
            let before=e.undo_snapshot();e.motif_load(&bad,&mut out);assert_eq!(before,e.undo_snapshot());
        }
        let before=e.undo_snapshot();e.recording=true;e.motif_load(&command(&e,0),&mut out);assert_eq!(before,e.undo_snapshot());
    }
    #[test] fn playback_bookkeeping_does_not_expire_preview(){
        let mut e=Engine::new(48000,12000);let mut out=vec![];e.motif_load(&command(&e,0),&mut out);
        let cmd=command(&e,2);e.tracks[0].active_mut().notes[0].fired=true;
        e.motif_load(&cmd,&mut out);assert_eq!(e.tracks[0].active().notes.len(),6);
    }
}
