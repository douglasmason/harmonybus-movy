//! Nondestructive recorded-input expression. Stable per clip, independent per
//! track; simultaneous notes share an offset. No delay queue or live-note path.
#[derive(Clone, Copy, Debug, Default)]
pub struct Humanize { pub timing: u32, pub velocity: u32, pub gate: u32, pub tracks: u16, pub followers: u16 }
impl Humanize {
    pub fn parse(text: &str, followers: u16) -> Self {
        let values: Vec<_> = text.split(',').collect();
        if values.len()!=5 || values[0]!="hu1" { return Self::default(); }
        let fields: Option<Vec<u32>> = values[1..].iter().map(|value|value.parse().ok()).collect();
        let Some(fields)=fields else {return Self::default()};
        if fields[..3].iter().any(|value|*value>30)||fields[3]>65535{return Self::default();}
        Self{timing:fields[0],velocity:fields[1],gate:fields[2],tracks:fields[3] as u16,followers}
    }
    pub fn seed(track: usize, clip: usize, tick: u32) -> u32 {
        let mut value=(track as u32+1).wrapping_mul(0x9e3779b9)^(clip as u32+1).wrapping_mul(0x85ebca6b)^tick.wrapping_mul(0xc2b2ae35);
        value^=value>>16;value=value.wrapping_mul(0x7feb352d);value^=value>>15;
        value=value.wrapping_mul(0x846ca68b);value^(value>>16)
    }
    fn offset(seed: u32, amount: u32) -> i64 { (seed as u64%(amount as u64*2+1)) as i64-amount as i64 }
    pub fn time_active(self,track:usize)->bool{self.followers&(1<<track)!=0&&(self.timing>0||self.gate>0)}
    pub fn onset(self,track:usize,seed:u32,tick:u32,start:u32,end:u32,bpm:u32,num:u8,den:u8)->u32{
        if self.followers&(1<<track)==0||self.timing==0{return tick;}
        let max_ticks=(self.timing as u64*bpm as u64*96*num.max(1) as u64/(6_000_000*den.max(1) as u64)) as u32;
        (tick as i64+Self::offset(seed,max_ticks)).clamp(start as i64,end.saturating_sub(1).max(start) as i64) as u32
    }
    pub fn velocity(self,track:usize,seed:u32,velocity:u8)->u8{
        if self.tracks&(1<<track)==0||self.velocity==0||velocity==0{return velocity;}
        let percent=100+Self::offset(seed.rotate_left(11),self.velocity);
        ((velocity as i64*percent+50)/100).clamp(1,127) as u8
    }
    pub fn duration(self,track:usize,seed:u32,ticks:u32)->u32{
        if self.followers&(1<<track)==0||self.gate==0{return ticks.max(1);}
        let percent=100+Self::offset(seed.rotate_left(21),self.gate);
        ((ticks as i64*percent+50)/100).clamp(1,u32::MAX as i64) as u32
    }
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn timing_is_signed_grouped_and_conductors_stay_exact(){
        let config=Humanize::parse("hu1,30,20,30,3",1);
        let mut early=false;let mut late=false;
        for tick in 96..192 {
            let seed=Humanize::seed(0,0,tick);
            let onset=config.onset(0,seed,tick,0,384,12000,1,1);
            early|=onset<tick;late|=onset>tick;
            assert!(onset.abs_diff(tick)<=5);
            assert_eq!(config.onset(1,seed,tick,0,384,12000,1,1),tick);
            assert_eq!(config.duration(1,seed,24),24);
            assert!((70..=130).contains(&config.duration(0,seed,100)));
            assert!((80..=120).contains(&config.velocity(0,seed,100)));
            assert_eq!(config.velocity(2,seed,100),100);
        }
        assert!(early&&late);
        assert_ne!(Humanize::seed(0,0,96),Humanize::seed(1,0,96));
        assert_eq!(config.onset(0,0,0,0,384,12000,1,1),0);
        assert_eq!(config.velocity(0,1,0),0);
        assert_eq!(Humanize::parse("hu1,31,0,0,3",1).timing,0);
    }
}
