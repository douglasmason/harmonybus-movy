#[path = "../src/hb_queue_read.rs"]
mod queue_read;
#[path = "support/context_bench.rs"]
mod context_bench;
use queue_read::Event;

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
