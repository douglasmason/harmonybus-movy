//! Bounded observations of existing modulation owners. Readers never advance them.
pub const POSITION_MAX:u16=16383;
#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]
pub struct Inputs {pub local:[[Option<u16>;2];16],pub field:[Option<u16>;16]}
impl Inputs {
    pub fn position(&self,actor:usize,driver:u8)->Option<u16> {
        match driver {1..=2=>self.local.get(actor)?[usize::from(driver-1)],3..=18=>self.field[usize::from(driver-3)],_=>None}
    }
}
pub fn normalize(value:f64)->Option<u16> {
    value.is_finite().then(||(value.clamp(0.0,1.0)*f64::from(POSITION_MAX)).round() as u16)
}
pub fn tick(clip:&crate::clip::Clip,position:u16)->f64 {
    f64::from(clip.loop_start_ticks())+f64::from(clip.length_ticks().saturating_sub(crate::TICKS_PER_STEP))*f64::from(position)/f64::from(POSITION_MAX)
}

/// Reject missing/invalid observations instead of retaining a stale position.
pub fn parse_local(text: &str) -> Option<[u16; 2]> {
    let mut fields = text.split(',');
    if fields.next()? != "sp1" { return None; }
    let mut result = [0; 2];
    for value in &mut result {
        let input = fields.next()?.parse::<f64>().ok()?;
        if !(0.0..=1.0).contains(&input) { return None; }
        *value = normalize(input)?;
    }
    fields.next().is_none().then_some(result)
}

/// Read effective Field outputs, including the shared pad/latch overrides.
pub fn parse_field(text: &str) -> Option<[u16; 16]> {
    let mut fields = text.split(',');
    if fields.next()? != "fo2" { return None; }
    for maximum in [1, 1, 3] {
        if fields.next()?.parse::<u32>().ok()? > maximum { return None; }
    }
    let mut result = [0; 16];
    for value in &mut result {
        let raw = fields.next()?.parse::<u32>().ok()?;
        let effective = fields.next()?.parse::<u32>().ok()?;
        let target = fields.next()?.parse::<u32>().ok()?;
        if raw > 10000 || effective > 10000 || target > 3 { return None; }
        *value = normalize(f64::from(effective) / 10000.0)?;
    }
    // Latch mode, latched channels and two blocked-output masks.
    for maximum in [1, 65535, u32::MAX, u32::MAX] {
        if fields.next()?.parse::<u32>().ok()? > maximum { return None; }
    }
    fields.next().is_none().then_some(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn observations_are_bounded_complete_and_use_effective_outputs() {
        assert_eq!(parse_local("sp1,0,1"), Some([0, POSITION_MAX]));
        assert_eq!(parse_local("sp1,0.5,0.25"), Some([8192, 4096]));
        for invalid in ["sp1,NaN,1", "sp1,0,", "sp1,0,1,0", "sp1,-0.1,1", "sp1,0,1.1"] {
            assert_eq!(parse_local(invalid), None);
        }
        let snapshot = format!("fo2,1,0,3{},0,65535,0,0", ",2000,7500,0".repeat(16));
        assert_eq!(parse_field(&snapshot), Some([12287; 16]));
        assert_eq!(parse_field(&snapshot.replace(",7500,", ",10001,")), None);
        assert_eq!(parse_field(&snapshot[..snapshot.len()-2]), None);
        assert_eq!(parse_field(&format!("{snapshot},0")), None);
    }
}
