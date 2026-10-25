use super::*;
use crate::{command::apply_batch,persist};
fn fixture()->Engine {
    let mut engine=Engine::new(48000,12000);engine.track_drum[0]=true;
    let clip=engine.tracks[0].active_mut();clip.length_steps=16;
    for (tick,pitch) in [(0,38),(300,38),(312,36),(348,38)] {clip.add_note_raw((tick/24) as u16,tick,6,pitch,80);}
    engine.tracks[0].playing_slot=Some(0);engine.playing=true;engine
}
fn attacks(events:&[OutEvent],pitch:u8)->usize {events.iter().filter(|event|matches!(event,OutEvent::NoteOn{track:0,pitch:p,..} if *p==pitch)).count()}
#[test] fn temporary_fill_replaces_only_selected_lane_once_without_changing_saved_content(){
    let mut engine=fixture();let before=engine.undo_snapshot();let mut out=Vec::new();
    engine.dirty=false;apply_batch(&mut engine,"dfire 0 38 96 24 101",&mut out);assert!(!engine.dirty);
    let mut times=Vec::new();
    for tick in 0..768 {out.clear();engine.step_tick(0,&mut out);if attacks(&out,38)>0{times.push(tick);}}
    assert_eq!(times,vec![0,288,312,336,360,384,684,732]);
    assert_eq!(engine.undo_snapshot(),before);assert!(engine.drum_fills[0].is_none());
}
#[test] fn record_captures_only_elapsed_selected_lane_and_undo_restores_it(){
    let mut engine=fixture();let mut out=Vec::new();let before=engine.undo_snapshot();
    apply_batch(&mut engine,"usnap 81;dfire 0 38 96 24 101",&mut out);
    engine.recording=true;engine.rec_track=0;
    for tick in 0..384 {if tick==325{engine.recording=false;}engine.step_tick(0,&mut out);}
    let clip=engine.tracks[0].active();
    assert_eq!(clip.notes.iter().filter(|n|n.pitch==38).map(|n|n.tick).collect::<Vec<_>>(),vec![0,348,288,312]);
    assert!(clip.notes.iter().any(|n|n.pitch==36&&n.tick==312));
    assert_eq!(attacks(&out,38),5);
    let saved=persist::serialize(&engine);let mut restored=Engine::new(48000,12000);assert!(persist::load(&mut restored,&saved));
    assert!(restored.tracks[0].active().notes.iter().any(|n|n.tick==288&&n.vel==101));
    apply_batch(&mut engine,"ucommit 81;uswap 81 82",&mut out);assert_eq!(engine.undo_snapshot(),before);
}
#[test] fn another_tracks_recording_does_not_capture_fill_and_stop_balances_gates(){
    let mut engine=fixture();engine.recording=true;engine.rec_track=1;
    let before=engine.undo_snapshot();let mut out=Vec::new();engine.trigger_drum_fill("0 38 96 24 101");
    for _ in 0..290 {engine.step_tick(0,&mut out);}engine.stop(&mut out);
    assert!(engine.drum_fills[0].is_none());assert!(engine.gates.is_empty());assert_eq!(engine.undo_snapshot(),before);
    let ons=attacks(&out,38);let offs=out.iter().filter(|e|matches!(e,OutEvent::NoteOff{track:0,pitch:38})).count();assert_eq!(ons,offs);
}
#[test] fn loop_edits_record_capacity_and_invalid_requests_are_safe(){
    let mut engine=fixture();let mut out=Vec::new();let before=engine.undo_snapshot();
    for request in ["0 38 96 0 100","0 128 96 24 100","16 38 96 24 100","0 38 96 24 128","0 38 96 24 100 extra"]{engine.trigger_drum_fill(request);assert!(engine.drum_fill_result.starts_with("error:"));}
    assert_eq!(engine.undo_snapshot(),before);
    engine.trigger_drum_fill("0 38 96 24 100");engine.tracks[0].clips[0].length_steps=8;engine.step_tick(0,&mut out);assert!(engine.drum_fills[0].is_none());
    let note=engine.tracks[0].active().notes[0].clone();engine.tracks[0].active_mut().notes=vec![note;crate::clip::MAX_NOTES];
    engine.recording=true;engine.rec_track=0;engine.trigger_drum_fill("0 38 96 24 100");assert!(engine.drum_fill_result.contains("full"));
}
#[test] fn swing_and_nonzero_loop_start_are_shared_with_authored_fill(){
    let mut engine=fixture();engine.swing_pct=80;
    engine.tracks[0].active_mut().set_loop(16,16);engine.tracks[0].pos_tick=384;
    engine.trigger_drum_fill("0 38 96 24 101");let mut out=Vec::new();let mut ticks=Vec::new();
    for tick in 384..768 {out.clear();engine.step_tick(0,&mut out);if attacks(&out,38)>0{ticks.push(tick);}}
    assert_eq!(ticks,vec![672,708,720,756]);
}
