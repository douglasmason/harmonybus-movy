
#[cfg(test)]
mod hb_render_bridge_tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    static RECEIVED: AtomicU32 = AtomicU32::new(0);
    static INJECTED: AtomicU32 = AtomicU32::new(0);

    // Schwung's overtake_midi_send_internal rejects len < 4 and reads status
    // at msg[1]. Exercise the production bridge against that host contract.
    unsafe extern "C" fn receive(msg: *const u8, len: c_int) -> c_int {
        if msg.is_null() || len < 4 { return 0; }
        let packet = core::slice::from_raw_parts(msg, 4);
        RECEIVED.store(u32::from_le_bytes(packet.try_into().unwrap()), Ordering::SeqCst);
        len
    }
    unsafe extern "C" fn inject(msg: *const u8, len: c_int) -> c_int {
        if msg.is_null() || len != 4 { return 0; }
        let packet = core::slice::from_raw_parts(msg, 4);
        INJECTED.store(u32::from_le_bytes(packet.try_into().unwrap()), Ordering::SeqCst);
        len
    }
    #[test]
    fn hb_render_bridge_usb_packets() {
        assert!(ORIGINALS.set((Some(receive), None)).is_ok());
        assert!(ORIGINAL_INJECT.set(Some(inject)).is_ok());
        for channel in 0..16u8 {
            for (cin, status, velocity) in [(9, 0x90, 100), (8, 0x80, 0)] {
                let packet = [0x20 | cin, status | channel, 64, velocity];
                assert_eq!(unsafe { shim_inject_to_move(packet.as_ptr(), 4) }, 4);
                assert_eq!(RECEIVED.load(Ordering::SeqCst).to_le_bytes(),
                    [cin, status | channel, 64, velocity]);
            }
        }
        let before = RECEIVED.load(Ordering::SeqCst);
        let record = [0x39, 0x92, 67, 90];
        assert_eq!(unsafe { shim_inject_to_move(record.as_ptr(), 4) }, 4);
        assert_eq!(RECEIVED.load(Ordering::SeqCst), before);
        let transport = [0x0B, 0xB0, 85, 127];
        assert_eq!(unsafe { shim_inject_to_move(transport.as_ptr(), 4) }, 4);
        assert_eq!(INJECTED.load(Ordering::SeqCst).to_le_bytes(), transport);
    }
}
