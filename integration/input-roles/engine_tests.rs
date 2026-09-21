#[cfg(test)] mod follower_role_tests {
    use super::*;
    use crate::follower_input::InputKey;
    fn advance(engine: &mut Engine, ticks: u64) -> Vec<OutEvent> {
        let end=engine.master_tick+ticks;let mut events=Vec::new();
        while engine.master_tick<end {engine.advance_block(64,&mut events);}
        events
    }
    #[test] fn stored_third_projects_before_generation_and_lights_follow_input() {
        let mut engine=Engine::new(44100,12000);
        engine.tracks[0].active_mut().add_note_raw(0,0,48,64,100);
        engine.follower_input_context("fic1,0,1,1");
        let saved=crate::persist::serialize(&engine);
        assert!(saved.contains("fi 0 0 0 0 1"));
        assert!(crate::persist::load(&mut engine,&saved));
        engine.follower_input_context("fic1,2,2,1"); // D minor: third F
        engine.play();let events=advance(&mut engine,2);
        assert!(events.iter().any(|event|matches!(event,OutEvent::NoteOn {track:0,pitch:65,..})));
        assert!(engine.status().contains("act=65,"));
        assert_eq!(engine.tracks[0].active().notes[0].pitch,64,"Source never rewritten");
        engine.follower_input_context("fic1,5,1,1");
        let events=advance(&mut engine,50);
        assert!(events.iter().any(|event|matches!(event,OutEvent::NoteOff {track:0,pitch:65})),"Release uses onset pitch after key changes");
        assert!(!engine.status().contains("act=65,"));
        engine.stop(&mut Vec::new());engine.follower_input_context("fic1,0,1,1");
        engine.play();let events=advance(&mut engine,2);
        assert!(events.iter().any(|event|matches!(event,OutEvent::NoteOn {track:0,pitch:64,..})));
    }
    #[test] fn recording_tail_remembers_onset_scale_and_copy_preserves_it() {
        let mut engine=Engine::new(44100,12000);
        engine.tracks[0].active_mut().length_steps=16;
        engine.follower_input_context("fic1,0,1,1");engine.recording=true;engine.rec_track=0;
        engine.live_note_on(0,64,100);
        engine.follower_input_context("fic1,0,2,1");
        engine.tracks[0].pos_tick=24;engine.live_note_off(0,64);
        let note=&engine.tracks[0].active().notes[0];
        assert_eq!(note.input_key,InputKey::new(0,1));
        engine.copy_steps(0,0,0);engine.paste_steps(0,4);
        assert!(engine.tracks[0].active().notes.iter().all(|note|note.input_key==InputKey::new(0,1)));
    }
    #[test] fn recording_with_clip_transpose_preserves_the_played_degree() {
        let mut engine=Engine::new(44100,12000);
        engine.tracks[0].active_mut().length_steps=16;
        engine.tracks[0].active_mut().transpose=5;
        engine.follower_input_context("fic1,0,1,1");engine.recording=true;engine.rec_track=0;
        engine.live_note_on(0,64,100); // E, third, despite clip transpose
        engine.tracks[0].pos_tick=24;engine.live_note_off(0,64);
        engine.recording=false;
        let saved=crate::persist::serialize(&engine);assert!(saved.contains("fi 0 0 0 0 1 5"));
        assert!(crate::persist::load(&mut engine,&saved));
        engine.follower_input_context("fic1,2,2,1");
        engine.play();let events=advance(&mut engine,2);
        assert!(events.iter().any(|event|matches!(event,OutEvent::NoteOn {pitch:65,..})),"D minor third F, not a reclassified stored B");
        assert!(events.iter().any(|event|matches!(event,OutEvent::InputRole {degree:2,..})));
    }
    #[test] fn capture_retains_context_from_when_notes_were_played() {
        let mut engine=Engine::new(44100,12000);
        engine.follower_input_context("fic1,0,1,1");
        for _ in 0..8 {
            engine.live_note_on(0,64,100);engine.frame_now+=11025;
            engine.live_note_off(0,64);engine.frame_now+=11025;
        }
        engine.follower_input_context("fic1,2,2,1");
        assert!(engine.capture_commit(0));
        assert!(!engine.tracks[0].active().notes.is_empty());
        assert!(engine.tracks[0].active().notes.iter().all(|note|note.input_key==InputKey::new(0,1)));
    }
    #[test] fn conductor_rendered_and_drums_stay_absolute() {
        let mut engine=Engine::new(44100,12000);
        for track in 0..3 {engine.tracks[track].active_mut().add_note_raw(0,0,24,64,100);}
        engine.tracks[1].active_mut().notes[0].rendered=true;
        engine.set_track_drum(2,true);
        engine.follower_input_context("fic1,0,1,6");
        engine.follower_input_context("fic1,2,2,6");
        engine.play();let events=advance(&mut engine,2);
        assert!(events.iter().filter_map(|event|match event {OutEvent::NoteOn {pitch,..}|OutEvent::RenderedOn {pitch,..}=>Some(*pitch),_=>None}).all(|pitch|pitch==64));
    }
    #[test] fn chromatic_role_survives_collision_with_new_scale_member() {
        let mut engine=Engine::new(44100,12000);
        engine.tracks[0].active_mut().add_note_raw(0,0,24,66,100); // C major F# -> G approach
        engine.follower_input_context("fic1,0,1,1");
        engine.follower_input_context("fic1,0,5,1"); // C Lydian F# is now a scale member
        engine.play();let events=advance(&mut engine,2);
        assert!(events.iter().any(|event|matches!(event,OutEvent::InputRole {pitch:66,degree:3,target:67,..})));
    }
}
