"""Capture private HB recording packets without changing host MIDI routing."""
from pathlib import Path
from patch_movy_stock_schwung_pages import replace_once


def patch_record_bridge(root: Path) -> None:
    """Intercept cable 3 only; preserve all other callback bytes and results."""
    path: Path = root / 'engine/crates/movy-dsp/src/chain_host.rs'
    source: str = path.read_text()
    anchor: str = 'static ORIGINALS: OnceLock<(Option<SendFn>, Option<SendFn>)> = OnceLock::new();'
    source = replace_once(source, anchor, anchor + '''
static ORIGINAL_INJECT: OnceLock<Option<SendFn>> = OnceLock::new();

unsafe extern "C" fn hb_record_inject(msg: *const u8, len: c_int) -> c_int {
    if !msg.is_null() && len == 4 {
        let packet = core::slice::from_raw_parts(msg, 4);
        let status = packet[1] & 0xf0;
        if packet[0] >> 4 == 3 && matches!(packet[0] & 15, 8 | 9)
            && matches!(status, 0x80 | 0x90) {
            return if crate::hb_record::QUEUE.push((packet[1] & 15) as usize,
                status, packet[2], packet[3]) { 4 } else { 0 };
        }
    }
    // Cable 2 Render To and all transport traffic retain the working host path.
    match ORIGINAL_INJECT.get().copied().flatten() {
        Some(send) => send(msg, len),
        None => 0,
    }
}
''', 'private recording callback')
    anchor = '    let _ = ORIGINALS.set((copy.midi_send_internal, copy.midi_send_external));'
    source = replace_once(source, anchor, anchor + '''
    let _ = ORIGINAL_INJECT.set(copy.midi_inject_to_move);
    copy.midi_inject_to_move = Some(hb_record_inject);''', 'install private recording callback')
    path.write_text(source)
