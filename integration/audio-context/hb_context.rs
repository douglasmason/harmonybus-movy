//! Borrowed context reads: v2 also drains queued recording events, so every
//! requested read must reach HB even when its settings prefix is unchanged.
use std::ffi::CStr;

// HB has a 64-event queue, serializes each event in a 128-byte local buffer,
// and precedes it with fic1/hu1 headers. This holds the entire bounded queue.
pub const CAPACITY: usize = 128 + 64 * 128;

/// Read the current protocol, falling back to the legacy context when absent.
/// Returns a validated byte count; the caller borrows its own reusable buffer.
pub fn read(buffer: &mut [u8], mut get: impl FnMut(&CStr, &mut [u8]) -> i32) -> usize {
    for key in [b"midi_fx1:follower_input_context_v2\0".as_slice(),
                b"midi_fx1:follower_input_context\0".as_slice()] {
        let length = get(CStr::from_bytes_with_nul(key).unwrap(), buffer);
        if length > 0 && (length as usize) < buffer.len() {
            let length = length as usize;
            if std::str::from_utf8(&buffer[..length]).is_ok_and(|text| text.starts_with("fic1,")) {
                return length;
            }
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_context_is_read_again_even_when_settings_match() {
        let mut buffer = [0u8; CAPACITY];
        for suffix in ["", "|sc1,0,1,1,2,0,0", "|sc1,0,1,0,0,0,0", ""] {
            let message = format!("fic1,0,1,14|hu1,0,0,0,15{suffix}");
            let mut calls = 0;
            let length = read(&mut buffer, |key, output| {
                calls += 1;
                assert_eq!(key.to_bytes(), b"midi_fx1:follower_input_context_v2");
                output[..message.len()].copy_from_slice(message.as_bytes());
                message.len() as i32
            });
            assert_eq!(calls, 1);
            assert_eq!(&buffer[..length], message.as_bytes());
        }
    }

    #[test]
    fn full_native_queue_fits_without_splitting_or_losing_events() {
        let message = "fic1,11,19,65535|hu1,30,30,30,65535".to_owned()
            + &"|sc1,15,2,1,19,-2147483648,2147483647".repeat(64);
        assert!(message.len() < CAPACITY);
        let mut buffer = [0u8; CAPACITY];
        let length = read(&mut buffer, |_, output| {
            output[..message.len()].copy_from_slice(message.as_bytes());
            message.len() as i32
        });
        assert_eq!(length, message.len());
        assert_eq!(std::str::from_utf8(&buffer[..length]).unwrap().matches("|sc1,").count(), 64);
    }

    #[test]
    fn missing_invalid_and_truncated_v2_fall_back_without_stale_bytes() {
        let mut buffer = [0u8; CAPACITY];
        let legacy = b"fic1,2,2,14";
        for invalid in [-1, 0, CAPACITY as i32, CAPACITY as i32 + 1, 6] {
            let mut calls = 0;
            let length = read(&mut buffer, |key, output| {
                calls += 1;
                if key.to_bytes().ends_with(b"_v2") {
                    output[..6].copy_from_slice(b"fic1,\xff");
                    invalid
                } else {
                    output[..legacy.len()].copy_from_slice(legacy);
                    legacy.len() as i32
                }
            });
            assert_eq!(calls, 2);
            assert_eq!(&buffer[..length], legacy);
        }
        assert_eq!(read(&mut buffer, |_, _| 0), 0);
        assert_eq!(read(&mut buffer, |_, output| {
            output[..2].copy_from_slice(b"--"); 2
        }), 0);
    }
}
