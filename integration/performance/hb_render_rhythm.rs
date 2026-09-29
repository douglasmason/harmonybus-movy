//! Runtime onset warping. Stored notes, gates and pressure offsets are untouched.
//! Keep the four weights identical to HarmonyBus src/render_rhythm.h.
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct Rhythm { pub pattern: u8, pub window: u8 }
impl Rhythm {
    pub fn parse(message: &str) -> Option<Self> {
        let mut fields=message.split(',');
        if fields.next()? != "rr1" {return None;}
        let pattern=fields.next()?.parse::<u8>().ok()?;
        let window=fields.next()?.parse::<u8>().ok()?;
        if pattern>5 || window>1 || fields.next().is_some() {return None;}
        Some(Self{pattern,window})
    }
    pub fn enabled(self) -> bool {self.pattern>=2}
    pub fn tick(self,tick:u32,start:u32,end:u32) -> u32 {
        if !self.enabled() || end<=start {return tick;}
        let span=crate::PPQN as u64 * if self.window==0 {1} else {4};
        let position=tick as u64;
        let base=position/span*span;
        let lo=base.max(start as u64);let hi=(base+span).min(end as u64);
        if position<lo || position>=hi {return tick;}
        // Partial windows at loop edges remain inside the loop.
        let length=hi-lo;let phase=(position-lo)*4;
        let step=(phase/length) as usize;let frac=phase%length;
        let weights:[[u64;4];6]=[[1,1,1,1],[1,1,1,1],[3,1,3,1],[1,3,1,3],[4,3,2,1],[1,2,3,4]];
        let w=weights[self.pattern as usize];let total:u64=w.iter().sum();
        let before:u64=w[..step].iter().sum();
        (lo+((before*length+frac*w[step]+total/2)/total).min(length-1)) as u32
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn matching_vectors_and_bounds() {
        for (pattern,expected) in [(2,[0,36,48,84]),(3,[0,12,48,60]),(4,[0,38,67,86]),(5,[0,10,29,58])] {
            let r=Rhythm{pattern,window:0};
            for (i,want) in expected.into_iter().enumerate() {assert_eq!(r.tick(i as u32*24,0,96),want);}
        }
        for pattern in 0..6 {for window in 0..2 {let r=Rhythm{pattern,window};
            let mut previous=13;
            for tick in 13..173 {let warped=r.tick(tick,13,173);assert!(warped>=previous&&warped<173);previous=warped;}
        }}
        assert!(Rhythm::parse("rr1,6,0").is_none());assert!(Rhythm::parse("rr1,2,1,junk").is_none());
    }
}
