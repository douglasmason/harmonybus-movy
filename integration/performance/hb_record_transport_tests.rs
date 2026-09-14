#[cfg(test)]
mod hb_record_transport_tests {
    use super::*;

    fn linked() -> Engine {
        let mut engine = Engine::new(48000, 12000);
        engine.link_enabled = true;
        engine.move_inject_ok = true;
        engine
    }

    #[test]
    fn record_requests_move_start_and_waits_before_count_in() {
        let mut engine = linked();
        let mut output = Vec::new();
        engine.toggle_record(2);
        assert!(engine.pending_play && !engine.playing && !engine.recording);
        for _ in 0..32 { engine.advance_block(128, &mut output); }
        assert_eq!(engine.count_in_left, crate::TICKS_PER_BAR);
        assert_eq!(output.iter().filter(|event| matches!(event, OutEvent::MoveInject { val: 127 })).count(), 1);
        assert!(!output.iter().any(|event| matches!(event, OutEvent::Click { .. })));
        engine.on_external_realtime(0xFA, &mut output);
        assert!(engine.playing && !engine.pending_play && !engine.recording);
        assert_eq!(engine.rec_track, 2);
        for _ in 0..crate::TICKS_PER_BAR-1 { engine.service_tick(&mut output); }
        assert!(!engine.recording);
        engine.service_tick(&mut output);
        assert!(engine.recording);
        assert_eq!(output.iter().filter(|event| matches!(event, OutEvent::Click { .. })).count(), 4);
        assert_eq!(engine.move_toggle_queue, 0);
    }

    #[test]
    fn stop_cancels_linked_record_arm_and_second_record_cancels_capture() {
        let mut engine = linked();
        let mut output = Vec::new();
        engine.toggle_record(0);
        engine.request_stop(&mut output);
        assert!(!engine.pending_play && !engine.playing && !engine.recording);
        assert_eq!(engine.count_in_left, 0);
        let mut engine = linked();
        engine.toggle_record(0);
        engine.toggle_record(0);
        engine.on_external_realtime(0xFA, &mut output);
        assert!(engine.playing && !engine.recording);
        assert_eq!(engine.count_in_left, 0);
        let mut engine = linked();
        engine.toggle_record(0);
        engine.on_external_realtime(0xFC, &mut output);
        assert!(!engine.pending_play && !engine.recording);
        assert_eq!(engine.count_in_left, 0);
    }

    #[test]
    fn record_fallback_and_running_punch_in_do_not_toggle_move() {
        for (link, inject) in [(false, true), (true, false)] {
            let mut engine = linked();
            engine.link_enabled = link; engine.move_inject_ok = inject;
            engine.toggle_record(0);
            assert!(engine.playing && !engine.pending_play);
            assert_eq!(engine.count_in_left, crate::TICKS_PER_BAR);
            assert_eq!(engine.move_toggle_queue, 0);
        }
        let mut engine = linked();
        engine.play();
        engine.toggle_record(0);
        assert_eq!(engine.move_toggle_queue, 0);
        assert_eq!(engine.count_in_left, 0);
        let mut engine = linked();
        engine.toggle_record(0);
        engine.frame_now = engine.pending_play_deadline;
        engine.advance_block(1, &mut Vec::new());
        assert!(engine.playing && !engine.pending_play);
        assert!(engine.count_in_left > 0 && !engine.recording);
    }
}
