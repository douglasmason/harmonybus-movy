//! Chord service reads using the existing fixed-buffer chain API.
use std::ffi::CStr;

#[derive(Debug, PartialEq, Eq)]
pub enum Event { None, Off, Pitch(u8) }

/// Native replies are `--`, `off`, or a MIDI pitch (at most three digits).
/// Never retry a truncated/invalid read: the native getter consumes an event.
pub fn read(mut get: impl FnMut(&CStr, &mut [u8]) -> i32) -> Event {
    let key = CStr::from_bytes_with_nul(b"midi_fx1:hb_chord_queue_take\0").unwrap();
    let mut buffer = [0u8; 8];
    let length = get(key, &mut buffer);
    if length <= 0 || length as usize >= buffer.len() { return Event::None; }
    let Ok(text) = std::str::from_utf8(&buffer[..length as usize]) else { return Event::None; };
    if text == "off" { return Event::Off; }
    match text.parse::<u8>() {
        Ok(pitch) if pitch < 128 => Event::Pitch(pitch),
        _ => Event::None,
    }
}

/// Read the live-selection flag on every block without allocating strings.
/// Only an exact `0` expires the host recording gate; an unavailable or invalid
/// reply must not release a held chord. This is independent of queue cue reads.
pub fn selection_active(mut get: impl FnMut(&CStr, &mut [u8]) -> i32) -> Option<bool> {
    let key = CStr::from_bytes_with_nul(b"midi_fx1:hb_chord_active\0").unwrap();
    let mut buffer = [0u8; 2];
    if get(key, &mut buffer) != 1 { return None; }
    match buffer[0] {
        b'0' => Some(false),
        b'1' => Some(true),
        _ => None,
    }
}
