#[path = "support/context_bench.rs"]
mod context_bench;
use context_bench::*;
use seq_core::{engine::Engine, humanize::Humanize};

#[test]
fn steady_and_changing_contexts_allocate_nothing() {
    for result in benchmark(1000) {
        assert!(result.before_allocations >= result.iterations * 4, "reference includes native-key/string and parser allocations");
        assert_eq!(result.after_allocations, 0, "both stable and changing settings avoid temporary allocation");
    }
}

#[test]
fn parser_retains_legacy_bounds_and_malformed_input_behavior() {
    for timing in ["", "-1", "+1", "0", "30", "31", "4294967296", " 1", "x"] {
        for mask in ["", "0", "65535", "65536", "-1", "x"] {
            let message = format!("hu1,{timing},9,15,{mask}");
            assert_eq!(humanize_values(Humanize::parse(&message, 14)), humanize_values(legacy_humanize(&message, 14)));
        }
    }
    for message in ["", "hu1", "hu1,0", "hu1,1,2,3", "hu1,1,2,3,4,5", "hu2,1,2,3,4", "hu1,1,2,3,4|"] {
        assert_eq!(humanize_values(Humanize::parse(message, 14)), humanize_values(legacy_humanize(message, 14)));
    }
}

#[test]
fn edits_role_changes_restore_and_undo_still_reconcile_clips() {
    let mut actual = prepared();
    let mut expected = prepared();
    let mut buffer = [0u8; hb_context::CAPACITY];
    let message = "fic1,0,1,65534|hu1,12,9,15,65535";
    apply(&mut actual, &mut buffer, message); legacy_apply(&mut expected, message);
    for engine in [&mut actual, &mut expected] {
        engine.tracks[1].clips[0].input_key = None;
        engine.tracks[1].clips[0].notes[0].input_key = None;
    }
    apply(&mut actual, &mut buffer, message); legacy_apply(&mut expected, message); equivalent(&actual, &expected);
    assert!(actual.tracks[1].clips[0].input_key.is_some());
    for engine in [&mut actual, &mut expected] { engine.set_drum_output(1, true, &mut Vec::new()); }
    apply(&mut actual, &mut buffer, message); legacy_apply(&mut expected, message); equivalent(&actual, &expected);
    assert!(actual.follower_inputs[1].is_none());
    let saved = seq_core::persist::serialize(&actual);
    for engine in [&mut actual, &mut expected] { assert!(seq_core::persist::load(engine, &saved)); }
    apply(&mut actual, &mut buffer, message); legacy_apply(&mut expected, message); equivalent(&actual, &expected);
    for engine in [&mut actual, &mut expected] {
        seq_core::command::apply_batch(engine, "usnap 1", &mut Vec::new());
        engine.tracks[2].clips[0].clear();
        seq_core::command::apply_batch(engine, "uswap 1 2", &mut Vec::new());
    }
    apply(&mut actual, &mut buffer, message); legacy_apply(&mut expected, message); equivalent(&actual, &expected);
    for message in ["fic1,2,2,4|hu1,30,30,30,7", "fic1,11,19,65535", "fic1,0,1,0", "fic1,invalid", ""] {
        // Missing/invalid protocol produces an empty read, exactly as the old chain search.
        let accepted = if message.starts_with("fic1,") { message } else { "" };
        apply(&mut actual, &mut buffer, message); legacy_apply(&mut expected, accepted); equivalent(&actual, &expected);
    }
}

#[test]
fn matching_settings_never_suppress_repeated_recording_events() {
    let mut actual = Engine::new(48000, 12000);
    let mut expected = Engine::new(48000, 12000);
    for engine in [&mut actual, &mut expected] {
        engine.playing = true; engine.recording = true;
        engine.tracks[0].clips[0].set_loop(0, 16);
    }
    let mut buffer = [0u8; hb_context::CAPACITY];
    let prefix = "fic1,0,1,14|hu1,12,9,15,15";
    for (position, suffix) in [(0, "|sc1,0,1,1,2,0,0"), (24, "|sc1,0,1,1,2,0,0"),
                               (48, "|sc1,0,1,0,0,0,0"), (72, "")] {
        actual.tracks[0].pos_tick = position; expected.tracks[0].pos_tick = position;
        let message = format!("{prefix}{suffix}");
        apply(&mut actual, &mut buffer, &message); legacy_apply(&mut expected, &message); equivalent(&actual, &expected);
    }
    let events = &actual.tracks[0].clips[0].shared_events;
    assert_eq!(events.len(), 3);
    assert_eq!(events.iter().map(|event| event.tick).collect::<Vec<_>>(), [0, 24, 48]);
    assert!(!events[2].value.on);
}
