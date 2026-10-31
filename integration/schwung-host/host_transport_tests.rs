#[cfg(test)]
mod host_transport_tests {
    use super::*;
    use seq_core::engine::Engine;
    use std::cell::Cell;

    // Per-test-thread fake callbacks avoid mutating the process-global host.
    thread_local! {
        static STATUS: Cell<i32> = const { Cell::new(2) };
        static BEAT: Cell<f64> = const { Cell::new(9.5) };
        static BPM: Cell<f32> = const { Cell::new(120.0) };
        static READS: Cell<[usize; 3]> = const { Cell::new([0; 3]) };
    }
    fn count(index: usize) {
        READS.with(|reads| { let mut counts = reads.get(); counts[index] += 1; reads.set(counts); });
    }
    unsafe extern "C" fn status() -> i32 { count(0); STATUS.with(Cell::get) }
    unsafe extern "C" fn beat() -> f64 { count(1); BEAT.with(Cell::get) }
    unsafe extern "C" fn bpm() -> f32 { count(2); BPM.with(Cell::get) }
    fn fixture() -> host_api_v1_t {
        STATUS.set(2); BEAT.set(9.5); BPM.set(120.0); READS.set([0; 3]);
        // The actual ABI consists only of numbers, raw pointers and nullable
        // function pointers: zero is a valid missing-capability fixture.
        let mut api: host_api_v1_t = unsafe { core::mem::zeroed() };
        api.api_version = 1;
        api.sample_rate = 44100;
        api.frames_per_block = 128;
        api.get_clock_status = Some(status);
        api.get_beat_position = Some(beat);
        api.get_bpm = Some(bpm);
        api
    }

    #[test]
    fn optional_host_capabilities_and_unavailable_clock_do_not_consume_attachment() {
        let mut api = fixture();
        let mut engine = Engine::new(44100, 12000);
        let mut output = Vec::new();
        attach_transport_from(&mut engine, &mut output, None);
        api.get_bpm = None;
        attach_transport_from(&mut engine, &mut output, Some(&api));
        api.get_bpm = Some(bpm); api.get_beat_position = None;
        attach_transport_from(&mut engine, &mut output, Some(&api));
        api.get_beat_position = Some(beat); api.get_clock_status = None;
        attach_transport_from(&mut engine, &mut output, Some(&api));
        assert_eq!(READS.get(), [0; 3]);
        api.get_clock_status = Some(status);
        for unavailable in [0, -1, 3] {
            STATUS.set(unavailable);
            attach_transport_from(&mut engine, &mut output, Some(&api));
            assert!(!engine.host_transport_attached);
        }
        assert_eq!(READS.get(), [3, 0, 0]);
        STATUS.set(2);
        attach_transport_from(&mut engine, &mut output, Some(&api));
        assert!(engine.playing && engine.host_transport_attached);
        assert_eq!(engine.hb_master_tick(), 912);
        assert!(output.is_empty(), "attachment injects no transport commands or stale notes");
    }

    #[test]
    fn invalid_snapshots_retry_without_poisoning_phase_or_tempo() {
        let api = fixture();
        let mut engine = Engine::new(44100, 12000);
        let mut output = Vec::new();
        for invalid in [f64::NAN, f64::INFINITY, -1.0] {
            BEAT.set(invalid);
            attach_transport_from(&mut engine, &mut output, Some(&api));
            assert!(!engine.host_transport_attached);
        }
        BEAT.set(9.5);
        for invalid in [f32::NAN, f32::INFINITY, 0.0, 19.0, 301.0, 1000.0] {
            BPM.set(invalid);
            attach_transport_from(&mut engine, &mut output, Some(&api));
            assert!(!engine.host_transport_attached);
        }
        BPM.set(137.25);
        attach_transport_from(&mut engine, &mut output, Some(&api));
        assert!(engine.host_transport_attached && engine.playing);
        assert_eq!(engine.clock.bpm_x100(), 13725);
    }

    #[test]
    fn no_snapshot_calls_after_attachment_or_with_link_off_and_set_load_rearms() {
        let api = fixture();
        let mut engine = Engine::new(44100, 12000);
        let mut output = Vec::new();
        engine.link_enabled = false;
        for _ in 0..1000 { attach_transport_from(&mut engine, &mut output, Some(&api)); }
        assert_eq!(READS.get(), [0; 3]);
        engine.link_enabled = true;
        attach_transport_from(&mut engine, &mut output, Some(&api));
        for _ in 0..1000 { attach_transport_from(&mut engine, &mut output, Some(&api)); }
        assert_eq!(READS.get(), [1; 3]);
        engine.stop(&mut output);
        attach_transport_from(&mut engine, &mut output, Some(&api));
        assert!(!engine.playing, "snapshot cannot undo the user's stop");
        assert!(seq_core::persist::load(&mut engine, "movy1\n"));
        BEAT.set(12.5); BPM.set(90.0);
        attach_transport_from(&mut engine, &mut output, Some(&api));
        assert!(engine.playing);
        assert_eq!(engine.hb_master_tick(), 1200);
        assert_eq!(engine.clock.bpm_x100(), 9000);
        assert_eq!(READS.get(), [2; 3]);
    }

    #[test]
    fn stopped_snapshot_is_valid_and_does_not_inject_transport() {
        let api = fixture();
        STATUS.set(1); BEAT.set(0.0);
        let mut engine = Engine::new(44100, 12000);
        let mut output = Vec::new();
        attach_transport_from(&mut engine, &mut output, Some(&api));
        assert!(engine.host_transport_attached && !engine.playing);
        assert!(output.is_empty());
    }
}
