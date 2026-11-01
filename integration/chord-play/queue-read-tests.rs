#[path = "../src/hb_queue_read.rs"]
mod queue_read;
#[path = "support/context_bench.rs"]
mod context_bench;
use queue_read::Event;
use std::ffi::{CStr, CString};

fn active_get(key: &CStr, buffer: &mut [u8], message: &[u8]) -> i32 {
    assert_eq!(key.to_bytes(), b"midi_fx1:hb_chord_active");
    let copied = message.len().min(buffer.len().saturating_sub(1));
    buffer[..copied].copy_from_slice(&message[..copied]);
    buffer[copied] = 0;
    message.len() as i32
}

fn active_reply(message: &[u8]) -> Option<bool> {
    let mut calls = 0;
    let active = queue_read::selection_active(|key, buffer| {
        calls += 1;
        active_get(key, buffer, message)
    });
    assert_eq!(calls, 1, "the per-block check must remain one fresh read");
    active
}

/// Frozen owned-key/response path from ChainInstance::get_param_raw and the
/// old expiry condition. The mock supplies native replies, not device audio.
fn legacy_expired(message: &[u8]) -> bool {
    let key = CString::new("midi_fx1:hb_chord_active").unwrap();
    let mut buffer = [0u8; 128];
    let length = active_get(std::hint::black_box(&key), &mut buffer, message);
    if length <= 0 || length as usize >= buffer.len() { return false; }
    let length = length as usize;
    let text = String::from_utf8_lossy(&buffer[..length]).into_owned();
    std::hint::black_box(text) == "0"
}

fn reply(message: &[u8]) -> Event {
    let mut calls = 0;
    let event = queue_read::read(|key, buffer| {
        calls += 1;
        assert_eq!(key.to_bytes(), b"midi_fx1:hb_chord_queue_take");
        let copied = message.len().min(buffer.len());
        buffer[..copied].copy_from_slice(&message[..copied]);
        message.len() as i32
    });
    assert_eq!(calls, 1, "consumptive reads must never be retried");
    event
}

#[test]
fn every_pitch_and_repeated_events_survive_without_caching() {
    for pitch in 0..128u8 {
        let message = pitch.to_string();
        for _ in 0..3 { assert_eq!(reply(message.as_bytes()), Event::Pitch(pitch)); }
    }
    for message in [b"".as_slice(), b"--", b"128", b"255", b"256", b"-1", b"1x", b" 1", b"\xff", b"60\0", b"12345678", b"123456789"] {
        assert_eq!(reply(message), Event::None);
    }
    assert_eq!(reply(b"off"), Event::Off);
    assert_eq!(reply(b"+60"), Event::Pitch(60));
    assert_eq!(queue_read::read(|_, _| -1), Event::None);
}

#[test]
fn idle_activation_and_off_reads_allocate_nothing() {
    // Count the actual production reader, including its key, buffer and parsing.
    let (_, allocations) = context_bench::measured(|| {
        for _ in 0..10_000 {
            for (message, expected) in [("--", Event::None), ("60", Event::Pitch(60)), ("127", Event::Pitch(127)), ("off", Event::Off)] {
                assert_eq!(reply(std::hint::black_box(message.as_bytes())), expected);
            }
        }
    });
    assert_eq!(allocations, 0);
}

#[test]
fn selection_expiry_accepts_only_exact_inactive_and_keeps_reading() {
    assert_eq!(active_reply(b"0"), Some(false));
    assert_eq!(active_reply(b"1"), Some(true));
    for message in [b"".as_slice(), b"--", b"off", b"2", b"00", b"01", b"0\0", b" 0", b"0 ", b"\xff", b"123456789"] {
        assert_eq!(active_reply(message), None);
        assert_eq!(active_reply(message) == Some(false), legacy_expired(message));
    }
    for length in [-1, 0, 2, 100] {
        assert_eq!(queue_read::selection_active(|_, buffer| { buffer[0] = b'0'; length }), None);
    }
    // Same-pitch reactivation and successive expiry observations must never
    // be hidden by a remembered flag, including after pause/restart.
    for message in [b"1", b"1", b"0", b"0", b"1", b"0"] {
        assert_eq!(active_reply(message) == Some(false), legacy_expired(message));
    }
}

#[test]
fn selection_checks_remove_owned_key_and_response_allocations() {
    let (_, before) = context_bench::measured(|| {
        for _ in 0..20_000 {
            for message in [b"1", b"0"] {
                assert_eq!(legacy_expired(std::hint::black_box(message)), message == b"0");
            }
        }
    });
    let (_, after) = context_bench::measured(|| {
        for _ in 0..20_000 {
            for message in [b"1", b"0"] {
                assert_eq!(active_reply(std::hint::black_box(message)), Some(message == b"1"));
            }
        }
    });
    assert_eq!(before, 80_000, "one owned key and one response per legacy read");
    assert_eq!(after, 0, "the production flag reader must never allocate");
}
