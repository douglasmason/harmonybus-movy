//! Validated host command; chord/scale construction stays in HarmonyBus.
#[derive(Clone,Debug,PartialEq,Eq)]
pub struct Selection {pub track:usize,pub pitch:u8,pub payload:String}
impl Selection {
    pub fn parse(value:&str)->Option<Self>{
        let fields=value.split(',').map(str::parse::<usize>).collect::<Result<Vec<_>,_>>().ok()?;
        if !matches!(fields.len(),8|10|11)||fields[0]>=16||fields[1]>=12||fields[2]>12||fields[3]>16||fields[4]>3||fields[5]>=12||!(1..=19).contains(&fields[6])||fields[7]>12{return None;}
        if fields.len()>=10&&(fields[8]>13||fields[9]>6){return None;}
        if fields.len()==11&&fields[10]>135{return None;}
        Some(Self{track:fields[0],pitch:60+fields[1] as u8,payload:value.split_once(',')?.1.into()})
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn tracks_are_movy_indices_and_bad_commands_are_atomic(){
        let chosen=Selection::parse("0,10,1,0,1,0,1,12").unwrap();
        assert_eq!((chosen.track,chosen.pitch),(0,70));
        assert!(Selection::parse("0,0,0,3,3,0,1,12,3,4").is_some());
        assert!(Selection::parse("0,0,0,3,3,0,1,12,3,7").is_none());
        assert!(Selection::parse("0,0,0,3,3,0,1,12,14,4").is_none());
        for range in 0..=7 {assert!(Selection::parse(&format!("0,0,0,3,3,0,1,12,3,4,{range}")).is_some());}
        for top in 0..=127 {assert!(Selection::parse(&format!("0,0,0,3,3,0,1,12,3,4,{}",top+8)).is_some());}
        assert!(Selection::parse("0,0,0,3,3,0,1,12,3,4,136").is_none());
        assert!(Selection::parse("0,0,0,3,3,0,1,12,3,4,-1").is_none());
        for invalid in ["0,10,1", "16,10,1,0,1,0,1,12","0,12,1,0,1,0,1,12","0,10,1,0,1,0,0,12","0,10,1,0,1,0,1,12,0"] {assert!(Selection::parse(invalid).is_none());}
    }
}
