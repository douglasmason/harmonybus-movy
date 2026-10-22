from pathlib import Path
from patch_responsive_persistence import replace_once

def patch_stock_field(root: Path):
    assets = Path(__file__).resolve().parents[1] / 'integration/field-lfo'
    dsp = root / 'engine/crates/movy-dsp/src'
    (dsp / 'field_lfo.rs').write_text((assets / 'field_lfo.rs').read_text())
    p=dsp/'lib.rs';p.write_text(p.read_text().replace('mod click;', 'mod field_lfo;\nmod click;',1))
    p=dsp/'chain_host.rs';s=p.read_text()
    s=s.replace('    pub fn set_param(&mut self, key: &str, val: &str)', '    pub(crate) fn set_param_raw(&mut self, key: &str, val: &str)')
    s=s.replace('    pub fn get_param(&mut self, key: &str)', '    pub(crate) fn get_param_raw(&mut self, key: &str)')
    s=s.replace('    pub fn hb_set_param', '''    pub(crate) fn hb_get_small(&mut self,key:&CStr,buffer:&mut [u8])->i32 {
        self.api.get_param.map(|get|unsafe {get(self.inst,key.as_ptr(),buffer.as_mut_ptr() as *mut c_char,buffer.len() as c_int)}).unwrap_or(0)
    }
    pub fn hb_set_param''',1);p.write_text(s)
    p=dsp/'chain_slots.rs';s=p.read_text();s=replace_once(s,'for instance in self.slots.iter_mut().flatten() { instance.hb_set_param(key,message); }','for instance in self.slots.iter_mut().flatten() { instance.hb_field_block(message); }');
    s=s.replace('        let key = std::ffi::CStr::from_bytes_with_nul(b"midi_fx1:hb_movy_block\\0").unwrap();\n','');p.write_text(s)
