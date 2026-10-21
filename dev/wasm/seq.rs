//! Thin ABI around the production sequencer; no scheduling or musical rules here.
use seq_core::{command::apply_batch, engine::{Engine, OutEvent}};
use std::cell::RefCell;
thread_local! {
    static ENGINE: RefCell<Engine> = RefCell::new(Engine::new(44100, 12000));
    static EVENTS: RefCell<Vec<OutEvent>> = const { RefCell::new(Vec::new()) };
    static INPUT: RefCell<[u8; 4096]> = const { RefCell::new([0; 4096]) };
}
#[no_mangle]
pub extern "C" fn input_ptr() -> *mut u8 { INPUT.with(|input| input.borrow_mut().as_mut_ptr()) }
#[no_mangle]
pub extern "C" fn command(length: usize) -> i32 {
    if length > 4096 { return -1; }
    INPUT.with(|input| {
        let input = input.borrow();
        let Ok(text) = std::str::from_utf8(&input[..length]) else { return -1; };
        ENGINE.with(|engine| EVENTS.with(|events| {
            let mut events = events.borrow_mut(); events.clear();
            apply_batch(&mut engine.borrow_mut(), text, &mut events);
        }));
        0
    })
}
#[no_mangle]
pub extern "C" fn advance(frames: u32) -> i32 {
    if frames > 44100 { return -1; }
    ENGINE.with(|engine| EVENTS.with(|events| {
        let mut events = events.borrow_mut(); events.clear();
        engine.borrow_mut().advance_block(frames, &mut events);
    })); 0
}
#[no_mangle]
pub extern "C" fn event_count() -> usize { EVENTS.with(|events| events.borrow().len()) }
// Zero marks a non-note event. The feasibility UI does not claim to route operations.
#[no_mangle]
pub extern "C" fn event(index: usize) -> u32 {
    EVENTS.with(|events| match events.borrow().get(index) {
        Some(OutEvent::NoteOn {track,pitch,vel}) => ((*track as u32)<<24) | (144<<16) | ((*pitch as u32)<<8) | *vel as u32,
        Some(OutEvent::NoteOff {track,pitch}) => ((*track as u32)<<24) | (128<<16) | ((*pitch as u32)<<8),
        _ => 0,
    })
}
pub fn apply_text(text: &str) {
    assert!(text.len() <= 4096);
    INPUT.with(|input| input.borrow_mut()[..text.len()].copy_from_slice(text.as_bytes()));
    assert_eq!(command(text.len()), 0);
}
