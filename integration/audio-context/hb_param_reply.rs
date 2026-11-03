//! Copy parameter replies through existing buffers without temporary strings.
use std::ffi::CStr;

/// Match the existing lossy UTF-8 conversion and CString rejection of embedded
/// NULs. Validate the whole reply before writing, so errors leave output intact.
pub fn copy_reply(source: &[u8], output: &mut [u8]) -> i32 {
    if source.contains(&0) { return -1; }
    let required: usize = source.utf8_chunks().map(|chunk| {
        chunk.valid().len() + if chunk.invalid().is_empty() { 0 } else { 3 }
    }).sum();
    if required >= output.len() || required > i32::MAX as usize { return -1; }
    let mut offset = 0;
    for chunk in source.utf8_chunks() {
        let valid = chunk.valid().as_bytes();
        output[offset..offset + valid.len()].copy_from_slice(valid);
        offset += valid.len();
        if !chunk.invalid().is_empty() {
            output[offset..offset + 3].copy_from_slice("\u{fffd}".as_bytes());
            offset += 3;
        }
    }
    output[offset] = 0;
    required as i32
}

/// Use the chain's original 128-KiB scratch capacity, even when the caller's
/// output is smaller. Read exactly once: some native getters consume events.
/// Native getter work is outside this bridge's zero-allocation guarantee.
pub fn read(
    key: &CStr,
    scratch: &mut [u8],
    output: &mut [u8],
    mut get: impl FnMut(&CStr, &mut [u8]) -> i32,
) -> i32 {
    let length = get(key, scratch);
    if length <= 0 || length as usize >= scratch.len() { return -1; }
    copy_reply(&scratch[..length as usize], output)
}
