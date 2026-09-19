#[cfg(test)]
mod hb_running_transport_tests {
    use super::*;

    #[test]
    fn opening_mid_song_adopts_native_position_without_transport_injection() {
        for (numerator, denominator) in [(1, 1), (2, 1), (1, 2), (3, 2)] {
            let mut engine = Engine::new(48000,12000);
            engine.tracks[0].active_mut().ensure_exists();
            engine.tracks[0].active_mut().scale_num = numerator;
            engine.tracks[0].active_mut().scale_den = denominator;
            let mut output = Vec::new();
            engine.attach_host_transport(true, 9.5, 120.0, &mut output);
            assert!(engine.playing);
            assert_eq!(engine.master_tick, 912);
            let clip = engine.tracks[0].active();
            assert_eq!(engine.tracks[0].pos_tick,
                clip.loop_start_ticks() + (912 * numerator as u32 / denominator as u32) % clip.length_ticks());
            assert!(output.is_empty());
            engine.on_external_realtime(0xF8, &mut output);
            engine.advance_block(64, &mut output);
            assert!(engine.master_tick >= 912 && engine.master_tick <= 920);
            assert!(!output.iter().any(|event| matches!(event, OutEvent::Start | OutEvent::Stop | OutEvent::MoveInject { .. })));
            engine.stop(&mut output);
            engine.attach_host_transport(true, 10.0, 120.0, &mut output);
            assert!(!engine.playing, "a snapshot must not undo a user's stop");
        }
    }

    #[test]
    fn stopped_unlinked_and_invalid_snapshots_do_not_start() {
        let mut engine = Engine::new(48000,12000);
        let mut output = Vec::new();
        engine.attach_host_transport(true, f64::NAN, 120.0, &mut output);
        assert!(!engine.playing && !engine.host_transport_attached);
        engine.link_enabled = false;
        engine.attach_host_transport(true, 5.0, 120.0, &mut output);
        assert!(!engine.playing);
        engine.link_enabled = true;
        engine.attach_host_transport(false, 0.0, 120.0, &mut output);
        assert!(!engine.playing);
    }

    #[test]
    fn reloading_a_set_rearms_native_transport_adoption() {
        let mut engine = Engine::new(48000,12000);
        let mut output = Vec::new();
        engine.attach_host_transport(true, 8.0, 120.0, &mut output);
        assert!(crate::persist::load(&mut engine, "movy1\n"));
        assert!(!engine.host_transport_attached);
        engine.attach_host_transport(true, 12.5, 120.0, &mut output);
        assert!(engine.playing);
        assert_eq!(engine.master_tick, 1200);
    }
}
