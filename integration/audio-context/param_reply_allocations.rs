//! Compare the borrowed bridge with the frozen pre-317 owned-string path.
#[path = "../src/hb_param_reply.rs"]
mod hb_param_reply;
#[path = "support/context_bench.rs"]
mod context_bench;
use std::ffi::{CStr, CString};
use std::hint::black_box;

const CAPACITY: usize = 128 * 1024;
const KEY: &CStr = c"midi_fx1:hb_chord_queue_status";

#[inline(never)]
fn native(key: &CStr, scratch: &mut [u8], source: &[u8], length: i32) -> i32 {
    assert_eq!(key, KEY);
    scratch[..source.len()].copy_from_slice(source);
    length
}

fn legacy(scratch: &mut [u8], output: &mut [u8], source: &[u8], length: i32) -> i32 {
    let key = CString::new(KEY.to_bytes()).unwrap();
    let length = native(&key, scratch, source, length);
    if length <= 0 || length as usize >= scratch.len() { return -1; }
    let value = String::from_utf8_lossy(&scratch[..length as usize]).into_owned();
    let Ok(value) = CString::new(value) else { return -1; };
    let bytes = value.as_bytes_with_nul();
    if output.len() < bytes.len() { return -1; }
    output[..bytes.len()].copy_from_slice(bytes);
    (bytes.len() - 1) as i32
}

fn borrowed(scratch: &mut [u8], output: &mut [u8], source: &[u8], length: i32) -> i32 {
    hb_param_reply::read(KEY, scratch, output, |key, buffer| {
        assert_eq!(key.as_ptr(), KEY.as_ptr());
        native(key, buffer, source, length)
    })
}

fn equivalent(source: &[u8], length: i32, capacity: usize) {
    let mut scratch = [0x55; 256];
    let mut before = [0xa5; 512];
    let mut after = before;
    let expected = legacy(&mut scratch, &mut before[1..capacity + 1], source, length);
    let actual = borrowed(&mut scratch, &mut after[1..capacity + 1], source, length);
    assert_eq!(actual, expected, "source={source:?}, capacity={capacity}");
    assert_eq!(after, before, "source={source:?}, capacity={capacity}");
    assert_eq!(after[0], 0xa5);
    assert_eq!(after[capacity + 1], 0xa5);
    if actual < 0 { assert!(after.iter().all(|byte| *byte == 0xa5)); }
}

#[test]
fn reply_contract_matches_owned_path() {
    for source in [b"--".as_slice(), b"cq1|3|4.000|C|G|0|0|0|0|0|4|C|G|F|D",
        b"cq2|65|0|C|G|0|0|0|0|0|66|0|32|C|G|F|D", "C♯ minor".as_bytes(),
        b"a\0b", b"\xff\xe2\x82X\xf0\x90\x80", b"", b"\xf4\x8f\xbf\xbf"] {
        for capacity in [0, 1, 2, source.len(), source.len() + 1, 128] {
            equivalent(source, source.len() as i32, capacity);
        }
    }
    for length in [-1, 0, 256, 257, i32::MAX] { equivalent(b"x", length, 128); }
    // All two-byte combinations include malformed and truncated UTF-8.
    for first in 0..=255u8 {
        for second in 0..=255u8 { equivalent(&[first, second], 2, 16); }
    }
    let mut empty = [0xa5; 1];
    assert_eq!(hb_param_reply::copy_reply(b"", &mut empty), 0);
    assert_eq!(empty, [0]);
}

#[test]
fn reads_once_at_original_capacity_and_never_returns_stale_data() {
    let mut scratch = vec![0; CAPACITY];
    let mut output = [0xa5; 64];
    for source in [b"a long first reply".as_slice(), b"x", b"\xff", b"--"] {
        let mut calls = 0;
        let length = hb_param_reply::read(KEY, &mut scratch, &mut output, |key, buffer| {
            calls += 1;
            assert_eq!(buffer.len(), CAPACITY);
            native(key, buffer, source, source.len() as i32)
        });
        assert_eq!(calls, 1);
        let expected = String::from_utf8_lossy(source);
        assert_eq!(&output[..length as usize], expected.as_bytes());
        assert_eq!(output[length as usize], 0);
    }
    for capacity in [0, 1, 2] {
        let mut calls = 0;
        assert_eq!(hb_param_reply::read(KEY, &mut scratch, &mut output[..capacity], |_, buffer| {
            calls += 1;
            buffer[..4].copy_from_slice(b"cq1|");
            4
        }), -1);
        assert_eq!(calls, 1, "do not retry a consuming getter");
    }
    let source = vec![b'x'; CAPACITY - 1];
    let mut large_output = vec![0xa5; CAPACITY];
    assert_eq!(borrowed(&mut scratch, &mut large_output, &source, source.len() as i32), (CAPACITY - 1) as i32);
    assert_eq!(&large_output[..CAPACITY - 1], source);
    assert_eq!(large_output[CAPACITY - 1], 0);
}

#[test]
fn borrowed_forwarding_allocates_nothing_including_errors() {
    let mut scratch = vec![0; CAPACITY];
    let mut output = vec![0; CAPACITY];
    let long = vec![b'x'; CAPACITY - 1];
    for source in [b"cq1|3|4.000|C|G|0|0|0|0|0|4|C|G|F|D".as_slice(),
        b"cq2|65|0|C|G|0|0|0|0|0|66|0|32|C|G|F|D", b"\xff\xe2\x82", b"a\0b", &long] {
        for capacity in [0, 1, CAPACITY] {
            let (_, allocations) = context_bench::measured(|| {
                for _ in 0..100 {
                    black_box(borrowed(&mut scratch, &mut output[..capacity], source, source.len() as i32));
                }
            });
            assert_eq!(allocations, 0);
        }
    }
    let (_, allocations) = context_bench::measured(|| {
        for _ in 0..100 { black_box(legacy(&mut scratch, &mut output, b"cq1|3|C|G", 9)); }
    });
    assert!(allocations >= 200, "reference must exercise owned keys and replies");
}

#[test]
#[ignore = "runner-only timing; allocation counts are covered in normal tests"]
fn param_reply_benchmark() {
    let mut scratch = vec![0; CAPACITY];
    let mut output = vec![0; CAPACITY];
    let short = b"cq1|3|4.000|C|G|0|0|0|0|0|4|C|G|F|D".to_vec();
    let long = b"0,60,1,0,0,1,12,0,0;".repeat(64);
    for (name, source) in [("queue", short), ("pad64", long)] {
        let iterations = 100_000;
        let (before_ns, before_allocations) = context_bench::measured(|| {
            for _ in 0..iterations {
                black_box(legacy(black_box(&mut scratch), black_box(&mut output), black_box(&source), source.len() as i32));
            }
        });
        let (after_ns, after_allocations) = context_bench::measured(|| {
            for _ in 0..iterations {
                black_box(borrowed(black_box(&mut scratch), black_box(&mut output), black_box(&source), source.len() as i32));
            }
        });
        assert_eq!(after_allocations, 0);
        println!("{name}: {iterations} reads, bridge allocations {before_allocations} -> {after_allocations}; ns/read {:.1} -> {:.1} (desktop mock getter, not device audio)", before_ns as f64 / iterations as f64, after_ns as f64 / iterations as f64);
    }
}
