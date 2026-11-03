"""Remove owned strings from HarmonyBus feedback forwarding on the audio callback."""
from pathlib import Path
import re
import shutil


def replace_once(source: str, before: str, after: str) -> str:
    """Require the expected upstream seam and refuse silent partial patching."""
    count: int = source.count(before)
    if count != 1:
        raise RuntimeError(f"Parameter reply patch expected one seam, found {count}")
    return source.replace(before, after, 1)


def patch_param_replies(root: Path) -> None:
    """Reuse chain scratch and the caller buffer while preserving reply semantics."""
    assets: Path = Path(__file__).resolve().parents[1] / "integration/audio-context"
    map_source_to_destination: dict[str, str] = {
        "hb_param_reply.rs": "engine/crates/movy-dsp/src/hb_param_reply.rs",
        "param_reply_allocations.rs": "engine/crates/movy-dsp/tests/param_reply_allocations.rs",
    }
    source_name: str
    destination_name: str
    for source_name, destination_name in map_source_to_destination.items():
        shutil.copy2(assets / source_name, root / destination_name)

    chain_path: Path = root / "engine/crates/movy-dsp/src/chain_host.rs"
    chain_source: str = chain_path.read_text()
    chain_source = replace_once(chain_source,
        "    pub(crate) fn get_param_raw(&mut self, key: &str) -> Option<String> {",
        '''    /// Borrow the incoming key and reuse scratch for raw MIDI-FX reads.
    pub(crate) fn hb_param_into(&mut self, key: &CStr, output: &mut [u8]) -> i32 {
        let Some(get) = self.api.get_param else { return -1 };
        let instance = self.inst;
        crate::hb_param_reply::read(key, &mut self.scratch, output, |key, scratch| {
            unsafe { get(instance, key.as_ptr(), scratch.as_mut_ptr() as *mut c_char, scratch.len() as c_int) }
        })
    }

    pub(crate) fn get_param_raw(&mut self, key: &str) -> Option<String> {''')
    chain_path.write_text(chain_source)

    manager_path: Path = root / "engine/crates/movy-dsp/src/chain_slots.rs"
    manager_source: str = manager_path.read_text()
    manager_source = replace_once(manager_source,
        "    pub fn get_param(&mut self, slot: usize, key: &str) -> Option<String> {",
        '''    /// Only raw midi_fx1 keys enter here; mix and LFO aliases retain their dispatch.
    pub fn hb_param_into(&mut self, slot: usize, key: &std::ffi::CStr, output: &mut [u8]) -> i32 {
        let Some(Some(instance)) = self.slots.get_mut(slot) else { return -1 };
        instance.hb_param_into(key, output)
    }

    pub fn get_param(&mut self, slot: usize, key: &str) -> Option<String> {''')
    manager_path.write_text(manager_source)

    dsp_path: Path = root / "engine/crates/movy-dsp/src/lib.rs"
    dsp_source: str = dsp_path.read_text()
    dsp_source = replace_once(dsp_source, "mod chain_host;", "mod hb_param_reply;\nmod chain_host;")
    dsp_source = replace_once(dsp_source, "use std::ffi::{CStr, CString};", "use std::ffi::CStr;")
    dsp_source = replace_once(dsp_source,
        '''        let Some(i) = inst(instance) else { return -1 };
        let Some(value) = i.get_param(cstr(key)) else {
            return -1;
        };
        let Ok(c) = CString::new(value) else { return -1 };
        let bytes = c.as_bytes_with_nul();
        if buf.is_null() || (buf_len as usize) < bytes.len() {
            return -1;
        }
        unsafe {
            core::ptr::copy_nonoverlapping(bytes.as_ptr() as *const c_char, buf, bytes.len());
        }
        (bytes.len() - 1) as c_int''',
        '''        if buf.is_null() || buf_len <= 0 { return -1; }
        let Some(i) = inst(instance) else { return -1 };
        let output = unsafe { core::slice::from_raw_parts_mut(buf as *mut u8, buf_len as usize) };
        let key_text = cstr(key);
        if let Some((slot, rest)) = parse_chain_key(key_text) {
            if rest.starts_with("midi_fx1:") {
                // The original C string already terminates this suffix. Borrow
                // it instead of allocating another key and owned reply strings.
                let suffix = unsafe { CStr::from_ptr(key.add(key_text.len() - rest.len())) };
                return i.chains.hb_param_into(slot, suffix, output);
            }
        }
        let Some(value) = i.get_param(key_text) else { return -1 };
        hb_param_reply::copy_text_reply(&value, output)''')

    ui_path: Path = root / "src/seq/constants.ts"
    ui_source: str = ui_path.read_text()
    dsp_version: re.Match[str] | None = re.search(r'const ENGINE_VERSION: &str = "([^"]+)";', dsp_source)
    ui_version: re.Match[str] | None = re.search(r"export const ENGINE_VERSION = '([^']+)';", ui_source)
    if dsp_version is None or ui_version is None or dsp_version.group(1) != ui_version.group(1):
        raise RuntimeError("Native/UI engine version diverged before parameter reply update")
    version: str = "0.100.0-param-replies1"
    dsp_path.write_text(dsp_source.replace(dsp_version.group(0), f'const ENGINE_VERSION: &str = "{version}";'))
    ui_path.write_text(ui_source.replace(ui_version.group(0), f"export const ENGINE_VERSION = '{version}';"))
