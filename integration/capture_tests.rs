#[cfg(test)]
mod hb_capture_tests {
    use super::*;

    fn play_phrase(engine: &mut Engine, running: bool, rendered: bool) {
        if running { engine.play(); }
        let mut output = Vec::new();
        for _ in 0..8 {
            for pitch in [60, 64, 67] {
                if rendered { engine.live_rendered_note_on(0, pitch, 100); }
                else { engine.live_note_on(0, pitch, 100); }
            }
            engine.advance_block(5512, &mut output);
            for pitch in [60, 64, 67] { engine.live_note_off(0, pitch); }
            engine.advance_block(5513, &mut output);
        }
    }

    fn assert_rendered_take(engine: &Engine) {
        let notes = &engine.tracks[0].active().notes;
        assert_eq!(notes.len(), 24);
        assert!(notes.iter().all(|note| note.rendered),
            "Capture must not send generated voices back through chord/arp generation");
        assert!(notes.iter().all(|note| note.input_key.is_none() && note.actions.is_none()));
        assert!(notes.iter().all(|note| note.gate > 1 && note.vel == 100));
        assert_eq!(notes.iter().map(|note| note.pitch).collect::<Vec<_>>(),
            [60, 64, 67].repeat(8));
    }

    #[test]
    fn captured_chords_keep_rendered_identity_stopped_running_and_after_reload() {
        for running in [false, true] {
            let mut engine = Engine::new(44100, 12000);
            engine.link_enabled = false;
            play_phrase(&mut engine, running, true);
            assert!(engine.capture_commit(0));
            assert_rendered_take(&engine);
            let saved = crate::persist::serialize(&engine);
            assert!(crate::persist::load(&mut engine, &saved));
            assert_rendered_take(&engine);
            engine.play();
            let mut output = Vec::new();
            engine.advance_block(44100, &mut output);
            assert!(output.iter().any(|event| matches!(event, OutEvent::RenderedOn {track:0,..})));
            assert!(!output.iter().any(|event| matches!(event, OutEvent::NoteOn {track:0,..})));
        }
    }

    #[test]
    fn capture_tempo_selection_keeps_generated_voices_rendered() {
        let mut engine = Engine::new(44100, 12000);
        engine.link_enabled = false;
        play_phrase(&mut engine, false, true);
        assert!(engine.capture_commit(0));
        let candidates = engine.cap_guess.as_ref().unwrap().n;
        assert!(candidates > 1);
        for candidate in 0..candidates {
            engine.capture_select(candidate);
            assert_rendered_take(&engine);
        }
    }

    #[test]
    fn capture_raw_follower_notes_keep_their_original_input_key() {
        for running in [false, true] {
            let mut engine = Engine::new(44100, 12000);
            engine.link_enabled = false;
            engine.follower_input_context("fic1,0,1,1");
            play_phrase(&mut engine, running, false);
            engine.follower_input_context("fic1,2,2,1");
            assert!(engine.capture_commit(0));
            let notes = &engine.tracks[0].active().notes;
            assert_eq!(notes.len(), 24);
            assert!(notes.iter().all(|note| !note.rendered));
            assert!(notes.iter().all(|note| note.input_key == crate::follower_input::InputKey::new(0,1)));
        }
    }
}
