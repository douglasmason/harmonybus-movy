//! Saved input coordinates, independent of output harmony and transpose.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InputKey { pub root: u8, pub scale: u8, pub transpose: i8 }
pub const SCALES: [[i32;7];9] = [
    [0,2,4,5,7,9,11], [0,2,3,5,7,8,10], [0,2,3,5,7,9,10],
    [0,1,3,5,7,8,10], [0,2,4,6,7,9,11], [0,2,4,5,7,9,10],
    [0,1,3,5,6,8,10], [0,2,3,5,7,8,11], [0,2,3,5,7,9,11],
];
impl InputKey {
    pub fn role(self, pitch: u8, target: Self) -> (i8,i16) {
        let pc=(pitch as i32+self.transpose as i32-self.root as i32).rem_euclid(12);
        let source=&SCALES[self.scale as usize-1];
        if let Some(degree)=source.iter().position(|&interval|interval==pc) {return (degree as i8,-1);}
        let degree=[0,1,1,2,2,3,3,4,5,5,6,6][pc as usize];
        let distance=source.iter().find(|&&interval|interval>pc).map_or(12-pc,|&interval|interval-pc);
        let next=(pitch as i32+distance).min(127) as u8;
        (degree,self.project(next,target) as i16+self.transpose as i16)
    }
    pub fn new(root: u8, scale: u8) -> Option<Self> {
        (root<12 && (1..=9).contains(&scale)).then_some(Self {root,scale,transpose:0})
    }
    /// Diatonic degree and octave are invariant. Chromatic notes retain their
    /// semitone distance below the next scale degree, including across C.
    pub fn project(self, pitch: u8, target: Self) -> u8 {
        let offset=pitch as i32+self.transpose as i32-self.root as i32;
        let mut octave=offset.div_euclid(12);
        let pc=offset.rem_euclid(12);
        let source=&SCALES[self.scale as usize-1];
        let (degree,alteration)=match source.iter().position(|&interval|interval>=pc) {
            Some(degree)=>(degree,pc-source[degree]),
            None=>{octave+=1;(0,pc-12)},
        };
        let mut mapped=octave*12+target.root as i32+SCALES[target.scale as usize-1][degree]+alteration-self.transpose as i32;
        // Preserve pitch class at MIDI limits instead of clamping to C/G.
        while mapped<0 { mapped+=12; }
        while mapped>127 { mapped-=12; }
        mapped as u8
    }
}

pub fn parse(message: &str) -> Option<(InputKey,u16)> {
    let mut fields=message.split(',');
    if fields.next()? != "fic1" { return None; }
    let key=InputKey::new(fields.next()?.parse().ok()?,fields.next()?.parse().ok()?)?;
    let mask=fields.next()?.parse().ok()?;
    if fields.next().is_some() { return None; }
    Some((key,mask))
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn every_degree_in_every_key_and_scale() {
        for root in 0..12 { for scale in 1..=9 { for target_root in 0..12 { for target_scale in 1..=9 {
            let source=InputKey::new(root,scale).unwrap();
            let target=InputKey::new(target_root,target_scale).unwrap();
            for degree in 0..7 {
                let pitch=48+root+SCALES[scale as usize-1][degree] as u8;
                assert_eq!(source.project(pitch,target),48+target_root+SCALES[target_scale as usize-1][degree] as u8);
            }
        }}}}
    }
    #[test] fn approach_octave_and_identity() {
        let major=InputKey::new(0,1).unwrap();let minor=InputKey::new(2,2).unwrap();
        assert_eq!(major.project(64,minor),65); // third: E -> F
        assert_eq!(major.project(63,minor),64); // below third: Eb -> E
        for root in 0..12 { for scale in 1..=9 { for pitch in 0..128 {
            let key=InputKey::new(root,scale).unwrap();assert_eq!(key.project(pitch,key),pitch);
        }}}
    }
}
