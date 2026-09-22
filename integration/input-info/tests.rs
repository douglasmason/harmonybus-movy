
#[cfg(test)]
mod input_info_tests {
    use super::*;
    #[test]
    fn context_describes_projection_without_rewriting_notes() {
        let mut engine = Engine::new(44100,12000);
        assert!(engine.clip_input_info().starts_with("ci1,0,empty,"));
        engine.tracks[0].active_mut().add_note_raw(0,0,48,64,100);
        assert!(engine.clip_input_info().starts_with("ci1,0,fixed,"));
        engine.follower_input_context("fic1,0,1,1");
        engine.follower_input_context("fic1,0,2,1");
        assert_eq!(engine.clip_input_info(),"ci1,0,mapped,0,1,0,2");
        assert_eq!(engine.tracks[0].active().notes[0].pitch,64);
        engine.tracks[0].active_mut().add_note_raw(1,24,24,67,100);
        assert!(engine.clip_input_info().starts_with("ci1,0,mixed,"));
        engine.follower_input_context("fic1,0,2,0");
        assert!(engine.clip_input_info().starts_with("ci1,0,fixed,"));
        for note in &mut engine.tracks[0].active_mut().notes {note.rendered=true;}
        assert!(engine.clip_input_info().starts_with("ci1,0,rendered,"));
        engine.tracks[0].active_mut().notes[0].rendered=false;
        assert!(engine.clip_input_info().starts_with("ci1,0,mixed,"));
    }
}
