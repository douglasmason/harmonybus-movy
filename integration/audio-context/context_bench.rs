//! Test-only reference for the pre-269 context read/parser. Musical production
//! code remains in seq-core; this reference checks equivalence and counts work.
#![allow(dead_code)]
use seq_core::{engine::Engine, humanize::Humanize};
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::ffi::{CStr, CString};
use std::hint::black_box;
use std::time::Instant;

#[path = "../../src/hb_context.rs"]
pub mod hb_context;

thread_local! {
    static ALLOCATIONS: Cell<Option<usize>> = const { Cell::new(None) };
}
struct CountingAllocator;
fn allocation() {
    let _ = ALLOCATIONS.try_with(|count| {
        if let Some(value) = count.get() { count.set(Some(value + 1)); }
    });
}
unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 { allocation(); System.alloc(layout) }
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 { allocation(); System.alloc_zeroed(layout) }
    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        allocation(); System.realloc(pointer, layout, size)
    }
    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) { System.dealloc(pointer, layout) }
}
#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

pub fn measured(operation: impl FnOnce()) -> (u128, usize) {
    ALLOCATIONS.with(|count| count.set(Some(0)));
    let start = Instant::now();
    operation();
    let elapsed = start.elapsed().as_nanos();
    let allocations = ALLOCATIONS.with(|count| count.replace(None).unwrap());
    (elapsed, allocations)
}

/// Frozen pre-269 parser: keep its acceptance rules and allocation behavior.
pub fn legacy_humanize(text: &str, followers: u16) -> Humanize {
    let values: Vec<_> = text.split(',').collect();
    if values.len() != 5 || values[0] != "hu1" { return Humanize::default(); }
    let fields: Option<Vec<u32>> = values[1..].iter().map(|value| value.parse().ok()).collect();
    let Some(fields) = fields else { return Humanize::default(); };
    if fields[..3].iter().any(|value| *value > 30) || fields[3] > 65535 { return Humanize::default(); }
    Humanize { timing: fields[0], velocity: fields[1], gate: fields[2], tracks: fields[3] as u16, followers }
}

/// Frozen application loop, so comparisons include clip/key reconciliation.
pub fn legacy_apply(engine: &mut Engine, message: &str) {
    engine.shared_capture(message);
    let (input, humanize) = message.split_once('|').unwrap_or((message, ""));
    let context = seq_core::follower_input::parse(input);
    engine.humanize = legacy_humanize(humanize.split('|').next().unwrap_or(""), context.map_or(0, |(_, mask)| mask));
    for track in 0..engine.tracks.len() {
        let key = context.and_then(|(key, mask)| (mask & (1 << track) != 0 && !engine.track_is_drum(track)).then_some(key));
        engine.follower_inputs[track] = key;
        for clip in &mut engine.tracks[track].clips {
            if clip.input_key == key { continue; }
            clip.input_key = key;
            if let Some(key) = key {
                for note in &mut clip.notes {
                    if !note.rendered && note.input_key.is_none() { note.input_key = Some(key); engine.dirty = true; }
                }
            }
        }
    }
}

#[inline(never)]
pub fn mock_get(key: &CStr, buffer: &mut [u8], message: &str) -> i32 {
    if key.to_bytes() != b"midi_fx1:follower_input_context_v2" { return 0; }
    buffer[..message.len()].copy_from_slice(message.as_bytes());
    buffer[message.len()] = 0;
    message.len() as i32
}
pub fn legacy_read(buffer: &mut [u8], message: &str) -> String {
    let key = CString::new("midi_fx1:follower_input_context_v2").unwrap();
    let length = mock_get(black_box(&key), buffer, black_box(message));
    String::from_utf8_lossy(&buffer[..length as usize]).into_owned()
}
pub fn apply(engine: &mut Engine, buffer: &mut [u8], message: &str) {
    let length = hb_context::read(buffer, |key, output| mock_get(key, output, message));
    engine.follower_input_context(std::str::from_utf8(&buffer[..length]).unwrap());
}
pub fn humanize_values(value: Humanize) -> (u32, u32, u32, u16, u16) {
    (value.timing, value.velocity, value.gate, value.tracks, value.followers)
}
pub fn equivalent(actual: &Engine, expected: &Engine) {
    assert_eq!(humanize_values(actual.humanize), humanize_values(expected.humanize));
    assert_eq!(actual.follower_inputs, expected.follower_inputs);
    assert_eq!(seq_core::persist::serialize(actual), seq_core::persist::serialize(expected));
}
pub fn prepared() -> Engine {
    let mut engine = Engine::new(48000, 12000);
    for track in &mut engine.tracks {
        for clip in track.clips.iter_mut().take(8) {
            clip.set_loop(0, 16);
            clip.add_note_raw(0, 0, 24, 60, 100);
        }
    }
    engine
}

pub struct Measurement {
    pub changing: bool,
    pub iterations: usize,
    pub before_ns: u128,
    pub after_ns: u128,
    pub before_allocations: usize,
    pub after_allocations: usize,
}
pub fn benchmark(iterations: usize) -> Vec<Measurement> {
    let messages = ["fic1,0,1,65534|hu1,12,9,15,65535", "fic1,2,2,65534|hu1,30,20,30,65535"];
    let mut results = Vec::new();
    for changing in [false, true] {
        let mut before = prepared();
        let mut after = prepared();
        let mut old_buffer = vec![0u8; 128 * 1024];
        let mut buffer = [0u8; hb_context::CAPACITY];
        legacy_apply(&mut before, messages[0]);
        apply(&mut after, &mut buffer, messages[0]);
        let (before_ns, before_allocations) = measured(|| {
            for index in 0..iterations {
                let message = legacy_read(&mut old_buffer, messages[if changing { index % 2 } else { 0 }]);
                legacy_apply(black_box(&mut before), black_box(&message));
            }
        });
        let (after_ns, after_allocations) = measured(|| {
            for index in 0..iterations {
                apply(black_box(&mut after), &mut buffer, black_box(messages[if changing { index % 2 } else { 0 }]));
            }
        });
        equivalent(&after, &before);
        results.push(Measurement { changing, iterations, before_ns, after_ns, before_allocations, after_allocations });
    }
    results
}
