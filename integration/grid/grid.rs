//! Grid editing is a view onto ordinary input notes and timed operation holds.
use crate::{engine::{Engine,OutEvent},clip::Clip,TICKS_PER_STEP};
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Gate {pub start:u32,pub end:u32,pub lane:u8}
#[derive(Clone,Copy,Debug)]
pub struct View {pub start:u32,pub division:u32,pub rows:[u16;8]}
impl Default for View {fn default()->Self{Self{start:0,division:24,rows:[65535;8]}}}
pub const MAX_GATES:usize=4096;
pub fn mask(clip:&Clip,position:u32)->u16 {
    clip.grid_gates.iter().filter(|gate|position>=gate.start&&position<gate.end)
        .fold(0,|bits,gate|bits|(1<<gate.lane))
}
impl Engine {
    pub fn grid_release(&mut self,track:usize,out:&mut Vec<OutEvent>) {
        self.grid_performance[track]=Default::default();
        if self.grid_masks[track]!=0 {self.grid_masks[track]=0;out.push(OutEvent::GridMask{track:track as u8,mask:0});}
    }
    pub fn grid_tick(&mut self,track:usize,out:&mut Vec<OutEvent>) {
        let state=&self.tracks[track];
        let next=if state.muted {0} else {state.playing_slot.map_or(0,|slot|mask(&state.clips[slot],state.pos_tick))};
        if let Some(slot)=state.playing_slot {
            for lane in 0..16 {
                let down=next&(1<<lane)!=0;
                if let Some(config)=self.grid_configs[track][lane] {
                    self.grid_performance[track].hold(lane,down,config.operation,config.amount,config.grid,state.pos_tick,slot);
                } else {self.grid_performance[track].slots[lane]=None;}
            }
        }
        if next!=self.grid_masks[track] {self.grid_masks[track]=next;out.push(OutEvent::GridMask{track:track as u8,mask:next});}
    }
    /// Note and gate edits share clip persistence, selection, and engine undo.
    pub fn grid_toggle(&mut self,track:usize,start:u32,duration:u32,assignment:u16,velocity:u8) {
        if track>=self.tracks.len()||![24,48,96,192,384].contains(&duration)||start%duration!=0||start+duration>6144||assignment>143{return;}
        let clip=self.tracks[track].active_mut();
        if clip.length_steps==0 {clip.length_steps=16;}
        if start<clip.loop_start_ticks()||start>=clip.loop_start_ticks()+clip.length_ticks(){return;}
        if assignment<128 {
            let present=clip.notes.iter().any(|note|!note.rendered&&note.pitch==assignment as u8&&note.tick>=start&&note.tick<start+duration);
            if present {clip.notes.retain(|note|note.rendered||note.pitch!=assignment as u8||note.tick<start||note.tick>=start+duration);}
            else {clip.add_note_raw((start/TICKS_PER_STEP) as u16,start,duration.min(clip.loop_start_ticks()+clip.length_ticks()-start),assignment as u8,velocity.clamp(1,127));}
        } else {
            let lane=(assignment-128) as u8;
            let end=(start+duration).min(clip.loop_start_ticks()+clip.length_ticks());
            let present=clip.grid_gates.iter().any(|gate|gate.lane==lane&&gate.start<end&&gate.end>start);
            if present {
                let mut remaining=Vec::new();
                for gate in &clip.grid_gates {
                    if gate.lane!=lane||gate.start>=end||gate.end<=start {remaining.push(*gate);continue;}
                    if gate.start<start {remaining.push(Gate{end:start,..*gate});}
                    if gate.end>end {remaining.push(Gate{start:end,..*gate});}
                }
                if remaining.len()<=MAX_GATES {clip.grid_gates=remaining;}
            } else if clip.grid_gates.len()<MAX_GATES {clip.grid_gates.push(Gate{start,end,lane});}
        }
        self.ensure_selected_playing(track);self.dirty=true;
    }
    pub fn grid_status(&self)->String {
        let clip=self.tracks[self.watch_track].active();
        let windows=self.grid_views.iter().enumerate().map(|(surface,view)|{
            let mut events=Vec::new();
            for assignment in view.rows {if assignment>143{continue;}
                for column in 0..8 {
                    let tick=view.start+column*view.division;let end=tick+view.division;
                    let present=if assignment<128 {clip.notes.iter().any(|note|!note.rendered&&note.pitch==assignment as u8&&note.tick>=tick&&note.tick<end)} else {clip.grid_gates.iter().any(|gate|gate.lane as u16==assignment-128&&gate.start<end&&gate.end>tick)};
                    if present {events.push(format!("{}:{}:{}",tick,view.division,assignment));}
                }
            }
            format!("{}@{}",surface,events.join(","))
        }).collect::<Vec<_>>().join("/");
        // Fixed-size summary of input content, independent of either surface's window.
        let start=clip.loop_start_ticks();let length=clip.length_ticks().max(1);
        let mut bins=[0u8;64];
        for note in &clip.notes {
            if !note.rendered&&note.tick>=start&&note.tick<start+length {
                bins[((note.tick-start)*64/length) as usize]|=1;
            }
        }
        for gate in &clip.grid_gates {
            let begin=gate.start.max(start);let end=gate.end.min(start+length);
            if begin<end {for index in (begin-start)*64/length..=((end-1-start)*64/length) {bins[index as usize]|=2;}}
        }
        let summary:String=bins.iter().map(|value|char::from(b'0'+value)).collect();
        format!("{}/2@{}:{}:{}",windows,start,length,summary)
    }

}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn grid_edits_input_pitches_and_keeps_polyphony(){
        let mut engine=Engine::new(44100,12000);engine.grid_toggle(0,0,24,60,100);engine.grid_toggle(0,0,24,64,90);
        assert_eq!(engine.tracks[0].active().notes.len(),2);
        engine.grid_toggle(0,0,24,60,100);assert_eq!(engine.tracks[0].active().notes[0].pitch,64);
    }
    #[test] fn adjacent_gates_hold_without_retrigger_and_release_only_their_mask(){
        let mut engine=Engine::new(44100,12000);let mut out=Vec::new();
        engine.grid_toggle(0,0,24,128,100);engine.grid_toggle(0,24,24,128,100);
        engine.tracks[0].playing_slot=Some(0);
        for position in [0,23,24,47] {engine.tracks[0].pos_tick=position;engine.grid_tick(0,&mut out);}
        assert_eq!(out,vec![OutEvent::GridMask{track:0,mask:1}]);
        engine.tracks[0].pos_tick=48;engine.grid_tick(0,&mut out);assert_eq!(out.last(),Some(&OutEvent::GridMask{track:0,mask:0}));
    }
    #[test] fn removing_part_of_gate_preserves_rest(){
        let mut engine=Engine::new(44100,12000);engine.grid_toggle(0,0,96,130,100);engine.grid_toggle(0,24,24,130,100);
        assert_eq!(mask(engine.tracks[0].active(),0),4);assert_eq!(mask(engine.tracks[0].active(),24),0);assert_eq!(mask(engine.tracks[0].active(),48),4);
    }
}
#[cfg(test)] mod lifecycle_tests {
    use super::*;
    use crate::{command,persist};
    #[test] fn gates_survive_save_copy_and_undo_and_stop_releases(){
        let mut engine=Engine::new(44100,12000);let mut out=Vec::new();
        command::apply_batch(&mut engine,"usnap 7;gtog 0 0 24 128 100;gtog 0 24 24 60 100",&mut out);
        let saved=persist::serialize(&engine);
        let mut restored=Engine::new(44100,12000);assert!(persist::load(&mut restored,&saved));
        assert_eq!(restored.tracks[0].active().grid_gates,engine.tracks[0].active().grid_gates);
        restored.tracks[0].active_mut().double_loop();assert_eq!(restored.tracks[0].active().grid_gates.len(),2);
        restored.tracks[0].playing_slot=Some(0);restored.grid_tick(0,&mut out);
        restored.flush_track_gates(0,&mut out);assert_eq!(restored.grid_masks[0],0);
        assert!(out.contains(&OutEvent::GridMask{track:0,mask:0}));
        command::apply_batch(&mut engine,"uswap 7 8",&mut out);assert!(engine.tracks[0].active().grid_gates.is_empty());
    }
    #[test] fn status_is_bounded_by_visible_cells(){
        let mut engine=Engine::new(44100,12000);engine.grid_toggle(0,0,24,128,100);
        engine.grid_views[0]=View{start:0,division:24,rows:[128;8]};
        let status=engine.grid_status();assert!(status.starts_with("0@0:24:128"));assert!(status.len()<200);
        engine.grid_views[0].start=192;assert!(engine.grid_status().starts_with("0@/1@/2@0:384:2222"));
    }
    #[test] fn overview_covers_loop_and_excludes_rendered_notes(){
        let mut engine=Engine::new(44100,12000);
        let clip=engine.tracks[0].active_mut();
        clip.loop_start_steps=16;clip.length_steps=32;
        clip.add_note_raw(16,384,24,60,100);
        clip.add_note_raw(47,1151,1,62,100);
        clip.add_note_raw(20,480,24,64,100);
        clip.notes.last_mut().unwrap().rendered=true;
        clip.grid_gates.push(Gate{start:300,end:396,lane:0});
        clip.grid_gates.push(Gate{start:1100,end:1200,lane:1});
        let status=engine.grid_status();let summary=status.split("/2@").nth(1).unwrap();
        let bins=summary.strip_prefix("384:768:").unwrap();
        assert_eq!(bins.len(),64);assert!(bins.starts_with('3'));assert!(bins.ends_with('3'));
        assert_eq!(&bins[8..9],"0");
    }
}
